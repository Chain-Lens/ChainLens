/**
 * CallLog service — every `/api/market/call/:id` that reaches the listing
 * stage gets one row here. Rows feed per-listing stats + the ranking score
 * used by chain-lens.discover in Phase 2b.
 *
 * Writes are fire-and-forget from the request handler: a DB flake must not
 * block a successful settlement. Callers `void logCall(...).catch(...)`.
 */

import prisma from "../config/prisma.js";

export interface CallLogInput {
  listingId: number;
  buyer: string;
  success: boolean;
  sellerStatus?: number | null;
  latencyMs: number;
  amount: string;
  jobRef: string;
  settleTxHash?: string | null;
  errorReason?: string | null;
}

export interface ListingStats {
  /** [0.0, 1.0] — pure empirical: successes / totalCalls. 0 when totalCalls=0. */
  successRate: number;
  /** Average latency (ms) across successful calls only. Failed calls often
   *  hit the 30s seller timeout and would pollute the signal. */
  avgLatencyMs: number;
  /** Total calls in the active window. */
  totalCalls: number;
  /** Successful calls in the window — exposed for Laplace smoothing in
   *  scoreListing without needing rate × total rounding tricks. */
  successes: number;
  /** Wall-clock of the most recent call (success or fail). */
  lastCalledAt: Date | null;
  /** Window the stats were computed over, in days. */
  windowDays: number;
}

export const DEFAULT_WINDOW_DAYS = 30;

/**
 * Insert a call-log row. Normalises buyer to lowercase so the index hits
 * consistently regardless of caller casing.
 */
export async function logCall(input: CallLogInput): Promise<void> {
  await prisma.callLog.create({
    data: {
      listingId: input.listingId,
      buyer: input.buyer.toLowerCase(),
      success: input.success,
      sellerStatus: input.sellerStatus ?? null,
      latencyMs: input.latencyMs,
      amount: input.amount,
      jobRef: input.jobRef,
      settleTxHash: input.settleTxHash ?? null,
      errorReason: input.errorReason ?? null,
    },
  });
}

export async function getListingStats(
  listingId: number,
  windowDays: number = DEFAULT_WINDOW_DAYS,
): Promise<ListingStats> {
  const since = windowStart(windowDays);
  const rows = await prisma.callLog.findMany({
    where: { listingId, createdAt: { gte: since } },
    select: { success: true, latencyMs: true, createdAt: true },
  });
  return aggregateRows(rows, windowDays);
}

/**
 * Batch variant for the listings index — one SQL round trip regardless of
 * how many listings we're rendering. Returns a map keyed by listingId;
 * listings with no calls in the window get a zeroed ListingStats entry.
 */
export async function getListingsStats(
  listingIds: number[],
  windowDays: number = DEFAULT_WINDOW_DAYS,
): Promise<Map<number, ListingStats>> {
  const result = new Map<number, ListingStats>();
  if (listingIds.length === 0) return result;

  const since = windowStart(windowDays);
  const rows = await prisma.callLog.findMany({
    where: {
      listingId: { in: listingIds },
      createdAt: { gte: since },
    },
    select: {
      listingId: true,
      success: true,
      latencyMs: true,
      createdAt: true,
    },
  });
  const byListing = new Map<number, RawRow[]>();
  for (const r of rows) {
    const list = byListing.get(r.listingId) ?? [];
    list.push({ success: r.success, latencyMs: r.latencyMs, createdAt: r.createdAt });
    byListing.set(r.listingId, list);
  }
  for (const id of listingIds) {
    result.set(id, aggregateRows(byListing.get(id) ?? [], windowDays));
  }
  return result;
}

/**
 * Breakdown of recent failures keyed by errorReason. Used by the inspect
 * endpoint so agents and admins can see *why* a listing is flaky — a pile
 * of `seller_5xx` tells a very different story from `seller_timeout`.
 */
export interface RecentErrors {
  windowDays: number;
  totalFailures: number;
  /** errorReason → count. "unknown" bucket catches nulls (should be rare). */
  breakdown: Record<string, number>;
}

export const DEFAULT_ERROR_WINDOW_DAYS = 7;

export async function getRecentErrors(
  listingId: number,
  windowDays: number = DEFAULT_ERROR_WINDOW_DAYS,
): Promise<RecentErrors> {
  const since = new Date(Date.now() - windowDays * 86_400_000);
  const rows = await prisma.callLog.findMany({
    where: {
      listingId,
      success: false,
      createdAt: { gte: since },
    },
    select: { errorReason: true },
  });
  return aggregateErrors(rows, windowDays);
}

