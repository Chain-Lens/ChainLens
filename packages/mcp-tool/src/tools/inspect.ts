/**
 * `chain-lens.inspect` — deep-dive on a single listing.
 *
 * Thin wrapper over `GET /api/market/listings/:id`. Compared to
 * `chain-lens.discover` (which returns ranked lists), inspect targets the
 * "I picked listing #7 — how do I actually call it?" step: full metadata
 * including example_request / example_response, the 30-day stats, a 7-day
 * error breakdown (seller_5xx vs seller_timeout vs metadata_error so the
 * agent can decide whether to retry or pick a different listing), and a
 * human-readable priceUsdc display string.
 *
 * The error breakdown in particular is a token-efficiency play: the agent
 * learns "this listing fails 40% of the time with metadata_error — seller
 * endpoint URL is probably wrong, not a transient blip" in one round trip,
 * instead of burning a paid call to find out.
 */

export interface InspectInput {
  listing_id: string;
}

export interface InspectDeps {
  apiBaseUrl: string;
  fetch: typeof fetch;
}

export interface InspectStats {
  successRate: number;
  avgLatencyMs: number;
  totalCalls: number;
  successes: number;
  lastCalledAt: string | null;
  windowDays: number;
}

export interface InspectRecentErrors {
  windowDays: number;
  totalFailures: number;
  breakdown: Record<string, number>;
}

export interface InspectMetadata {
  name?: string;
  description?: string;
  endpoint?: string;
  method?: "GET" | "POST";
  pricing?: { amount?: string; unit?: string };
  tags?: string[];
  inputs_schema?: unknown;
  example_request?: unknown;
  example_response?: unknown;
  [k: string]: unknown;
}

export interface InspectResult {
  listingId: string;
  owner: string;
  payout: string;
  active: boolean;
  metadataURI: string;
  metadata: InspectMetadata | null;
  metadataError?: string;
  stats: InspectStats;
  score: number;
  recentErrors: InspectRecentErrors;
  /** Display-formatted USDC price, derived client-side. */
  priceUsdc: string | null;
}

export async function inspectHandler(
  input: InspectInput,
  deps: InspectDeps,
): Promise<InspectResult> {
  if (!/^\d+$/.test(input.listing_id)) {
    throw new Error("chain-lens.inspect: listing_id must be a decimal string");
  }

  const url = `${deps.apiBaseUrl}/market/listings/${input.listing_id}`;
  const res = await deps.fetch(url);
  if (!res.ok) {
    throw new Error(
      `chain-lens.inspect: backend returned ${res.status} ${res.statusText}`,
    );
  }
  const body = (await res.json()) as Omit<InspectResult, "priceUsdc">;

  return {
    ...body,
    priceUsdc: formatPriceUsdc(body.metadata?.pricing?.amount),
  };
}

function formatPriceUsdc(atomic: string | undefined): string | null {
  if (typeof atomic !== "string" || !/^\d+$/.test(atomic)) return null;
  return (Number(atomic) / 1_000_000).toFixed(6) + " USDC";
}

export const inspectToolDefinition = {
  name: "chain-lens.inspect",
  description:
    "Deep-dive on a single ChainLens listing before calling it. Returns full metadata (including inputs_schema + example_request/example_response), 30-day quality stats, 7-day error breakdown (seller_5xx / seller_timeout / metadata_error / etc.), ranking score, and a human-readable priceUsdc. Token-efficient way to decide whether to call, retry, or skip a listing.",
  inputSchema: {
    type: "object",
    required: ["listing_id"],
    properties: {
      listing_id: {
        type: "string",
        description:
          "Decimal on-chain listingId — typically from chain-lens.discover results.",
      },
    },
  },
} as const;