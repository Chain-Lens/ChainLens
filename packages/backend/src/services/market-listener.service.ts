/**
 * Market listener — subscribes to ChainLensMarket events and mirrors state
 * into the `ApiListing` table so the admin approval gate has something to
 * gate on.
 *
 * Design:
 *   - `ListingRegistered` → upsert PENDING row (admin must approve).
 *   - `ListingMetadataUpdated` → refresh metadata fields but never touch
 *     status. A seller editing their metadata shouldn't un-approve them.
 *   - On boot, catch up the gap between our max V3 onChainId in DB and
 *     the on-chain `nextListingId-1`. Keeps us consistent across restarts.
 *   - Track `lastEventAt` + `lastSyncedListingId` + `errorCount` in module
 *     state so `/api/health` can classify the listener as
 *     healthy / silent / lagging. `classifyHealth` is pure and exported
 *     for unit testing.
 *
 * Intentionally NOT subscribing to `ListingDeactivated` / `ListingReactivated`
 * yet. The gateway already reads `listing.active` on-chain at call time
 * (`/call/:id` returns 410 for inactive), so DB mirroring of the flag is
 * not load-bearing. Can add later if admin UI needs to surface it.
 */

import type { Log } from "viem";
import { ChainLensMarketAbi } from "@chain-lens/shared";
import prisma from "../config/prisma.js";
import { publicClient } from "../config/viem.js";
import {
  marketAddress,
  readListing,
  nextListingId,
  resolveMetadata,
  type ListingMetadata,
  type OnChainListing,
} from "./market-chain.service.js";
import { logger } from "../utils/logger.js";

// ──────────────────────────────────────────────────────────────────────
// Dependency injection — lets integration tests swap Prisma / viem fakes
// ──────────────────────────────────────────────────────────────────────

export interface MarketListenerDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: {
    apiListing: {
      upsert(a: any): Promise<unknown>;
      updateMany(a: any): Promise<unknown>;
      findFirst(a: any): Promise<{ onChainId: number } | null>;
    };
  };
  watchEvent(params: any): () => void; // eslint-disable-line @typescript-eslint/no-explicit-any
  getMarketAddress(): `0x${string}`;
  readListing_(id: bigint): Promise<OnChainListing>;
  nextListingId_(): Promise<bigint>;
  resolveMetadata_(uri: string): Promise<ListingMetadata>;
}

interface HandlerCtx {
  db: MarketListenerDeps["db"];
  resolveMeta: MarketListenerDeps["resolveMetadata_"];
}

interface CatchupCtx extends HandlerCtx {
  nextListingId_: MarketListenerDeps["nextListingId_"];
  readListing_: MarketListenerDeps["readListing_"];
}

interface ListenerState {
  /** Wall-clock of the most recent processed event (any kind). */
  lastEventAt: Date | null;
  /** Max V3 onChainId the listener has written to DB (-1 = none). */
  lastSyncedListingId: number;
  /** Listener boot time — admin can check if restart happened unexpectedly. */
  startedAt: Date;
  /** Running count of handler / subscription errors since boot. */
  errorCount: number;
}

let state: ListenerState = {
  lastEventAt: null,
  lastSyncedListingId: -1,
  startedAt: new Date(),
  errorCount: 0,
};

export function getMarketListenerState(): Readonly<ListenerState> {
  return { ...state };
}

// ──────────────────────────────────────────────────────────────────────
// Pure health classifier — exported for unit tests, consumed by /health
// ──────────────────────────────────────────────────────────────────────

export type ListenerHealth = "healthy" | "silent" | "lagging" | "unstarted";

export interface ClassifyParams {
  lastEventAt: Date | null;
  lastSyncedListingId: number;
  onchainNextListingId: number | null;
  now?: number;
  /** How long without any event counts as "silent" (soft warning). */
  silentThresholdMs?: number;
  /** How long a DB-vs-chain gap can persist before we flag "lagging". */
  lagThresholdMs?: number;
}

export const DEFAULT_SILENT_THRESHOLD_MS = 10 * 60_000;
export const DEFAULT_LAG_THRESHOLD_MS = 5 * 60_000;

