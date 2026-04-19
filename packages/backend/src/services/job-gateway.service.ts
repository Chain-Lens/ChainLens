import { keccak256, stringToBytes } from "viem";
import type { OnChainTaskTypeConfig } from "@chainlens/shared";
import { scanResponse } from "./injection-filter.service.js";
import { validateAgainstSchema } from "./schema-validator.service.js";
import { logger } from "../utils/logger.js";

const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

export interface JobFinalizationInput {
  jobId: bigint;
  seller: `0x${string}`;
  taskType: `0x${string}`;
  response: unknown;
  amountUsdc: bigint;
  evidenceURI: string;
}

export type JobFinalization =
  | {
      status: "submitted";
      responseHash: `0x${string}`;
      evidenceURI: string;
      submitTxHash: `0x${string}`;
    }
  | {
      status: "refunded";
      reason: string;
      details?: unknown;
      refundTxHash: `0x${string}`;
    }
  | {
      status: "failed";
      reason: string;
      details?: unknown;
    };

export interface JobGatewayDeps {
  getConfigById?: (
    id: `0x${string}`,
  ) => Promise<OnChainTaskTypeConfig | null>;
  submitJobOnChain?: (args: {
    jobId: bigint;
    responseHash: `0x${string}`;
    evidenceURI: string;
  }) => Promise<`0x${string}`>;
  refundJobOnChain?: (args: { jobId: bigint }) => Promise<`0x${string}`>;
  recordSellerResult?: (args: {
    seller: `0x${string}`;
    success: boolean;
    earningsUsdc: bigint;
  }) => Promise<`0x${string}` | void>;
}

export async function finalizeJob(
  input: JobFinalizationInput,
  deps: JobGatewayDeps = {},
): Promise<JobFinalization> {
  const getConfigById = deps.getConfigById ?? defaultGetConfigById;
  const submitJobOnChain = deps.submitJobOnChain ?? defaultSubmitJob;
  const refundJobOnChain = deps.refundJobOnChain ?? defaultRefundJob;
  const recordSellerResult =
    deps.recordSellerResult ?? defaultRecordSellerResult;

  if (input.taskType !== ZERO_BYTES32) {
    const cfg = await getConfigById(input.taskType);
    if (!cfg) {
      return refundAndRecord(
        input,
        refundJobOnChain,
        recordSellerResult,
        "task_type_not_found",
      );
    }
    if (!cfg.enabled) {
      return refundAndRecord(
        input,
        refundJobOnChain,
        recordSellerResult,
        "task_type_disabled",
      );
    }
    const scan = scanResponse(input.response);
    if (!scan.clean) {
      return refundAndRecord(
        input,
        refundJobOnChain,
        recordSellerResult,
        `injection_detected:${scan.reason}`,
      );
    }
    if (cfg.schemaURI && cfg.schemaURI.length > 0) {
      try {
        const vr = await validateAgainstSchema(input.response, cfg.schemaURI);
        if (!vr.valid) {
          return refundAndRecord(
            input,
            refundJobOnChain,
            recordSellerResult,
            "schema_invalid",
            vr.errors,
          );
        }
      } catch (e) {
        return refundAndRecord(
          input,
          refundJobOnChain,
          recordSellerResult,
          "schema_fetch_failed",
          e instanceof Error ? e.message : String(e),
        );
      }
    }
  }

  let json: string;
  try {
    const s = JSON.stringify(input.response);
    if (typeof s !== "string") throw new Error("serialized to non-string");
    json = s;
  } catch (e) {
    return refundAndRecord(
      input,
      refundJobOnChain,
      recordSellerResult,
      "response_unserializable",
      e instanceof Error ? e.message : String(e),
    );
  }
  const responseHash = keccak256(stringToBytes(json));

  let submitTxHash: `0x${string}`;
  try {
    submitTxHash = await submitJobOnChain({
      jobId: input.jobId,
      responseHash,
      evidenceURI: input.evidenceURI,
    });
  } catch (e) {
    return {
      status: "failed",
      reason: "submit_failed",
      details: e instanceof Error ? e.message : String(e),
    };
  }

  // Reputation update runs after escrow payout succeeded. If it fails we log
  // and continue — the seller has been paid, so the finalization itself is
  // successful; reputation will catch up when the event-listener reconciles.
  try {
    await recordSellerResult({
      seller: input.seller,
      success: true,
      earningsUsdc: input.amountUsdc,
    });
  } catch (e) {
    logger.error(
      {
        jobId: input.jobId.toString(),
        seller: input.seller,
        err: e instanceof Error ? e.message : e,
      },
      "recordSellerResult failed after submit; reputation out of sync",
    );
  }

  return {
    status: "submitted",
    responseHash,
    evidenceURI: input.evidenceURI,
    submitTxHash,
  };
}

async function refundAndRecord(
  input: JobFinalizationInput,
  refundJobOnChain: NonNullable<JobGatewayDeps["refundJobOnChain"]>,
  recordSellerResult: NonNullable<JobGatewayDeps["recordSellerResult"]>,
  reason: string,
  details?: unknown,
): Promise<JobFinalization> {
  let refundTxHash: `0x${string}`;
  try {
    refundTxHash = await refundJobOnChain({ jobId: input.jobId });
  } catch (e) {
    return {
      status: "failed",
      reason: `refund_failed:${reason}`,
      details: e instanceof Error ? e.message : String(e),
    };
  }
  try {
    await recordSellerResult({
      seller: input.seller,
      success: false,
      earningsUsdc: 0n,
    });
  } catch (e) {
    logger.error(
      {
        jobId: input.jobId.toString(),
        seller: input.seller,
        err: e instanceof Error ? e.message : e,
      },
      "recordSellerResult failed during refund; reputation out of sync",
    );
  }
  return { status: "refunded", reason, details, refundTxHash };
}

// Lazy defaults so unit tests that stub all deps never touch viem/env.
async function defaultGetConfigById(
  id: `0x${string}`,
): Promise<OnChainTaskTypeConfig | null> {
  const mod = await import("./task-type.service.js");
  return mod.getTaskTypeConfigById(id);
}

async function defaultSubmitJob(args: {
  jobId: bigint;
  responseHash: `0x${string}`;
  evidenceURI: string;
}): Promise<`0x${string}`> {
  const mod = await import("./on-chain.service.js");
  return mod.submitJob(args);
}

async function defaultRefundJob(args: {
  jobId: bigint;
}): Promise<`0x${string}`> {
  const mod = await import("./on-chain.service.js");
  return mod.refundJob(args);
}

async function defaultRecordSellerResult(args: {
  seller: `0x${string}`;
  success: boolean;
  earningsUsdc: bigint;
}): Promise<`0x${string}`> {
  const mod = await import("./on-chain.service.js");
  return mod.recordSellerResult(args);
}
