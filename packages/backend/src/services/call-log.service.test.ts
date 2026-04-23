import { test, describe } from "node:test";
import * as assert from "node:assert/strict";
import { aggregateRows, scoreListing, type RawRow } from "./call-log.service.js";

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

  test("rookie still ranks above listing with zero data", () => {
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