export function classifyHealth(params: ClassifyParams): ListenerHealth {
  const {
    lastEventAt,
    lastSyncedListingId,
    onchainNextListingId,
    now = Date.now(),
    silentThresholdMs = DEFAULT_SILENT_THRESHOLD_MS,
    lagThresholdMs = DEFAULT_LAG_THRESHOLD_MS,
  } = params;

  if (onchainNextListingId === null) return "unstarted";

  const onchainMaxId = onchainNextListingId - 1;
  const gap = onchainMaxId - lastSyncedListingId;

  // Real problem: on-chain has advanced past us and we haven't caught up
  // within the grace period. If lastEventAt is null we've never heard
  // from the RPC, which is worse than merely old.
  if (gap > 0) {
    const sinceMs = lastEventAt ? now - lastEventAt.getTime() : Infinity;
    if (sinceMs > lagThresholdMs) return "lagging";
  }

  // Soft signal: no events for a while. Could just mean nobody registered;
  // operators decide what to do with it. Distinct from "lagging" — no
  // actual data loss, just quiet.
  if (!lastEventAt) return "silent";
  if (now - lastEventAt.getTime() > silentThresholdMs) return "silent";

  return "healthy";
}

// ──────────────────────────────────────────────────────────────────────
// Event handlers
// ──────────────────────────────────────────────────────────────────────

async function handleListingRegistered(
  args: { listingId: bigint; owner: `0x${string}`; payout: `0x${string}`; metadataURI: string },
  ctx: HandlerCtx,
): Promise<void> {
  const id = Number(args.listingId);
  let meta: ListingMetadata | null = null;
  try {
    meta = await ctx.resolveMeta(args.metadataURI);
  } catch (e) {
    logger.warn(
      { listingId: id, err: String(e) },
      "market listener: metadata resolve failed (row still created)",
    );
  }

  await ctx.db.apiListing.upsert({
    where: {
      contractVersion_onChainId: {
        contractVersion: "V3",
        onChainId: id,
      },
    },
    create: {
      contractVersion: "V3",
      onChainId: id,
      name: String(meta?.name ?? `Listing #${id}`).slice(0, 200),
      description: String(meta?.description ?? "").slice(0, 2000),
      endpoint: String(meta?.endpoint ?? ""),
      price: String(meta?.pricing?.amount ?? "0"),
      category:
        Array.isArray(meta?.tags) && meta.tags.length > 0 ? String(meta.tags[0]) : "general",
      sellerAddress: args.owner.toLowerCase(),
      status: "PENDING",
    },
    // On re-registration (typically a reorg-replay), refresh metadata but
    // preserve admin status — we don't want a replay to un-approve a seller.
    update: {
      ...(meta?.name ? { name: String(meta.name).slice(0, 200) } : {}),
      ...(meta?.description ? { description: String(meta.description).slice(0, 2000) } : {}),
      ...(meta?.endpoint ? { endpoint: String(meta.endpoint) } : {}),
      ...(meta?.pricing?.amount ? { price: String(meta.pricing.amount) } : {}),
    },
  });

  state.lastEventAt = new Date();
  if (id > state.lastSyncedListingId) state.lastSyncedListingId = id;
}

async function handleMetadataUpdated(
  args: { listingId: bigint; metadataURI: string },
  ctx: HandlerCtx,
): Promise<void> {
  const id = Number(args.listingId);
  let meta: ListingMetadata | null = null;
  try {
    meta = await ctx.resolveMeta(args.metadataURI);
  } catch (e) {
    logger.warn({ listingId: id, err: String(e) }, "market listener: metadata refresh failed");
    state.lastEventAt = new Date();
    return;
  }

  await ctx.db.apiListing.updateMany({
    where: { contractVersion: "V3", onChainId: id },
    data: {
      ...(meta.name ? { name: String(meta.name).slice(0, 200) } : {}),
      ...(meta.description ? { description: String(meta.description).slice(0, 2000) } : {}),
      ...(meta.endpoint ? { endpoint: String(meta.endpoint) } : {}),
      ...(meta.pricing?.amount ? { price: String(meta.pricing.amount) } : {}),
    },
  });
  state.lastEventAt = new Date();
}

/**
 * Boot-time catch-up: fill the gap between DB `max(onChainId)` for V3 and
 * `nextListingId-1` on-chain. Runs once on `startMarketListener()`.
 *
 * Without this, a listener restart after N blocks of downtime would leave
 * those N listings invisible (no PENDING row → admin UI never shows them).
 */
