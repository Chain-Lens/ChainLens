import type { JobStatus } from "@prisma/client";
import type { EvidenceView } from "./evidence.service.js";

export const JOBS_DEFAULT_LIMIT = 20;
export const JOBS_MAX_LIMIT = 100;

export interface JobFilter {
  buyer?: string;
  seller?: string;
  taskType?: string;
  status?: JobStatus;
  limit?: number;
  offset?: number;
}

export interface NormalizedJobFilter {
  buyer?: string;
  seller?: string;
  taskType?: string;
  status?: JobStatus;
  limit: number;
  offset: number;
}

export interface JobListPage {
  items: EvidenceView[];
  limit: number;
  offset: number;
  total: number;
}

export interface JobsStore {
  list(filter: NormalizedJobFilter): Promise<JobListPage>;
}

export function normalizeFilter(filter: JobFilter): NormalizedJobFilter {
  const limit = Math.min(
    Math.max(Math.floor(filter.limit ?? JOBS_DEFAULT_LIMIT), 1),
    JOBS_MAX_LIMIT,
  );
  const offset = Math.max(Math.floor(filter.offset ?? 0), 0);
  return {
    buyer: filter.buyer?.toLowerCase(),
    seller: filter.seller?.toLowerCase(),
    taskType: filter.taskType,
    status: filter.status,
    limit,
    offset,
  };
}

export async function listJobs(
  filter: JobFilter,
  store: JobsStore,
): Promise<JobListPage> {
  return store.list(normalizeFilter(filter));
}
