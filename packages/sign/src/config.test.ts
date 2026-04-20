import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { atomicToUsdc, parseConfig, usdcToAtomic } from "./config.js";

describe("usdcToAtomic / atomicToUsdc", () => {
  it("round-trips simple values", () => {
    assert.equal(usdcToAtomic("5.00"), 5_000_000n);
    assert.equal(usdcToAtomic("0.05"), 50_000n);
    assert.equal(usdcToAtomic("123.456789"), 123_456_789n);
    assert.equal(usdcToAtomic("0"), 0n);
    assert.equal(atomicToUsdc(5_000_000n), "5.00");
    assert.equal(atomicToUsdc(50_000n), "0.05");
  });

  it("rejects more than 6 decimal places", () => {
    assert.throws(() => usdcToAtomic("1.1234567"), /6 decimals/);
  });

  it("rejects malformed strings", () => {
    assert.throws(() => usdcToAtomic("abc"), /invalid USDC/);
    assert.throws(() => usdcToAtomic("-1.0"), /invalid USDC/);
    assert.throws(() => usdcToAtomic("1.2.3"), /invalid USDC/);
  });
});

describe("parseConfig", () => {
  it("applies defaults when fields missing", () => {
    const c = parseConfig("{}");
    assert.equal(c.limits.maxPerTxAtomic, 5_000_000n);
    assert.equal(c.limits.maxPerHourAtomic, 50_000_000n);
    assert.equal(c.approvalTimeoutSec, 30);
  });

  it("parses user-supplied decimal limits", () => {
    const c = parseConfig(
      JSON.stringify({
        limits: { maxPerTxUSDC: "0.10", maxPerHourUSDC: "2.50" },
        approvalTimeoutSec: 15,
      }),
    );
    assert.equal(c.limits.maxPerTxAtomic, 100_000n);
    assert.equal(c.limits.maxPerHourAtomic, 2_500_000n);
    assert.equal(c.approvalTimeoutSec, 15);
  });

  it("rejects non-string USDC fields", () => {
    assert.throws(
      () => parseConfig(JSON.stringify({ limits: { maxPerTxUSDC: 5 } })),
      /must be a string/,
    );
  });

  it("rejects invalid JSON", () => {
    assert.throws(() => parseConfig("{not json"), /invalid JSON/);
  });
});
