import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createLimitEnforcer } from "./limit-enforcer.js";

const limits = {
  maxPerTxAtomic: 5_000_000n, // 5 USDC
  maxPerHourAtomic: 10_000_000n, // 10 USDC
};

describe("limitEnforcer", () => {
  it("blocks a single tx that exceeds per-tx cap", () => {
    const e = createLimitEnforcer(limits);
    const r = e.check(6_000_000n);
    assert.equal(r.ok, false);
    if (r.ok) throw new Error("unreachable");
    assert.equal(r.reason, "per-tx-exceeded");
    assert.equal(r.limitAtomic, 5_000_000n);
  });

  it("blocks when cumulative hour-window would exceed cap", () => {
    const t0 = 1_000_000_000_000;
    const e = createLimitEnforcer(limits);
    e.record(4_000_000n, t0);
    e.record(4_000_000n, t0 + 60_000);
    const r = e.check(3_000_000n, t0 + 120_000);
    assert.equal(r.ok, false);
    if (r.ok) throw new Error("unreachable");
    assert.equal(r.reason, "per-hour-exceeded");
    assert.equal(r.offendingAtomic, 11_000_000n);
  });

  it("prunes window entries older than 60 minutes", () => {
    const t0 = 1_000_000_000_000;
    const e = createLimitEnforcer(limits);
    e.record(5_000_000n, t0);
    // 61 minutes later — window should be empty
    const now = t0 + 61 * 60 * 1000;
    assert.equal(e.windowSum(now), 0n);
    const r = e.check(5_000_000n, now);
    assert.equal(r.ok, true);
    if (!r.ok) throw new Error("unreachable");
    assert.equal(r.remainingHourAtomic, 5_000_000n);
  });

  it("reports remaining hour budget on ok", () => {
    const t0 = 1_000_000_000_000;
    const e = createLimitEnforcer(limits);
    e.record(3_000_000n, t0);
    const r = e.check(2_000_000n, t0 + 10_000);
    assert.equal(r.ok, true);
    if (!r.ok) throw new Error("unreachable");
    assert.equal(r.remainingHourAtomic, 5_000_000n); // 10 - 3 - 2
  });
});
