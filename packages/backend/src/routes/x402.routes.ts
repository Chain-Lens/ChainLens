import { Router, Request, Response, NextFunction } from "express";
import { parseEventLogs, keccak256, stringToBytes } from "viem";
import {
  ApiMarketEscrowV2Abi,
  CONTRACT_ADDRESSES_V2,
  USDC_ADDRESSES,
} from "@chain-lens/shared";
import { publicClient } from "../config/viem.js";
import { env } from "../config/env.js";
import prisma from "../config/prisma.js";
import { getEvidence } from "../services/evidence.service.js";
import { prismaEvidenceStore } from "../services/evidence-store.js";
import { executeJob } from "../services/job-execution.service.js";
import { logger } from "../utils/logger.js";

const router = Router();

const TERMINAL_STATUSES = new Set(["COMPLETED", "REFUNDED", "FAILED"]);
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 120_000;

function escrowAddress(): `0x${string}` {
  const chainId = publicClient.chain?.id;
  if (chainId === undefined) throw new Error("publicClient.chain not configured");
  return CONTRACT_ADDRESSES_V2[chainId] as `0x${string}`;
}

function usdcAddress(): `0x${string}` {
  const chainId = publicClient.chain?.id;
  if (chainId === undefined) throw new Error("publicClient.chain not configured");
  return USDC_ADDRESSES[chainId] as `0x${string}`;
}

// Canonical JSON: object keys sorted; arrays preserve order. Must match the
// mcp-tool's `stableStringify` so the inputsHash derived here equals the
// one the buyer signed into createJobWithAuth.
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

function canonicalInputsHash(inputs: unknown): `0x${string}` {
  return keccak256(stringToBytes(stableStringify(inputs)));
}

function build402Payload(api: {
  id: string;
  onChainId: number | null;
  name: string;
  price: string;
  sellerAddress: string;
  category: string;
}): unknown {
  const chainId = publicClient.chain?.id ?? 84532;
  return {
    error: "Payment Required",
    x402Version: 1,
    accepts: [
      {
        scheme: "exact",
        network: chainId === 8453 ? "base" : "base-sepolia",
        maxAmountRequired: api.price,
        resource: `${env.PLATFORM_URL.replace(/\/+$/, "")}/api/x402/${api.id}`,
        description: `ChainLens API listing "${api.name}"`,
        mimeType: "application/json",
        payTo: escrowAddress(),
        asset: usdcAddress(),
        maxTimeoutSeconds: POLL_TIMEOUT_MS / 1000,
        extra: {
          name: "USDC",
          version: "2",
          chainlens: {
            apiId: api.onChainId,
            seller: api.sellerAddress,
            taskType: api.category,
            escrow: escrowAddress(),
            escrowFunction: "createJobWithAuth",
            buyerInstructions:
              "POST this same URL with body {inputs: {...}} and header " +
              "X-Payment-Tx: 0x<createJobWithAuth tx hash>. The server " +
              "verifies hash(inputs) matches the inputsHash you signed, " +
              "calls the seller, and returns the response inline. " +
              "Build inputsHash with canonical JSON + keccak256 (same as mcp-tool).",
          },
        },
      },
    ],
  };
}

/**
 * x402-flavored HTTP facade over the V2 escrow job flow.
 *
 * GET  /api/x402/:apiId        → 402 (discovery; always)
 * POST /api/x402/:apiId        → 402 without X-Payment-Tx, or
 *                                verifies + executes + returns 200 with it.
 *
 * The POST body carries the seller's inputs as JSON; the server
 * canonical-hashes them and checks against the inputsHash the buyer signed
 * into createJobWithAuth. If they match we kick the execution pipeline
 * (same `executeJob` the mcp-tool hits via /jobs/execute) and poll the
 * evidence store until a terminal state or the 120s wall clock.
 */

// GET — 402 discovery only. Buyer follows up with POST.
router.get("/:apiId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const api = await prisma.apiListing.findUnique({ where: { id: req.params["apiId"] as string } });
    if (!api || api.status !== "APPROVED" || api.onChainId === null) {
      res.status(404).json({ error: "API not found or not approved" });
      return;
    }
    res.status(402).json(build402Payload(api));
  } catch (err) {
    next(err);
  }
});

