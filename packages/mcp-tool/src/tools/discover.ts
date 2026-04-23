/**
 * `chain-lens.discover` — find ChainLens v3 listings matching a query.
 *
 * Thin wrapper over `GET /api/market/listings`. The Gateway does the heavy
 * lifting: on-chain scan, metadata resolution, CallLog aggregation, Laplace-
 * smoothed scoring, weighted-random ranking. This tool just threads query
 * params through and tacks a `priceUsdc` display string onto each result.
 *
 * Default ranking is weighted-random so new listings aren't locked out by
 * established ones — every call has a chance proportional to its score.
 * Pass `sort: "score_strict"` for a deterministic order (debug / admin
 * flows) or `seed: <string>` for reproducible weighted-random output.
 */

export interface DiscoverInput {
  /** Free-text match on name + description (case-insensitive substring). */
  q?: string;
  /** Exact tag match (case-insensitive). */
  tag?: string;
  /** Floor on recent success rate, 0.0–1.0. */
  min_success_rate?: number;
  /** Ceiling on per-call price in USDC (display units, e.g. 0.05). */
  max_price_usdc?: number;
  /** Max results (1–100). Default 20. */
  limit?: number;
  /** "score" (weighted random, default) | "score_strict" | "latest". */
  sort?: "score" | "score_strict" | "latest";
  /** Seed for weighted-random ranking reproducibility. */
  seed?: string;
}

export interface DiscoverDeps {
  apiBaseUrl: string;
  fetch: typeof fetch;
}

export interface ListingStats {
  successRate: number;
  avgLatencyMs: number;
  totalCalls: number;
  successes: number;
  lastCalledAt: string | null;
  windowDays: number;
}

export interface ListingMetadata {
  name?: string;
  description?: string;
  endpoint?: string;
  method?: "GET" | "POST";
  pricing?: { amount?: string; unit?: string };
  tags?: string[];
  inputs_schema?: unknown;
  output_schema?: unknown;
  example_request?: unknown;
  example_response?: unknown;
  [k: string]: unknown;
}

export interface ListingItem {
  listingId: string;
  owner: string;
  payout: string;
  active: boolean;
  metadata: ListingMetadata | null;
  metadataError?: string;
  stats: ListingStats;
  score: number;
  /** Display-formatted USDC price, derived client-side from metadata.pricing.amount. */
  priceUsdc: string | null;
}

export interface DiscoverResult {
  items: ListingItem[];
  total: number;
  totalBeforeFilter: number;
  limit: number;
  sort: string;
  seed?: string;
}

export async function discoverHandler(
  input: DiscoverInput,
  deps: DiscoverDeps,
): Promise<DiscoverResult> {
  const params = new URLSearchParams();
  if (input.q) params.set("q", input.q);
  if (input.tag) params.set("tag", input.tag);
  if (typeof input.min_success_rate === "number") {
    params.set("min_success_rate", String(input.min_success_rate));
  }
  if (typeof input.max_price_usdc === "number") {
    params.set("max_price_usdc", String(input.max_price_usdc));
  }
  if (typeof input.limit === "number") params.set("limit", String(input.limit));
  if (input.sort) params.set("sort", input.sort);
  if (input.seed) params.set("seed", input.seed);

  const qs = params.toString();
  const url = qs
    ? `${deps.apiBaseUrl}/market/listings?${qs}`
    : `${deps.apiBaseUrl}/market/listings`;

  const res = await deps.fetch(url);
  if (!res.ok) {
    throw new Error(
      `chain-lens.discover: backend returned ${res.status} ${res.statusText}`,
    );
  }
  const page = (await res.json()) as Omit<DiscoverResult, "items"> & {
    items: Array<Omit<ListingItem, "priceUsdc">>;
  };

  const items: ListingItem[] = page.items.map((raw) => ({
    ...raw,
    priceUsdc: formatPriceUsdc(raw.metadata?.pricing?.amount),
  }));

  return {
    items,
    total: page.total,
    totalBeforeFilter: page.totalBeforeFilter,
    limit: page.limit,
    sort: page.sort,
    ...(page.seed ? { seed: page.seed } : {}),
  };
}

function formatPriceUsdc(atomic: string | undefined): string | null {
  if (typeof atomic !== "string" || !/^\d+$/.test(atomic)) return null;
  return (Number(atomic) / 1_000_000).toFixed(6) + " USDC";
}

export const discoverToolDefinition = {
  name: "chain-lens.discover",
  description:
    "Search ChainLens v3 listings like an API search engine. Threads every supported HTTP query to GET /api/market/listings: q, tag, min_success_rate, max_price_usdc, limit, sort, and seed. Returns metadata, endpoint/method, pricing, schemas/examples when sellers provide them, 30-day quality stats, and a ranking score. Default sort is weighted-random by score so new listings stay discoverable — pass sort='score_strict' for deterministic ranking or seed=<string> for reproducible output.",
  inputSchema: {
    type: "object",
    properties: {
      q: {
        type: "string",
        description:
          "Free-text search over listing name + description. Use this as the main search box query, e.g. 'weather', 'stock price', 'news'.",
      },
      tag: {
        type: "string",
        description: "Exact tag match (case-insensitive).",
      },
      min_success_rate: {
        type: "number",
        description:
          "Floor on recent 30-day success rate, 0.0–1.0. Use to filter out flaky sellers.",
      },
      max_price_usdc: {
        type: "number",
        description:
          "Ceiling on per-call price in USDC display units. e.g. 0.05 = 50000 atomic.",
      },
      limit: {
        type: "number",
        description: "Max results (1–100). Default 20.",
      },
      sort: {
        type: "string",
        enum: ["score", "score_strict", "latest"],
        description:
          "Ranking: 'score' = weighted-random by score (default; cold-start-friendly). 'score_strict' = deterministic desc. 'latest' = newest listing first.",
      },
      seed: {
        type: "string",
        description:
          "Seed for reproducible weighted-random ranking. Same seed + same listings → same order.",
      },
    },
  },
} as const;
