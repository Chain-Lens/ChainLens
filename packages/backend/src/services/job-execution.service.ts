import type { Prisma } from "@prisma/client";
import prisma from "../config/prisma.js";
import { finalizeJob, refundFailedJob } from "./job-gateway.service.js";
import { assertSafeOutboundUrl } from "../utils/network.js";
import { logger } from "../utils/logger.js";

const EXECUTION_TIMEOUT_MS = 30_000;
const JOB_READY_TIMEOUT_MS = 5_000;
const JOB_READY_POLL_MS = 200;

export interface ExecuteJobInput {
  jobId: bigint;
  seller: `0x${string}`;
  taskType: string;
  inputs: Record<string, unknown>;
  amount: bigint;
  apiId?: bigint;
}

export interface ExecuteJobResult {
  accepted: true;
}

export async function executeJob(input: ExecuteJobInput): Promise<ExecuteJobResult> {
  const job = await waitForJobRecord(input.jobId);
  if (!job) {
    throw new Error(`job ${input.jobId} not found`);
  }

  if (job.status !== "PAID") {
    throw new Error(`job ${input.jobId} is in ${job.status} state, expected PAID`);
  }

  await prisma.job.updateMany({
    where: { onchainJobId: input.jobId },
    data: {
      status: "PENDING",
      inputs: input.inputs as Prisma.InputJsonValue,
    },
  });

  queueExecution(input).catch(async (err) => {
    logger.error(
      {
        jobId: input.jobId.toString(),
        seller: input.seller,
        err: err instanceof Error ? err.message : String(err),
      },
      "Job execution crashed before settlement",
    );
    await prisma.job.updateMany({
      where: { onchainJobId: input.jobId },
      data: {
        status: "FAILED",
        errorReason: err instanceof Error ? err.message : String(err),
        completedAt: new Date(),
      },
    });
  });

  return { accepted: true };
}

