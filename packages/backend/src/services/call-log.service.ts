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
  /** [0.0, 1.0] — successful calls / total calls in window. */
  successRate: number;
  /** Average latency (ms) across successful calls only. Failed calls often
   *  hit the 30s seller timeout and would pollute the signal. */
  avgLatencyMs: number;
  /** Total calls in the active window. */
  totalCalls: number;
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
 * Composite score for ranking: `successRate * ln(totalCalls + 1)`. Keeps
 * brand-new listings from topping the charts on "100% of 1 call" while
 * rewarding sustained quality. Swap this function out cleanly when ranking
 * iterations land in Phase 2b — keep the signature pure.
 */
export function scoreListing(stats: ListingStats): number {
  return stats.successRate * Math.log(stats.totalCalls + 1);
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
      lastCalledAt: null,
      windowDays,
    };
  }
  const successes = rows.filter((r) => r.success);
  const successRate = successes.length / rows.length;
  const avgLatencyMs = successes.length
    ? Math.round(
        successes.reduce((sum, r) => sum + r.latencyMs, 0) / successes.length,
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
    lastCalledAt,
    windowDays,
  };
}

function windowStart(windowDays: number): Date {
  return new Date(Date.now() - windowDays * 86_400_000);
}