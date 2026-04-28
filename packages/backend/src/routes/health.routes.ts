/**
 * /api/health — liveness probe + market-listener status.
 *
 * Shape:
 *   {
 *     status: "ok",
 *     timestamp: "...",
 *     marketListener: {
 *       status: "healthy" | "silent" | "lagging" | "unstarted",
 *       lastEventAt, lastSyncedListingId, onchainNextListingId, lag,
 *       startedAt, errorCount
 *     }
 *   }
 *
 * Always returns 200 — this is a health probe, not a consistency oracle.
 * The `status` string in `marketListener` is what alerts read. `lagging`
 * means on-chain activity has advanced past us and we haven't processed
 * it within `DEFAULT_LAG_THRESHOLD_MS` — that's the paging-worthy signal.
 */

import { Router } from "express";
import { ChainLensMarketAbi } from "@chain-lens/shared";
import { publicClient } from "../config/viem.js";
import { classifyHealth, getMarketListenerState } from "../services/market-listener.service.js";
import { marketAddressOrNull } from "../services/market-chain.service.js";

const router = Router();

router.get("/", async (_req, res) => {
  const state = getMarketListenerState();

  // Best-effort on-chain read — if the RPC hiccups we still want /health to
  // respond so external probes don't flap.
  let onchainNext: number | null = null;
  const addr = marketAddressOrNull();
  if (addr) {
    try {
      const n = (await publicClient.readContract({
        address: addr,
        abi: ChainLensMarketAbi,
        functionName: "nextListingId",
      })) as bigint;
      onchainNext = Number(n);
    } catch {
      // swallow
    }
  }

  const listenerStatus = classifyHealth({
    lastEventAt: state.lastEventAt,
    lastSyncedListingId: state.lastSyncedListingId,
    onchainNextListingId: onchainNext,
  });

  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    marketListener: {
      status: listenerStatus,
      lastEventAt: state.lastEventAt?.toISOString() ?? null,
      lastSyncedListingId: state.lastSyncedListingId,
      onchainNextListingId: onchainNext,
      lag: onchainNext !== null ? onchainNext - 1 - state.lastSyncedListingId : null,
      startedAt: state.startedAt.toISOString(),
      errorCount: state.errorCount,
    },
  });
});

export default router;
