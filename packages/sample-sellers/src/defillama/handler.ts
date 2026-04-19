import { BadInputError, UpstreamError, type TaskHandler } from "../lib/types.js";

export interface DefillamaDeps {
  fetch: typeof fetch;
  baseUrl: string;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function makeTvlHandler(deps: DefillamaDeps): TaskHandler {
  return async (inputs) => {
    const protocol = inputs.protocol;
    if (typeof protocol !== "string" || !SLUG_RE.test(protocol)) {
      throw new BadInputError("invalid protocol slug");
    }
    const res = await deps.fetch(`${deps.baseUrl}/protocol/${protocol}`);
    if (!res.ok) {
      throw new UpstreamError(`DeFiLlama HTTP ${res.status}`, 502);
    }
    const raw = (await res.json()) as Record<string, unknown>;
    return {
      protocol,
      name: typeof raw.name === "string" ? raw.name : null,
      category: typeof raw.category === "string" ? raw.category : null,
      tvl_usd: numberOrNull(raw.tvl),
      chain_tvls: chainTvlSummary(raw.chainTvls),
      fetched_at: new Date().toISOString(),
    };
  };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function chainTvlSummary(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, number> = {};
  for (const [chain, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") continue;
    const tvl = (entry as { tvl?: unknown }).tvl;
    if (typeof tvl === "number" && Number.isFinite(tvl)) {
      out[chain] = tvl;
    }
  }
  return out;
}

export const DEFAULT_DEFILLAMA_BASE = "https://api.llama.fi";
