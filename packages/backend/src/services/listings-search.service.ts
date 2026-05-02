/**
 * Listings search orchestration. Owns the read-path of /api/market/listings:
 *
 *   parse input  →  fetch rows (repo)  →  enrich w/ stats + score  →
 *   post-filter  →  rank  →  limit  →  shape response
 *
 * Each collaborator (repo, stats batch, ranker) is injected, so tests can
 * exercise the orchestration without Prisma, without the call-log table,
 * and without re-running the PRNG. The route layer just parses Express
 * and delegates here.
 */

import type {
  DirectoryTrustSignal,
  ListingsRepository,
  ListingsOrder,
} from "../repositories/listing.repository.js";
import type { ListingMetadata } from "./market-chain.service.js";
import { rngFrom, weightedShuffle } from "../utils/ranker.js";
import type { ListingStats } from "./call-log.service.js";
import { scoreListing } from "./call-log.service.js";

export type SortKey = "score" | "score_strict" | "latest";

export interface ListingsSearchOptions {
  q?: string;
  tag?: string;
  minSuccessRate?: number;
  maxPriceUsdc?: number;
  sort: SortKey;
  seed?: string;
  limit: number;
}

export interface ListingsSearchItem {
  listingId: string;
  owner: string;
  metadata: ListingMetadata;
  stats: ListingStats;
  score: number;
  directory?: DirectoryTrustSignal;
}

export interface ListingsSearchResult {
  items: ListingsSearchItem[];
  total: number;
  totalBeforeFilter: number;
  limit: number;
  sort: SortKey;
  seed?: string;
}

/** Batched stats fetch — typed as a function so the service doesn't drag
 *  the call-log service's full surface area into its dependency cone. */
export type GetListingsStatsFn = (ids: number[]) => Promise<Map<number, ListingStats>>;

export class ListingsSearchService {
  constructor(
    private readonly repo: ListingsRepository,
    private readonly getStats: GetListingsStatsFn,
  ) {}

  async search(opts: ListingsSearchOptions): Promise<ListingsSearchResult> {
    const order: ListingsOrder = opts.sort === "latest" ? "latest" : "unordered";

    const [totalBeforeFilter, rows] = await Promise.all([
      this.repo.countV3(),
      this.repo.findApproved({ q: opts.q, tag: opts.tag }, order),
    ]);

    const ids = rows.map((r) => r.onChainId);
    const statsMap = await this.getStats(ids);

    let items: ListingsSearchItem[] = rows.map((r) => {
      const stats = statsMap.get(r.onChainId) ?? defaultStats();
      return {
        listingId: String(r.onChainId),
        owner: r.sellerAddress,
        metadata: reconstructMetadata(r),
        stats,
        score: scoreListing(stats),
        ...(r.directory ? { directory: r.directory } : {}),
      };
    });

    items = applyPostFilter(items, opts);
    items = applyRanking(items, opts);

    return {
      items: items.slice(0, opts.limit),
      total: items.length,
      totalBeforeFilter,
      limit: opts.limit,
      sort: opts.sort,
      ...(opts.seed ? { seed: opts.seed } : {}),
    };
  }
}

// ─── private helpers ──────────────────────────────────────────────────

function defaultStats(): ListingStats {
  return {
    successRate: 0,
    avgLatencyMs: 0,
    totalCalls: 0,
    successes: 0,
    lastCalledAt: null,
    windowDays: 30,
  };
}

/** Rebuild the metadata object the frontend expects from the listener's
 *  flat columns. Tags beyond the first aren't stored, so the array
 *  collapses to the (non-default) category. See the 2026-04-29 postmortem
 *  for the trade-off. */
function reconstructMetadata(r: {
  name: string;
  description: string;
  endpoint: string;
  price: string;
  category: string;
}): ListingMetadata {
  return {
    name: r.name,
    description: r.description,
    endpoint: r.endpoint,
    ...(r.price ? { pricing: { amount: r.price } } : {}),
    tags: r.category && r.category !== "general" ? [r.category] : [],
  };
}

function applyPostFilter(
  items: ListingsSearchItem[],
  opts: ListingsSearchOptions,
): ListingsSearchItem[] {
  return items.filter((it) => {
    if (opts.minSuccessRate !== undefined && Number.isFinite(opts.minSuccessRate)) {
      if (it.stats.successRate < opts.minSuccessRate) return false;
    }
    if (opts.maxPriceUsdc !== undefined && Number.isFinite(opts.maxPriceUsdc)) {
      const atomic = it.metadata.pricing?.amount;
      if (typeof atomic === "string" && /^\d+$/.test(atomic)) {
        const usdc = Number(atomic) / 1_000_000;
        if (usdc > opts.maxPriceUsdc) return false;
      }
    }
    return true;
  });
}

/**
 * - score (default): weighted random. Every call has a non-zero chance
 *   proportional to its score, so new listings aren't buried forever.
 *   `seed` makes the same query reproducible.
 * - score_strict: deterministic score desc. Debug + admin use.
 * - latest: already ordered by repo (onChainId desc); pass-through.
 */
function applyRanking(
  items: ListingsSearchItem[],
  opts: ListingsSearchOptions,
): ListingsSearchItem[] {
  if (opts.sort === "latest") return items;
  if (opts.sort === "score_strict") return [...items].sort((a, b) => b.score - a.score);
  const rng = rngFrom(opts.seed);
  return weightedShuffle(items, items.map((it) => it.score), rng);
}
