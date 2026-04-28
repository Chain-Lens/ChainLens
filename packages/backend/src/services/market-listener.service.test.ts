import { test, describe } from "node:test";
import * as assert from "node:assert/strict";
import {
  classifyHealth,
  DEFAULT_LAG_THRESHOLD_MS,
  DEFAULT_SILENT_THRESHOLD_MS,
} from "./market-listener.service.js";

const NOW = Date.UTC(2026, 3, 23, 12, 0, 0); // 2026-04-23 12:00 UTC

describe("classifyHealth", () => {
  test("unstarted: onchainNextListingId null (RPC failure)", () => {
    const h = classifyHealth({
      lastEventAt: null,
      lastSyncedListingId: -1,
      onchainNextListingId: null,
      now: NOW,
    });
    assert.equal(h, "unstarted");
  });

  test("silent: no events ever, but chain also empty (nothing to sync)", () => {
    const h = classifyHealth({
      lastEventAt: null,
      lastSyncedListingId: -1,
      onchainNextListingId: 0, // chain has no listings
      now: NOW,
    });
    assert.equal(h, "silent");
  });

  test("silent: recent-ish event, no gap, but past silent threshold", () => {
    const h = classifyHealth({
      lastEventAt: new Date(NOW - DEFAULT_SILENT_THRESHOLD_MS - 1),
      lastSyncedListingId: 5,
      onchainNextListingId: 6, // already synced up to 5
      now: NOW,
    });
    assert.equal(h, "silent");
  });

  test("healthy: recent event + no gap", () => {
    const h = classifyHealth({
      lastEventAt: new Date(NOW - 60_000),
      lastSyncedListingId: 5,
      onchainNextListingId: 6, // synced
      now: NOW,
    });
    assert.equal(h, "healthy");
  });

  test("healthy: gap exists but last event was recent (within grace)", () => {
    // Chain is at 7 (max id 6), we've synced up to 5. Gap=1, but event
    // happened within lagThreshold so we might still be processing.
    const h = classifyHealth({
      lastEventAt: new Date(NOW - DEFAULT_LAG_THRESHOLD_MS + 60_000),
      lastSyncedListingId: 5,
      onchainNextListingId: 7,
      now: NOW,
    });
    assert.equal(h, "healthy");
  });

  test("lagging: gap + stale event past lag threshold", () => {
    const h = classifyHealth({
      lastEventAt: new Date(NOW - DEFAULT_LAG_THRESHOLD_MS - 1000),
      lastSyncedListingId: 5,
      onchainNextListingId: 7,
      now: NOW,
    });
    assert.equal(h, "lagging");
  });

  test("lagging: gap + never heard an event (Infinity since)", () => {
    const h = classifyHealth({
      lastEventAt: null,
      lastSyncedListingId: -1,
      onchainNextListingId: 3, // chain has listings, we haven't synced any
      now: NOW,
    });
    assert.equal(h, "lagging");
  });

  test("thresholds are overridable", () => {
    // Would be "silent" under default, but a 1h silent threshold flips it healthy.
    const h = classifyHealth({
      lastEventAt: new Date(NOW - 20 * 60_000),
      lastSyncedListingId: 0,
      onchainNextListingId: 1,
      now: NOW,
      silentThresholdMs: 60 * 60_000,
    });
    assert.equal(h, "healthy");
  });

  test("negative / forward gap never triggers lagging", () => {
    // Shouldn't happen (we can't be ahead of the chain) but defensive.
    const h = classifyHealth({
      lastEventAt: new Date(NOW - 60_000),
      lastSyncedListingId: 10,
      onchainNextListingId: 5,
      now: NOW,
    });
    assert.equal(h, "healthy");
  });
});
