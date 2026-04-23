import { test, describe } from "node:test";
import * as assert from "node:assert/strict";
import {
  aggregateRows,
  aggregateErrors,
  scoreListing,
  groupByListingDay,
  type RawRow,
} from "./call-log.service.js";

describe("aggregateRows", () => {
  test("returns zeros for empty rows", () => {
    const s = aggregateRows([], 30);
    assert.deepEqual(s, {
      successRate: 0,
      avgLatencyMs: 0,
      totalCalls: 0,
      successes: 0,
      lastCalledAt: null,
      windowDays: 30,
    });
  });

  test("computes success rate over all rows", () => {
    const rows: RawRow[] = [
      { success: true, latencyMs: 100, createdAt: new Date("2026-04-20") },
      { success: true, latencyMs: 300, createdAt: new Date("2026-04-22") },
      { success: false, latencyMs: 9999, createdAt: new Date("2026-04-21") },
    ];
    const s = aggregateRows(rows, 30);
    assert.equal(Number(s.successRate.toFixed(4)), 0.6667);
    assert.equal(s.totalCalls, 3);
  });

  test("avg latency uses successes only — failures (timeouts) don't pollute", () => {
    const rows: RawRow[] = [
      { success: true, latencyMs: 100, createdAt: new Date("2026-04-20") },
      { success: true, latencyMs: 300, createdAt: new Date("2026-04-22") },
      // a 30s timeout should NOT pull avg up to 3.5k
      { success: false, latencyMs: 30_000, createdAt: new Date("2026-04-21") },
    ];
    const s = aggregateRows(rows, 30);
    assert.equal(s.avgLatencyMs, 200); // (100 + 300) / 2
  });

  test("avg latency is 0 when no successes", () => {
    const rows: RawRow[] = [
      { success: false, latencyMs: 500, createdAt: new Date("2026-04-22") },
      { success: false, latencyMs: 5000, createdAt: new Date("2026-04-21") },
    ];
    const s = aggregateRows(rows, 30);
    assert.equal(s.avgLatencyMs, 0);
    assert.equal(s.successRate, 0);
  });

  test("lastCalledAt is the max timestamp regardless of order", () => {
    const rows: RawRow[] = [
      { success: true, latencyMs: 100, createdAt: new Date("2026-04-10") },
      { success: false, latencyMs: 100, createdAt: new Date("2026-04-22") },
      { success: true, latencyMs: 100, createdAt: new Date("2026-04-15") },
    ];
    const s = aggregateRows(rows, 30);
    assert.equal(s.lastCalledAt?.toISOString(), new Date("2026-04-22").toISOString());
  });

  test("threads windowDays through verbatim", () => {
    assert.equal(aggregateRows([], 7).windowDays, 7);
    assert.equal(aggregateRows([], 90).windowDays, 90);
  });
});

