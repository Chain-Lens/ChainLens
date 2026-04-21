import { Router, Request, Response, NextFunction } from "express";
import { parseEventLogs } from "viem";
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

/**
 * x402-flavored HTTP facade over the V2 escrow job flow.
 *
 * GET /api/x402/:apiId
 *   no headers                    → 402 Payment Required + x402 accepts[]
 *   X-Payment-Tx: 0x<createJob tx> → verifies tx, waits for evidence, returns inline
 *
 * The 402 response follows the Coinbase x402 v1 shape so standard x402
 * HTTP clients can parse it, but `payTo` points at the ChainLens escrow
 * (not the seller) and `extra.chainlens` describes the required escrow
 * call. A drop-in standard client that only knows "sign ERC-3009 to payTo"
 * can't complete our flow on its own — a ChainLens-aware client
 * (mcp-tool, or any agent wired to call `escrow.createJobWithAuth`)
 * is needed. A future Bridge contract can relax that constraint without
 * changing this endpoint's shape.
 */
router.get("/:apiId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiIdParam = req.params["apiId"] as string;

    const api = await prisma.apiListing.findUnique({ where: { id: apiIdParam } });
    if (!api || api.status !== "APPROVED" || api.onChainId === null) {
      res.status(404).json({ error: "API not found or not approved" });
      return;
    }

    const txHashRaw = req.headers["x-payment-tx"];
    const txHash = Array.isArray(txHashRaw) ? txHashRaw[0] : txHashRaw;

    // ─── Step 1: no payment header → 402 with x402 accepts[] ────────────
    if (!txHash) {
      const chainId = publicClient.chain?.id ?? 84532;
      res.status(402).json({
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
                  "Sign an EIP-3009 TransferWithAuthorization with " +
                  "`to` = payTo (escrow). Call " +
                  "escrow.createJobWithAuth(seller, keccak256(taskType), " +
                  "amount, inputsHash, apiId, validAfter, validBefore, " +
                  "nonce, v, r, s). Retry this URL with the resulting tx " +
                  "hash in X-Payment-Tx.",
              },
            },
          },
        ],
      });
      return;
    }

    // ─── Step 2: verify the payment tx is a JobCreated on our V2 escrow ──
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
    const match = jobLogs.find(
      (l) => l.address.toLowerCase() === escrow,
    );
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
        taskType: string;
        amount: bigint;
        inputsHash: string;
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

    // ─── Step 3: poll evidence until terminal ────────────────────────────
    //
    // The V2 event listener has already kicked off gateway execution on
    // JobCreated, so we don't trigger it again — just wait for evidence
    // to reach a terminal state. This is the single-HTTP-round x402 UX
    // the spec calls for.
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