// Exported for unit tests — pure function.
export function aggregateErrors(
  rows: { errorReason: string | null }[],
  windowDays: number,
): RecentErrors {
  const breakdown: Record<string, number> = {};
  for (const r of rows) {
    const key = r.errorReason ?? "unknown";
    breakdown[key] = (breakdown[key] ?? 0) + 1;
  }
  return {
    windowDays,
    totalFailures: rows.length,
    breakdown,
  };
}

/**
 * Composite score for ranking — Laplace-smoothed success rate × log volume.
 *
 *   smoothedRate = (successes + 1) / (totalCalls + 2)   // Beta(1,1) prior
 *   volumeFactor = ln(totalCalls + e)                    // ≥ 1 always
 *   score        = smoothedRate × volumeFactor
 *
 * Key properties:
 *   - totalCalls=0 → score = 0.5 × 1.0 = 0.5 (brand-new baseline, not 0).
 *     Kills the cold-start trap where "no data" means "never gets chosen".
 *   - Failures depress score sub-linearly thanks to the prior — a handful
 *     of failures on a 100-call listing barely moves the needle, whereas
 *     a handful on a 3-call listing hurts a lot.
 *   - log volume prevents "100% on 1 call" rookies from topping the chart
 *     over "85% on 200 calls" established players.
 *
 * Swap this function out cleanly (e.g., Thompson sampling) without touching
 * callers. Weighted random sampling in market.routes.ts uses `score + α` as
 * the selection weight, so as long as score ≥ 0 the sampler works.
 */
export function scoreListing(stats: ListingStats): number {
  const smoothedRate = (stats.successes + 1) / (stats.totalCalls + 2);
  const volumeFactor = Math.log(stats.totalCalls + Math.E);
  return smoothedRate * volumeFactor;
}

// ──────────────────────────────────────────────────────────────────────
// Admin-only raw log access
// ──────────────────────────────────────────────────────────────────────
//
// Public stats endpoints strip `buyer` so wallet addresses aren't leaked
// to the world. Admin triage ("why is listing #7 constantly failing?")
// needs the raw rows with buyer visible — that's what this exposes.
// Access control happens at the route layer (requireAdmin middleware).

export interface CallLogFilter {
  listingId: number;
  onlyFailures?: boolean;
  since?: Date;
  limit?: number;
  offset?: number;
}

export interface CallLogPage {
  items: Array<{
    id: string;
    listingId: number;
    buyer: string;
    success: boolean;
    sellerStatus: number | null;
    latencyMs: number;
    amount: string;
    jobRef: string;
    settleTxHash: string | null;
    errorReason: string | null;
    createdAt: Date;
  }>;
  total: number;
  limit: number;
  offset: number;
}

export async function listCallLogs(
  filter: CallLogFilter,
): Promise<CallLogPage> {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 500);
  const offset = Math.max(filter.offset ?? 0, 0);
  const where = {
    listingId: filter.listingId,
    ...(filter.onlyFailures ? { success: false } : {}),
    ...(filter.since ? { createdAt: { gte: filter.since } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.callLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.callLog.count({ where }),
  ]);
  return { items, total, limit, offset };
}

// ---------- internals (exported for tests) ----------

export interface RawRow {
  success: boolean;
  latencyMs: number;
  createdAt: Date;
}

export function aggregateRows(rows: RawRow[], windowDays: number): ListingStats {
  if (rows.length === 0) {
    return {
      successRate: 0,
      avgLatencyMs: 0,
      totalCalls: 0,
      successes: 0,
      lastCalledAt: null,
      windowDays,
    };
  }
  const successRows = rows.filter((r) => r.success);
  const successes = successRows.length;
  const successRate = successes / rows.length;
  const avgLatencyMs = successes
    ? Math.round(
        successRows.reduce((sum, r) => sum + r.latencyMs, 0) / successes,
      )
    : 0;
  const lastCalledAt = rows.reduce(
    (max, r) => (r.createdAt > max ? r.createdAt : max),
    rows[0]!.createdAt,
  );
  return {
    successRate,
    avgLatencyMs,
    totalCalls: rows.length,
    successes,
    lastCalledAt,
    windowDays,
  };
}

function windowStart(windowDays: number): Date {
  return new Date(Date.now() - windowDays * 86_400_000);
}