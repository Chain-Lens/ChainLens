/**
 * `chainlens.discover` — find registered sellers for a task type.
 *
 * Thin wrapper over `GET /api/sellers` so Claude Desktop (and other MCP clients)
 * can find who serves a given capability before requesting data.
 */

export interface DiscoverInput {
  task_type?: string;
  limit?: number;
  offset?: number;
  active_only?: boolean;
}

export interface DiscoverDeps {
  apiBaseUrl: string;
  fetch: typeof fetch;
}

export interface DiscoverResult {
  items: unknown[];
  total: number;
  limit: number;
  offset: number;
}

export async function discoverHandler(
  input: DiscoverInput,
  deps: DiscoverDeps,
): Promise<DiscoverResult> {
  const params = new URLSearchParams();
  if (input.task_type) params.set("task_type", input.task_type);
  if (typeof input.limit === "number") params.set("limit", String(input.limit));
  if (typeof input.offset === "number") params.set("offset", String(input.offset));
  if (typeof input.active_only === "boolean")
    params.set("active_only", input.active_only ? "true" : "false");

  const qs = params.toString();
  const url = qs
    ? `${deps.apiBaseUrl}/sellers?${qs}`
    : `${deps.apiBaseUrl}/sellers`;

  const res = await deps.fetch(url);
  if (!res.ok) {
    throw new Error(`chainlens.discover: backend returned ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as DiscoverResult;
}

export const discoverToolDefinition = {
  name: "chainlens.discover",
  description:
    "Find ChainLens sellers that serve a given task type. Returns endpoint, price per call, reputation stats.",
  inputSchema: {
    type: "object",
    properties: {
      task_type: {
        type: "string",
        description:
          "Task type name (e.g. 'blockscout_contract_source', 'defillama_tvl'). Omit to list all sellers.",
      },
      limit: { type: "number", description: "Max results (1–100). Default 20." },
      offset: { type: "number", description: "Pagination offset. Default 0." },
      active_only: {
        type: "boolean",
        description: "When true (default), only returns sellers in 'active' status.",
      },
    },
  },
} as const;