// POST — 402 discovery (no header) OR verification + execution (with header).
router.post("/:apiId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiIdParam = req.params["apiId"] as string;

    const api = await prisma.apiListing.findUnique({ where: { id: apiIdParam } });
    if (!api || api.status !== "APPROVED" || api.onChainId === null) {
      res.status(404).json({ error: "API not found or not approved" });
      return;
    }

    const txHashRaw = req.headers["x-payment-tx"];
    const txHash = Array.isArray(txHashRaw) ? txHashRaw[0] : txHashRaw;

    // ─── no payment header → 402 ────────────────────────────────────────
    if (!txHash) {
      res.status(402).json(build402Payload(api));
      return;
    }

    // inputs required when paying — server needs them to call the seller.
    const inputs = (req.body as { inputs?: unknown })?.inputs;
    if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) {
      res.status(400).json({
        error: "body must include { inputs: { ... } } (JSON object)",
      });
      return;
    }

    // ─── verify tx ───────────────────────────────────────────────────────
    let receipt;
    try {
      receipt = await publicClient.getTransactionReceipt({
        hash: txHash as `0x${string}`,
      });
    } catch {
      res.status(400).json({ error: "Transaction not found or not confirmed" });
      return;
    }

    if (receipt.status !== "success") {
      res.status(400).json({ error: "Transaction failed on-chain" });
      return;
    }

    const jobLogs = parseEventLogs({
      abi: ApiMarketEscrowV2Abi,
      logs: receipt.logs,
      eventName: "JobCreated",
    });
    const escrow = escrowAddress().toLowerCase();
    const match = jobLogs.find((l) => l.address.toLowerCase() === escrow);
    if (!match) {
      res.status(400).json({
        error: "No JobCreated event from the v2 escrow in this tx",
      });
      return;
    }

    const args = (match as unknown as {
      args: {
        jobId: bigint;
        buyer: string;
        seller: string;
        taskType: `0x${string}`;
        amount: bigint;
        inputsHash: `0x${string}`;
        apiId: bigint;
      };
    }).args;

    if (Number(args.apiId) !== api.onChainId) {
      res.status(400).json({
        error: `Payment is for apiId ${args.apiId.toString()}, expected ${api.onChainId}`,
      });
      return;
    }
    if (args.amount < BigInt(api.price)) {
      res.status(400).json({
        error: `Insufficient amount: ${args.amount.toString()} < ${api.price}`,
      });
      return;
    }

    // hash(inputs) must match what the buyer signed.
    const expectedHash = canonicalInputsHash(inputs);
    if (expectedHash.toLowerCase() !== args.inputsHash.toLowerCase()) {
      res.status(400).json({
        error:
          "Input hash mismatch: provided inputs don't match the inputsHash " +
          "in the JobCreated event. Make sure canonical JSON stringify + " +
          "keccak256(utf8) gives exactly the hash you signed.",
        expected: args.inputsHash,
        got: expectedHash,
      });
      return;
    }

    // ─── trigger execution ───────────────────────────────────────────────
    // V2 listener only records the Job row; nothing auto-kicks the gateway
    // pipeline. We invoke executeJob inline (same entrypoint mcp-tool uses
    // via /jobs/execute). Duplicate calls are harmless — executeJob's
    // PAID-only guard short-circuits if the pipeline is already running.
    try {
      await executeJob({
        jobId: args.jobId,
        seller: args.seller as `0x${string}`,
        taskType: api.category,
        inputs: inputs as Record<string, unknown>,
        amount: args.amount,
        apiId: BigInt(api.onChainId),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // "expected PAID" means another path already kicked the pipeline;
      // that's fine, fall through to polling.
      if (!/expected PAID/i.test(msg)) {
        logger.warn(
          { jobId: args.jobId.toString(), err: msg },
          "x402 executeJob trigger returned non-fatal error",
        );
      }
    }

    // ─── poll evidence until terminal ────────────────────────────────────
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const evidence = await getEvidence(args.jobId, prismaEvidenceStore);
      if (evidence && TERMINAL_STATUSES.has(evidence.status)) {
        logger.info(
          { jobId: args.jobId.toString(), txHash, status: evidence.status },
          "x402 payment redeemed",
        );
        res.status(200).json({
          jobId: args.jobId.toString(),
          status: evidence.status,
          response: evidence.response,
          responseHash: evidence.responseHash,
          evidenceURI: evidence.evidenceURI,
          errorReason: evidence.errorReason,
        });
        return;
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    res.status(504).json({
      error: "Timed out waiting for job completion",
      jobId: args.jobId.toString(),
      evidenceURI: `${env.PLATFORM_URL.replace(/\/+$/, "")}/api/evidence/${args.jobId}`,
    });
  } catch (err) {
    next(err);
  }
});

export default router;