async function catchupOnBoot(ctx: CatchupCtx): Promise<void> {
  let onchainMax: number;
  try {
    onchainMax = Number(await ctx.nextListingId_()) - 1;
  } catch (e) {
    logger.warn(
      { err: String(e) },
      "market listener boot: nextListingId() failed, skipping catchup",
    );
    return;
  }
  if (onchainMax < 0) {
    state.lastSyncedListingId = -1;
    return;
  }

  const dbMax = await ctx.db.apiListing.findFirst({
    where: { contractVersion: "V3" },
    orderBy: { onChainId: "desc" },
    select: { onChainId: true },
  });
  const dbMaxId = dbMax?.onChainId ?? -1;
  state.lastSyncedListingId = dbMaxId;

  if (onchainMax <= dbMaxId) return;

  logger.warn({ onchainMax, dbMaxId, gap: onchainMax - dbMaxId }, "market listener boot catchup");
  for (let i = dbMaxId + 1; i <= onchainMax; i++) {
    try {
      const l = await ctx.readListing_(BigInt(i));
      await handleListingRegistered(
        {
          listingId: BigInt(i),
          owner: l.owner,
          payout: l.payout,
          metadataURI: l.metadataURI,
        },
        ctx,
      );
    } catch (e) {
      state.errorCount += 1;
      logger.error(
        { listingId: i, err: String(e) },
        "boot catchup: failed to sync listing (will be retried on next event)",
      );
    }
  }
}

// ──────────────────────────────────────────────────────────────────────
// Entry point
// ──────────────────────────────────────────────────────────────────────

export function startMarketListener(deps?: Partial<MarketListenerDeps>): {
  stop: () => void;
  catchupDone: Promise<void>;
} {
  state = {
    lastEventAt: null,
    lastSyncedListingId: -1,
    startedAt: new Date(),
    errorCount: 0,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: MarketListenerDeps["db"] = (deps?.db ?? prisma) as any;
  const ctx: CatchupCtx = {
    db,
    resolveMeta: deps?.resolveMetadata_ ?? resolveMetadata,
    nextListingId_: deps?.nextListingId_ ?? nextListingId,
    readListing_: deps?.readListing_ ?? readListing,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const watchEvent: MarketListenerDeps["watchEvent"] =
    deps?.watchEvent ?? ((p: any) => publicClient.watchContractEvent(p));
  const address = (deps?.getMarketAddress ?? marketAddress)();

  const unwatchRegistered = watchEvent({
    address,
    abi: ChainLensMarketAbi,
    eventName: "ListingRegistered",
    onLogs: async (
      logs: Array<
        Log & {
          args: {
            listingId: bigint;
            owner: `0x${string}`;
            payout: `0x${string}`;
            metadataURI: string;
          };
        }
      >,
    ) => {
      for (const log of logs) {
        try {
          await handleListingRegistered(log.args, ctx);
        } catch (e) {
          state.errorCount += 1;
          logger.error(
            { err: String(e), listingId: log.args.listingId?.toString() },
            "market listener: handleListingRegistered failed",
          );
        }
      }
    },
    onError: (err: Error) => {
      state.errorCount += 1;
      logger.error({ err: String(err) }, "ListingRegistered subscription errored");
    },
  });

  const unwatchMetadata = watchEvent({
    address,
    abi: ChainLensMarketAbi,
    eventName: "ListingMetadataUpdated",
    onLogs: async (logs: Array<Log & { args: { listingId: bigint; metadataURI: string } }>) => {
      for (const log of logs) {
        try {
          await handleMetadataUpdated(log.args, ctx);
        } catch (e) {
          state.errorCount += 1;
          logger.error(
            { err: String(e), listingId: log.args.listingId?.toString() },
            "market listener: handleMetadataUpdated failed",
          );
        }
      }
    },
    onError: (err: Error) => {
      state.errorCount += 1;
      logger.error({ err: String(err) }, "ListingMetadataUpdated subscription errored");
    },
  });

  // Run catchup in the background — anything that fires during catchup is
  // queued by the subscriptions started above, so we don't miss events.
  const catchupDone = catchupOnBoot(ctx).catch((e) =>
    logger.error({ err: String(e) }, "market listener boot catchup failed"),
  );

  logger.info({ market: address }, "market listener started");

  return {
    stop: () => {
      unwatchRegistered();
      unwatchMetadata();
    },
    catchupDone,
  };
}
