import type { JobStatus, Prisma } from "@prisma/client";

export type { JobStatus };
export type EvidenceAmount = Prisma.Decimal | string | number;

/**
 * Canonical evidence URI: `${PLATFORM_URL}/api/evidence/${onchainJobId}`.
 * The escrow contract stores this string on-chain so any auditor can
 * dereference it back to the stored response.
 */
export function buildEvidenceURI(
  onchainJobId: bigint,
  platformUrl: string,
): string {
  const trimmed = platformUrl.replace(/\/+$/, "");
  return `${trimmed}/api/evidence/${onchainJobId}`;
}

export interface EvidenceRecordInput {
  onchainJobId: bigint;
  buyer: string;
  seller: string;
  apiId: bigint;
  taskType?: string | null;
  amount: Prisma.Decimal | string | number;
  inputs?: unknown;
  inputsHash: string;
  evidenceURI: string;
  status?: JobStatus;
}

export interface EvidenceCompletion {
  status: Extract<JobStatus, "COMPLETED" | "REFUNDED" | "FAILED">;
  response?: unknown;
  responseHash?: string | null;
  errorReason?: string | null;
}

export interface EvidenceView {
  onchainJobId: string;
  buyer: string;
  seller: string;
  apiId: string;
  taskType: string | null;
  amount: string;
  inputs: unknown;
  inputsHash: string;
  response: unknown;
  responseHash: string | null;
  evidenceURI: string | null;
  status: JobStatus;
  errorReason: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface EvidenceStore {
  create(data: EvidenceRecordInput): Promise<void>;
  complete(onchainJobId: bigint, patch: EvidenceCompletion): Promise<void>;
  findByOnchainId(onchainJobId: bigint): Promise<EvidenceView | null>;
}

export async function recordJobPaid(
  input: EvidenceRecordInput,
  store: EvidenceStore,
): Promise<void> {
  await store.create({ ...input, status: input.status ?? "PAID" });
}

export async function recordJobCompletion(
  onchainJobId: bigint,
  completion: EvidenceCompletion,
  store: EvidenceStore,
): Promise<void> {
  await store.complete(onchainJobId, completion);
}

export async function getEvidence(
  onchainJobId: bigint,
  store: EvidenceStore,
): Promise<EvidenceView | null> {
  return store.findByOnchainId(onchainJobId);
}

// The Prisma-backed EvidenceStore lives in ./evidence-store.ts so this file
// stays free of runtime Prisma imports — unit tests import only the pure
// helpers + types above.
