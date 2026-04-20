/**
 * `chain-lens.discover` — find registered API listings for a task type.
 *
 * Thin wrapper over `GET /api/apis` so Claude Desktop (and other MCP clients)
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

export interface ApiListingItem {
  id: string;
  onChainId: number;
  name: string;
  description: string;
  price: string;
  priceUsdc: string;
  category: string;
  sellerAddress: string;
  status: string;
  createdAt: string;
}

export interface DiscoverResult {
  items: ApiListingItem[];
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
    ? `${deps.apiBaseUrl}/apis?${qs}`
    : `${deps.apiBaseUrl}/apis`;

  const res = await deps.fetch(url);
  if (!res.ok) {
    throw new Error(`chain-lens.discover: backend returned ${res.status} ${res.statusText}`);
  }
  const page = (await res.json()) as {
    items: ApiListingItem[];
    total: number;
    limit: number;
    offset: number;
  };
  const items = page.items.map((item) => ({
    ...item,
    priceUsdc: (Number(item.price) / 1_000_000).toFixed(6) + " USDC",
  }));
  return { items, total: page.total, limit: page.limit, offset: page.offset };
}

export const discoverToolDefinition = {
  name: "chain-lens.discover",
  description:
    "Find ChainLens APIs listed on the marketplace. Returns name, category, seller address, price in wei and USDC (priceUsdc field). USDC has 6 decimals: 1000000 = 1.000000 USDC.",
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