describe("scoreListing", () => {
  test("brand-new listing gets 0.5 baseline, not 0", () => {
    // Laplace prior Beta(1,1) → 50% smoothed rate × ln(e) = 1 → 0.5.
    // This is the cold-start fix: new listings must compete, not be buried.
    const s = scoreListing({
      successRate: 0,
      avgLatencyMs: 0,
      totalCalls: 0,
      successes: 0,
      lastCalledAt: null,
      windowDays: 30,
    });
    assert.equal(s, 0.5);
  });

  test("rewards volume with sub-linear (log) scaling", () => {
    const lowVol = scoreListing({
      successRate: 1,
      avgLatencyMs: 100,
      totalCalls: 1,
      successes: 1,
      lastCalledAt: new Date(),
      windowDays: 30,
    });
    const highVol = scoreListing({
      successRate: 1,
      avgLatencyMs: 100,
      totalCalls: 100,
      successes: 100,
      lastCalledAt: new Date(),
      windowDays: 30,
    });
    assert.ok(highVol > lowVol, "higher volume → higher score");
    // Log scaling keeps the ratio bounded — not a 100× blowout.
    assert.ok(
      highVol / lowVol < 6,
      `log scaling (ratio was ${highVol / lowVol})`,
    );
  });

  test("lower successRate yields strictly lower score (monotonic)", () => {
    // With Laplace smoothing the relationship is no longer exactly
    // proportional, but it MUST remain monotonic: more failures → lower.
    const good = scoreListing({
      successRate: 1,
      avgLatencyMs: 100,
      totalCalls: 100,
      successes: 100,
      lastCalledAt: new Date(),
      windowDays: 30,
    });
    const half = scoreListing({
      successRate: 0.5,
      avgLatencyMs: 100,
      totalCalls: 100,
      successes: 50,
      lastCalledAt: new Date(),
      windowDays: 30,
    });
    const bad = scoreListing({
      successRate: 0.1,
      avgLatencyMs: 100,
      totalCalls: 100,
      successes: 10,
      lastCalledAt: new Date(),
      windowDays: 30,
    });
    assert.ok(good > half, `good ${good} > half ${half}`);
    assert.ok(half > bad, `half ${half} > bad ${bad}`);
  });

  test("handful of failures on a heavy-traffic listing barely moves score", () => {
    // 100/100 vs 99/100 — Laplace prior absorbs a single failure.
    const perfect = scoreListing({
      successRate: 1.0,
      avgLatencyMs: 100,
      totalCalls: 100,
      successes: 100,
      lastCalledAt: new Date(),
      windowDays: 30,
    });
    const oneFailure = scoreListing({
      successRate: 0.99,
      avgLatencyMs: 100,
      totalCalls: 100,
      successes: 99,
      lastCalledAt: new Date(),
      windowDays: 30,
    });
    assert.ok(perfect > oneFailure);
    // Delta is small — less than 2% of perfect score.
    assert.ok(
      (perfect - oneFailure) / perfect < 0.02,
      `one failure on 100 calls should be a tiny hit, saw ${(perfect - oneFailure) / perfect}`,
    );
  });

  test("new perfect-record listing ranks below established lesser one", () => {
    // 1/1 → smoothed=2/3, vol=ln(1+e) ≈ 1.31 → score ≈ 0.876
    const rookie = scoreListing({
      successRate: 1,
      avgLatencyMs: 100,
      totalCalls: 1,
      successes: 1,
      lastCalledAt: new Date(),
      windowDays: 30,
    });
    // 80/100 → smoothed=81/102 ≈ 0.794, vol=ln(100+e) ≈ 4.63 → score ≈ 3.68
    const established = scoreListing({
      successRate: 0.8,
      avgLatencyMs: 100,
      totalCalls: 100,
      successes: 80,
      lastCalledAt: new Date(),
      windowDays: 30,
    });
    assert.ok(
      established > rookie,
      `established (${established}) should outrank rookie (${rookie})`,
    );
  });

  test("scoring smoke: rookie still ranks above listing with zero data", () => {
    // Every successful call should outweigh the unknown baseline.
    const cold = scoreListing({
      successRate: 0,
      avgLatencyMs: 0,
      totalCalls: 0,
      successes: 0,
      lastCalledAt: null,
      windowDays: 30,
    });
    const rookie = scoreListing({
      successRate: 1,
      avgLatencyMs: 100,
      totalCalls: 1,
      successes: 1,
      lastCalledAt: new Date(),
      windowDays: 30,
    });
    assert.ok(rookie > cold, `rookie ${rookie} > cold ${cold}`);
  });
});

describe("aggregateErrors", () => {
  test("empty rows → zero failures", () => {
    const r = aggregateErrors([], 7);
    assert.deepEqual(r, { windowDays: 7, totalFailures: 0, breakdown: {} });
  });

  test("buckets by errorReason with counts", () => {
    const r = aggregateErrors(
      [
        { errorReason: "seller_5xx" },
        { errorReason: "seller_5xx" },
        { errorReason: "seller_timeout" },
        { errorReason: "metadata_error" },
        { errorReason: "seller_5xx" },
      ],
      7,
    );
    assert.equal(r.totalFailures, 5);
    assert.deepEqual(r.breakdown, {
      seller_5xx: 3,
      seller_timeout: 1,
      metadata_error: 1,
    });
  });

  test("null errorReason falls into 'unknown' bucket", () => {
    const r = aggregateErrors(
      [
        { errorReason: null },
        { errorReason: null },
        { errorReason: "seller_4xx" },
      ],
      7,
    );
    assert.equal(r.breakdown["unknown"], 2);
    assert.equal(r.breakdown["seller_4xx"], 1);
  });

  test("threads windowDays verbatim", () => {
    assert.equal(aggregateErrors([], 1).windowDays, 1);
    assert.equal(aggregateErrors([], 30).windowDays, 30);
  });
});

