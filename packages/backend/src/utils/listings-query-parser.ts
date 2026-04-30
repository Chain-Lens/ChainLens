/**
 * Single source of truth for /api/market/listings query semantics:
 * default sort, limit cap, accepted sort values, optional numeric
 * predicates. Keeping the parser separate means the route layer doesn't
 * mix HTTP concerns with input validation, and the service can be tested
 * with plain options objects (no fake Express required).
 */

import type { Request } from "express";
import type {
  ListingsSearchOptions,
  SortKey,
} from "../services/listings-search.service.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function asNumber(v: unknown): number | undefined {
  if (typeof v !== "string") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function asSortKey(v: unknown): SortKey {
  return v === "latest" || v === "score_strict" ? v : "score";
}

function asLimit(v: unknown): number {
  const n = asNumber(v);
  if (n === undefined || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

export function parseListingsQuery(req: Request): ListingsSearchOptions {
  const qRaw = asString(req.query["q"]);
  const tagRaw = asString(req.query["tag"]);

  return {
    q: qRaw ? qRaw.toLowerCase().trim() : undefined,
    tag: tagRaw ? tagRaw.toLowerCase().trim() : undefined,
    minSuccessRate: asNumber(req.query["min_success_rate"]),
    maxPriceUsdc: asNumber(req.query["max_price_usdc"]),
    sort: asSortKey(req.query["sort"]),
    seed: asString(req.query["seed"]),
    limit: asLimit(req.query["limit"]),
  };
}