async function queueExecution(input: ExecuteJobInput): Promise<void> {
  const listing = await resolveListing(input);
  const evidenceURI = await getEvidenceUri(input.jobId);
  const onchainTaskType = asBytes32(listing.job.taskType) ?? zeroBytes32();
  const safeUrl = await assertSafeOutboundUrl(listing.endpoint);

  logger.info(
    {
      jobId: input.jobId.toString(),
      seller: input.seller,
      endpoint: safeUrl,
      taskType: input.taskType,
    },
    "Executing v2 job",
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXECUTION_TIMEOUT_MS);

  try {
    const response = await fetch(safeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task_type: input.taskType,
        inputs: input.inputs,
        jobId: input.jobId.toString(),
        buyer: listing.job.buyer,
      }),
      signal: controller.signal,
      redirect: "error",
    });

    if (!response.ok) {
      throw new Error(`seller API returned ${response.status}`);
    }

    const result = (await response.json()) as unknown;
    const finalization = await finalizeJob({
      jobId: input.jobId,
      seller: input.seller,
      taskType: onchainTaskType,
      response: result,
      amountUsdc: input.amount,
      evidenceURI,
    });

    if (finalization.status === "submitted") {
      await prisma.job.updateMany({
        where: { onchainJobId: input.jobId },
        data: {
          response: result as never,
          responseHash: finalization.responseHash,
        },
      });
      return;
    }

    if (finalization.status === "refunded") {
      await prisma.job.updateMany({
        where: { onchainJobId: input.jobId },
        data: {
          status: "REFUNDED",
          errorReason: finalization.reason,
          completedAt: new Date(),
        },
      });
      return;
    }

    await prisma.job.updateMany({
      where: { onchainJobId: input.jobId },
      data: {
        status: "FAILED",
        errorReason: `${finalization.reason}${
          finalization.details ? `: ${stringifyDetails(finalization.details)}` : ""
        }`,
        completedAt: new Date(),
      },
    });
  } catch (err) {
    const finalization = await finalizeFailure(
      input,
      onchainTaskType,
      evidenceURI,
      err,
    );
    if (finalization === "failed") {
      throw err;
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function finalizeFailure(
  input: ExecuteJobInput,
  onchainTaskType: `0x${string}`,
  evidenceURI: string,
  err: unknown,
): Promise<"refunded" | "failed"> {
  const errMsg = err instanceof Error ? err.message : String(err);
  // Go straight to refund — no need to thread the happy-path finalizeJob
  // state machine (task-type check, injection scan, schema validation)
  // when we already know the execution itself errored. refundFailedJob
  // wraps the same refundAndRecord path finalizeJob uses internally, so
  // on-chain refund + reputation-recording semantics stay consistent.
  const finalization = await refundFailedJob(
    {
      jobId: input.jobId,
      seller: input.seller,
      taskType: onchainTaskType,
      response: { error: errMsg },
      amountUsdc: input.amount,
      evidenceURI,
    },
    `execution_failed: ${errMsg}`,
  );

  if (finalization.status === "refunded") {
    await prisma.job.updateMany({
      where: { onchainJobId: input.jobId },
      data: {
        status: "REFUNDED",
        errorReason: finalization.reason,
        completedAt: new Date(),
      },
    });
    return "refunded";
  }

  await prisma.job.updateMany({
    where: { onchainJobId: input.jobId },
    data: {
      status: "FAILED",
      errorReason: errMsg,
      completedAt: new Date(),
    },
  });
  return "failed";
}

async function resolveListing(input: ExecuteJobInput): Promise<{
  endpoint: string;
  job: { buyer: string; taskType: string | null };
}> {
  const job = await prisma.job.findFirst({
    where: { onchainJobId: input.jobId },
    select: { buyer: true, taskType: true },
  });
  if (!job) throw new Error(`job ${input.jobId} not found`);

  const listing =
    input.apiId && input.apiId > 0n
      ? await prisma.apiListing.findUnique({
          where: { onChainId: Number(input.apiId) },
          select: { endpoint: true, sellerAddress: true, category: true, status: true },
        })
      : await prisma.apiListing.findFirst({
          where: {
            sellerAddress: input.seller.toLowerCase(),
            category: input.taskType,
            status: "APPROVED",
          },
          orderBy: { updatedAt: "desc" },
          select: { endpoint: true, sellerAddress: true, category: true, status: true },
        });

  if (!listing || listing.status !== "APPROVED") {
    throw new Error("approved listing not found for job execution");
  }
  if (listing.sellerAddress.toLowerCase() !== input.seller.toLowerCase()) {
    throw new Error("listing seller mismatch");
  }
  if (listing.category !== input.taskType) {
    throw new Error("listing task type mismatch");
  }

  return { endpoint: listing.endpoint, job };
}

async function getEvidenceUri(jobId: bigint): Promise<string> {
  const job = await prisma.job.findFirst({
    where: { onchainJobId: jobId },
    select: { evidenceURI: true },
  });
  if (!job?.evidenceURI) {
    throw new Error(`job ${jobId} missing evidenceURI`);
  }
  return job.evidenceURI;
}

function zeroBytes32(): `0x${string}` {
  return "0x0000000000000000000000000000000000000000000000000000000000000000";
}

function asBytes32(value: string | null | undefined): `0x${string}` | null {
  if (typeof value !== "string") return null;
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) return null;
  return value as `0x${string}`;
}

function stringifyDetails(details: unknown): string {
  return details instanceof Error ? details.message : String(details);
}

async function waitForJobRecord(jobId: bigint) {
  const deadline = Date.now() + JOB_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const job = await prisma.job.findFirst({ where: { onchainJobId: jobId } });
    if (job) return job;
    await new Promise<void>((resolve) => setTimeout(resolve, JOB_READY_POLL_MS));
  }
  return prisma.job.findFirst({ where: { onchainJobId: jobId } });
}
