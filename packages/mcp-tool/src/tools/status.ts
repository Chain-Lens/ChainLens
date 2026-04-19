/**
 * `chainlens.status` — fetch stored evidence for a job.
 *
 * Wraps `GET /api/evidence/:jobId`. Returns the full on-chain-hash-verified
 * response payload so Claude can cite the data it used.
 */

export interface StatusInput {
  job_id: string | number | bigint;
}

export interface StatusDeps {
  apiBaseUrl: string;
  fetch: typeof fetch;
}

export interface StatusResult {
  found: boolean;
  evidence?: unknown;
}

export async function statusHandler(
  input: StatusInput,
  deps: StatusDeps,
): Promise<StatusResult> {
  const raw =
    typeof input.job_id === "bigint" ? input.job_id.toString() : String(input.job_id);
  if (!/^\d+$/.test(raw)) {
    throw new Error(`chainlens.status: job_id must be a non-negative integer, got '${raw}'`);
  }
  const res = await deps.fetch(`${deps.apiBaseUrl}/evidence/${raw}`);
  if (res.status === 404) return { found: false };
  if (!res.ok) {
    throw new Error(`chainlens.status: backend returned ${res.status} ${res.statusText}`);
  }
  return { found: true, evidence: await res.json() };
}

export const statusToolDefinition = {
  name: "chainlens.status",
  description:
    "Check the status of a ChainLens job. Returns stored evidence (response payload, hashes, timestamps) for a given on-chain job id.",
  inputSchema: {
    type: "object",
    required: ["job_id"],
    properties: {
      job_id: {
        type: "string",
        description:
          "On-chain job id (uint256). Accepts a decimal string because values may exceed Number.MAX_SAFE_INTEGER.",
      },
    },
  },
} as const;
