/**
 * Mirror of `ApiMarketEscrowV2Types.Job` — the on-chain struct returned by
 * `getJob(jobId)` / `getPayment(jobId)`.
 *
 * Numeric fields come back as `bigint` through viem. `address` is 0x-prefixed.
 */
export interface OnChainJob {
  buyer: `0x${string}`;
  seller: `0x${string}`;
  apiId: bigint;
  amount: bigint;
  taskType: `0x${string}`;
  inputsHash: `0x${string}`;
  responseHash: `0x${string}`;
  evidenceURI: string;
  createdAt: bigint;
  completed: boolean;
  refunded: boolean;
}

/** Lifecycle state derived from the Job flags. */
export enum JobStatus {
  PENDING = "PENDING",
  COMPLETED = "COMPLETED",
  REFUNDED = "REFUNDED",
}

export function jobStatus(job: Pick<OnChainJob, "completed" | "refunded">): JobStatus {
  if (job.completed) return JobStatus.COMPLETED;
  if (job.refunded) return JobStatus.REFUNDED;
  return JobStatus.PENDING;
}