describe("groupByListingDay", () => {
  test("empty rows → empty result", () => {
    assert.deepEqual(groupByListingDay([]), []);
  });

  test("groups by (listingId, UTC day)", () => {
    const rows = [
      { listingId: 1, createdAt: new Date("2026-01-10T08:00:00Z"), success: true,  latencyMs: 100, errorReason: null },
      { listingId: 1, createdAt: new Date("2026-01-10T20:00:00Z"), success: false, latencyMs: 500, errorReason: "seller_5xx" },
      { listingId: 1, createdAt: new Date("2026-01-11T05:00:00Z"), success: true,  latencyMs: 200, errorReason: null },
      { listingId: 2, createdAt: new Date("2026-01-10T12:00:00Z"), success: true,  latencyMs: 300, errorReason: null },
    ];
    const result = groupByListingDay(rows);
    assert.equal(result.length, 3); // listing1/day10, listing1/day11, listing2/day10

    const l1d10 = result.find(r => r.listingId === 1 && r.date.toISOString().startsWith("2026-01-10"))!;
    assert.ok(l1d10, "listing1 day10 entry should exist");
    assert.equal(l1d10.totalCalls, 2);
    assert.equal(l1d10.successes, 1);
    assert.equal(l1d10.avgLatencyMs, 100); // only the success row
    assert.deepEqual(l1d10.errorBreakdown, { seller_5xx: 1 });

    const l1d11 = result.find(r => r.listingId === 1 && r.date.toISOString().startsWith("2026-01-11"))!;
    assert.equal(l1d11.totalCalls, 1);
    assert.equal(l1d11.successes, 1);
    assert.equal(l1d11.avgLatencyMs, 200);
    assert.deepEqual(l1d11.errorBreakdown, {});

    const l2d10 = result.find(r => r.listingId === 2)!;
    assert.equal(l2d10.totalCalls, 1);
    assert.equal(l2d10.successes, 1);
    assert.equal(l2d10.avgLatencyMs, 300);
  });

  test("avgLatencyMs is 0 when all calls failed", () => {
    const rows = [
      { listingId: 5, createdAt: new Date("2026-03-01T10:00:00Z"), success: false, latencyMs: 9999, errorReason: "seller_timeout" },
      { listingId: 5, createdAt: new Date("2026-03-01T11:00:00Z"), success: false, latencyMs: 8000, errorReason: "seller_timeout" },
    ];
    const [r] = groupByListingDay(rows);
    assert.equal(r.avgLatencyMs, 0);
    assert.equal(r.totalCalls, 2);
    assert.equal(r.successes, 0);
    assert.deepEqual(r.errorBreakdown, { seller_timeout: 2 });
  });

  test("null errorReason falls into 'unknown' bucket", () => {
    const rows = [
      { listingId: 3, createdAt: new Date("2026-02-15T00:00:00Z"), success: false, latencyMs: 1000, errorReason: null },
    ];
    const [r] = groupByListingDay(rows);
    assert.deepEqual(r.errorBreakdown, { unknown: 1 });
  });

  test("midnight UTC boundary: two rows on either side of midnight split into separate days", () => {
    const rows = [
      { listingId: 1, createdAt: new Date("2026-05-01T23:59:59Z"), success: true, latencyMs: 50, errorReason: null },
      { listingId: 1, createdAt: new Date("2026-05-02T00:00:01Z"), success: true, latencyMs: 60, errorReason: null },
    ];
    const result = groupByListingDay(rows);
    assert.equal(result.length, 2);
    assert.ok(result.some(r => r.date.toISOString().startsWith("2026-05-01")));
    assert.ok(result.some(r => r.date.toISOString().startsWith("2026-05-02")));
  });
});