/**
 * Thin helpers for reading ChainLensMarket state from the configured RPC.
 *
 * Shared by market.routes (read-and-serve), market-listener (event-driven
 * DB sync + boot catch-up) and health.routes (liveness lag detection).
 * Keeping the viem reads in one place means only this file cares about the
 * ABI shape / address resolution / metadataURI format.
 */

import {
  ChainLensMarketAbi,
  CHAIN_LENS_MARKET_ADDRESSES,
  USDC_ADDRESSES,
} from "@chain-lens/shared";
import { publicClient } from "../config/viem.js";
import { env } from "../config/env.js";

export interface ListingMetadata {
  name?: string;
  description?: string;
  endpoint: string;
  method?: "GET" | "POST";
  pricing?: { amount?: string; unit?: string };
  inputs_schema?: unknown;
  output_schema?: unknown;
  example_request?: unknown;
  example_response?: unknown;
  tags?: string[];
  /** Maximum seller response time in milliseconds. Default: 5000. */
  max_latency_ms?: number;
  /** Free-text category used for SDK fallback routing. */
  task_category?: string;
  /** Human-readable category (fallback for task_category). */
  category?: string;
  [k: string]: unknown;
}

/** Runtime-resolved configuration derived from listing metadata. */
export interface ListingRuntimeConfig {
  /** Atomic USDC string (e.g. "50000"), or null if not declared. */
  priceAtomic: string | null;
  /** Seller call timeout in ms. */
  maxLatencyMs: number;
  /** Free-text category for fallback routing. */
  taskCategory: string;
  /** JSON Schema for response validation, or null if absent. */
  outputSchema: unknown | null;
}

/** Derive stable runtime config from raw listing metadata. */
export function resolveListingRuntimeConfig(meta: ListingMetadata): ListingRuntimeConfig {
  return {
    priceAtomic: meta.pricing?.amount ?? null,
    maxLatencyMs:
      typeof meta.max_latency_ms === "number" && meta.max_latency_ms > 0
        ? meta.max_latency_ms
        : 5000,
    taskCategory:
      (meta.task_category as string | undefined) ??
      (meta.category as string | undefined) ??
      (Array.isArray(meta.tags) ? (meta.tags[0] as string | undefined) : undefined) ??
      "general",
    outputSchema: meta.output_schema ?? null,
  };
}

export interface OnChainListing {
  owner: `0x${string}`;
  payout: `0x${string}`;
  metadataURI: string;
  active: boolean;
}

export function marketAddress(): `0x${string}` {
  if (env.CHAIN_LENS_MARKET_ADDRESS) {
    return env.CHAIN_LENS_MARKET_ADDRESS as `0x${string}`;
  }
  const chainId = publicClient.chain?.id;
  if (chainId === undefined) {
    throw new Error("publicClient.chain not configured");
  }
  const addr = CHAIN_LENS_MARKET_ADDRESSES[chainId];
  if (!addr || /^0x0+$/.test(addr)) {
    throw new Error(`ChainLensMarket not deployed on chainId=${chainId}`);
  }
  return addr as `0x${string}`;
}

export function marketAddressOrNull(): `0x${string}` | null {
  try {
    return marketAddress();
  } catch {
    return null;
  }
}

export function usdcAddress(): `0x${string}` {
  const chainId = publicClient.chain?.id;
  if (chainId === undefined) throw new Error("publicClient.chain not configured");
  return USDC_ADDRESSES[chainId] as `0x${string}`;
}

/**
 * Parse a metadataURI into a ListingMetadata object. Supports:
 *   - `data:application/json,<json>` or `data:application/json;base64,<b64>`
 *   - `http(s)://…` fetched JSON
 *   - bare `{...}` JSON literal (convenience for short metadata)
 */
export async function resolveMetadata(uri: string): Promise<ListingMetadata> {
  const trimmed = uri.trim();
  if (!trimmed) throw new Error("empty metadataURI");

  if (trimmed.startsWith("data:")) {
    const comma = trimmed.indexOf(",");
    if (comma === -1) throw new Error("malformed data URI");
    const head = trimmed.slice(5, comma);
    const body = trimmed.slice(comma + 1);
    const decoded = head.includes(";base64")
      ? Buffer.from(body, "base64").toString("utf-8")
      : decodeURIComponent(body);
    return JSON.parse(decoded) as ListingMetadata;
  }

  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed) as ListingMetadata;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    const res = await fetch(trimmed, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`metadata fetch ${res.status}`);
    return (await res.json()) as ListingMetadata;
  }

  throw new Error("unsupported metadataURI scheme (use data:, http(s):, or raw JSON)");
}

export async function readListing(listingId: bigint): Promise<OnChainListing> {
  return (await publicClient.readContract({
    address: marketAddress(),
    abi: ChainLensMarketAbi,
    functionName: "getListing",
    args: [listingId],
  })) as OnChainListing;
}

export async function nextListingId(): Promise<bigint> {
  return (await publicClient.readContract({
    address: marketAddress(),
    abi: ChainLensMarketAbi,
    functionName: "nextListingId",
  })) as bigint;
}

// 5-minute TTL cache to avoid reading serviceFeeBps on every call
let _feeBpsCache: { value: number; expiresAt: number } | null = null;
const FEE_BPS_TTL_MS = 5 * 60 * 1000;
const FEE_BPS_DEFAULT = 250;

export async function readServiceFeeBps(): Promise<number> {
  const now = Date.now();
  if (_feeBpsCache && now < _feeBpsCache.expiresAt) return _feeBpsCache.value;
  try {
    const bps = (await publicClient.readContract({
      address: marketAddress(),
      abi: ChainLensMarketAbi,
      functionName: "serviceFeeBps",
    })) as number;
    _feeBpsCache = { value: bps, expiresAt: now + FEE_BPS_TTL_MS };
    return bps;
  } catch {
    return FEE_BPS_DEFAULT;
  }
}

/** Calculate fee and net amounts given gross atomic amount and fee bps. */
export function calcFeeAndNet(
  amountAtomic: string,
  feeBps: number,
): { fee: string; net: string } {
  const gross = BigInt(amountAtomic);
  const fee = (gross * BigInt(feeBps)) / 10000n;
  const net = gross - fee;
  return { fee: fee.toString(), net: net.toString() };
}
