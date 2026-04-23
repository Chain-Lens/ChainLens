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
  test("is 0 for no calls", () => {
    assert.equal(
      scoreListing({
        successRate: 0,
        avgLatencyMs: 0,
        totalCalls: 0,
        lastCalledAt: null,
        windowDays: 30,
      }),
      0,
    );
  });

  test("rewards volume with sub-linear (log) scaling", () => {
    const lowVol = scoreListing({
      successRate: 1,
      avgLatencyMs: 100,
      totalCalls: 1,
      lastCalledAt: new Date(),
      windowDays: 30,
    });
    const highVol = scoreListing({
      successRate: 1,
      avgLatencyMs: 100,
      totalCalls: 100,
      lastCalledAt: new Date(),
      windowDays: 30,
    });
    assert.ok(highVol > lowVol, "higher volume → higher score");
    // Log scaling: 100× calls should lift score by ln(101)/ln(2) ≈ 6.66×,
    // not 100×. Bounded so new-but-good listings aren't crushed.
    assert.ok(
      highVol / lowVol < 20,
      `log scaling (ratio was ${highVol / lowVol})`,
    );
  });

  test("punishes failures proportionally to successRate", () => {
    const good = scoreListing({
      successRate: 1,
      avgLatencyMs: 100,
      totalCalls: 100,
      lastCalledAt: new Date(),
      windowDays: 30,
    });
    const half = scoreListing({
      successRate: 0.5,
      avgLatencyMs: 100,
      totalCalls: 100,
      lastCalledAt: new Date(),
      windowDays: 30,
    });
    // 50% success rate yields exactly half the score at the same volume —
    // the formula is multiplicative in successRate, so this is the contract.
    assert.equal(half, good * 0.5);
  });

  test("new perfect-record listing ranks below established lesser one", () => {
    // 1 call, 100% success → score = ln(2) ≈ 0.693
    const rookie = scoreListing({
      successRate: 1,
      avgLatencyMs: 100,
      totalCalls: 1,
      lastCalledAt: new Date(),
      windowDays: 30,
    });
    // 100 calls, 80% success → score = 0.8 * ln(101) ≈ 3.693
    const established = scoreListing({
      successRate: 0.8,
      avgLatencyMs: 100,
      totalCalls: 100,
      lastCalledAt: new Date(),
      windowDays: 30,
    });
    assert.ok(
      established > rookie,
      `established (${established}) should outrank rookie (${rookie})`,
    );
  });
});