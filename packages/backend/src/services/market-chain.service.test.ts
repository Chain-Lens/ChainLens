import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  resolveListingRuntimeConfig,
  calcFeeAndNet,
  type ListingMetadata,
} from "./market-chain.service.js";

const baseEndpoint = "https://api.example.com/v1";

function meta(over: Partial<ListingMetadata> = {}): ListingMetadata {
  return { endpoint: baseEndpoint, ...over };
}

describe("resolveListingRuntimeConfig", () => {
  describe("priceAtomic", () => {
    test("reads pricing.amount when present", () => {
      const cfg = resolveListingRuntimeConfig(meta({ pricing: { amount: "50000" } }));
      assert.equal(cfg.priceAtomic, "50000");
    });

    test("returns null when pricing is absent", () => {
      const cfg = resolveListingRuntimeConfig(meta());
      assert.equal(cfg.priceAtomic, null);
    });

    test("returns null when pricing.amount is absent", () => {
      const cfg = resolveListingRuntimeConfig(meta({ pricing: { unit: "per_call" } }));
      assert.equal(cfg.priceAtomic, null);
    });
  });

  describe("maxLatencyMs", () => {
    test("defaults to 5000 when max_latency_ms is absent", () => {
      const cfg = resolveListingRuntimeConfig(meta());
      assert.equal(cfg.maxLatencyMs, 5000);
    });

    test("uses max_latency_ms when valid positive number", () => {
      const cfg = resolveListingRuntimeConfig(meta({ max_latency_ms: 2000 }));
      assert.equal(cfg.maxLatencyMs, 2000);
    });

    test("defaults to 5000 when max_latency_ms is zero", () => {
      const cfg = resolveListingRuntimeConfig(meta({ max_latency_ms: 0 }));
      assert.equal(cfg.maxLatencyMs, 5000);
    });

    test("defaults to 5000 when max_latency_ms is negative", () => {
      const cfg = resolveListingRuntimeConfig(meta({ max_latency_ms: -100 }));
      assert.equal(cfg.maxLatencyMs, 5000);
    });
  });

  describe("taskCategory", () => {
    test("uses task_category when present", () => {
      const cfg = resolveListingRuntimeConfig(meta({ task_category: "finance" }));
      assert.equal(cfg.taskCategory, "finance");
    });

    test("falls back to category when task_category absent", () => {
      const cfg = resolveListingRuntimeConfig(meta({ category: "analytics" }));
      assert.equal(cfg.taskCategory, "analytics");
    });

    test("falls back to first tag when task_category and category absent", () => {
      const cfg = resolveListingRuntimeConfig(meta({ tags: ["defi", "oracle"] }));
      assert.equal(cfg.taskCategory, "defi");
    });

    test("defaults to general when all category fields absent", () => {
      const cfg = resolveListingRuntimeConfig(meta());
      assert.equal(cfg.taskCategory, "general");
    });

    test("task_category takes priority over category and tags", () => {
      const cfg = resolveListingRuntimeConfig(
        meta({ task_category: "specific", category: "broad", tags: ["tag1"] }),
      );
      assert.equal(cfg.taskCategory, "specific");
    });
  });

  describe("outputSchema", () => {
    test("returns null when output_schema absent", () => {
      const cfg = resolveListingRuntimeConfig(meta());
      assert.equal(cfg.outputSchema, null);
    });

    test("returns schema when present", () => {
      const schema = { type: "object", properties: { result: { type: "string" } } };
      const cfg = resolveListingRuntimeConfig(meta({ output_schema: schema }));
      assert.deepEqual(cfg.outputSchema, schema);
    });
  });
});

describe("calcFeeAndNet", () => {
  test("250 bps on 50000 atomic → fee 1250, net 48750", () => {
    const { fee, net } = calcFeeAndNet("50000", 250);
    assert.equal(fee, "1250");
    assert.equal(net, "48750");
  });

  test("0 bps → fee 0, net equals amount", () => {
    const { fee, net } = calcFeeAndNet("50000", 0);
    assert.equal(fee, "0");
    assert.equal(net, "50000");
  });

  test("10000 bps (100%) → fee equals amount, net 0", () => {
    const { fee, net } = calcFeeAndNet("100000", 10000);
    assert.equal(fee, "100000");
    assert.equal(net, "0");
  });

  test("large amount — no precision loss with BigInt", () => {
    const { fee, net } = calcFeeAndNet("1000000000", 250);
    assert.equal(fee, "25000000");
    assert.equal(net, "975000000");
  });
});
