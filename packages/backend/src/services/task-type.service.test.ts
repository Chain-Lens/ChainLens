import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  getAllTaskTypesWithConfig,
  clearTaskTypeListCache,
  TASK_TYPE_LIST_TTL_MS,
  type TaskTypeReader,
  type OnChainConfigRaw,
} from "./task-type.service.js";

function makeReader(
  configs: Record<string, OnChainConfigRaw>,
  chainId = 84532,
): TaskTypeReader & { idCalls: number; configCalls: string[] } {
  let idCalls = 0;
  const configCalls: string[] = [];
  return {
    idCalls,
    configCalls,
    async getAllIds() {
      idCalls += 1;
      (this as { idCalls: number }).idCalls = idCalls;
      return Object.keys(configs) as `0x${string}`[];
    },
    async getConfig(id) {
      configCalls.push(id);
      const cfg = configs[id];
      if (!cfg) throw new Error(`not found: ${id}`);
      return cfg;
    },
    chainId() {
      return chainId;
    },
  };
}

const SAMPLE: Record<string, OnChainConfigRaw> = {
  "0xaa": {
    name: "defillama_tvl",
    schemaURI: "ipfs://abc",
    maxResponseTime: 60n,
    minBudget: 10000n,
    enabled: true,
    registeredAt: 1_700_000_000n,
  },
  "0xbb": {
    name: "legacy_disabled",
    schemaURI: "",
    maxResponseTime: 30n,
    minBudget: 0n,
    enabled: false,
    registeredAt: 1_600_000_000n,
  },
};

describe("getAllTaskTypesWithConfig", () => {
  beforeEach(() => clearTaskTypeListCache());

  it("projects on-chain config into list items (bigints → number/string)", async () => {
    const reader = makeReader(SAMPLE);
    const items = await getAllTaskTypesWithConfig({ reader });

    assert.equal(items.length, 2);
    const tvl = items.find((i) => i.name === "defillama_tvl");
    assert.equal(tvl?.maxResponseTime, 60);
    assert.equal(tvl?.minBudget, "10000"); // string so JSON doesn't choke on bigint
    assert.equal(tvl?.registeredAt, 1_700_000_000);
    assert.equal(tvl?.enabled, true);

    const legacy = items.find((i) => i.name === "legacy_disabled");
    assert.equal(legacy?.enabled, false);
  });

  it("caches within the TTL window and serves the same payload", async () => {
    const reader = makeReader(SAMPLE);
    const now = (() => {
      let t = 1_000_000;
      return () => t;
    })();

    const first = await getAllTaskTypesWithConfig({ reader, now });
    assert.equal(reader.configCalls.length, 2);

    // second call inside TTL — no new on-chain reads
    const second = await getAllTaskTypesWithConfig({ reader, now });
    assert.equal(reader.configCalls.length, 2, "cache hit should skip chain reads");
    assert.deepEqual(second, first);
  });

  it("refetches after the TTL expires", async () => {
    const reader = makeReader(SAMPLE);
    let t = 1_000_000;
    const now = () => t;

    await getAllTaskTypesWithConfig({ reader, now });
    assert.equal(reader.configCalls.length, 2);

    t += TASK_TYPE_LIST_TTL_MS + 1;
    await getAllTaskTypesWithConfig({ reader, now });
    assert.equal(
      reader.configCalls.length,
      4,
      "expired cache should trigger fresh getConfig calls",
    );
  });

  it("skips cache when skipCache=true", async () => {
    const reader = makeReader(SAMPLE);
    await getAllTaskTypesWithConfig({ reader });
    assert.equal(reader.configCalls.length, 2);
    await getAllTaskTypesWithConfig({ reader, skipCache: true });
    assert.equal(reader.configCalls.length, 4);
  });

  it("keeps caches per chainId independent", async () => {
    const sepolia = makeReader(SAMPLE, 84532);
    const mainnet = makeReader({ "0xcc": SAMPLE["0xaa"] as OnChainConfigRaw }, 8453);

    await getAllTaskTypesWithConfig({ reader: sepolia });
    await getAllTaskTypesWithConfig({ reader: mainnet });

    // Second call on each should hit the respective cache.
    const sepoliaBefore = sepolia.configCalls.length;
    const mainnetBefore = mainnet.configCalls.length;
    await getAllTaskTypesWithConfig({ reader: sepolia });
    await getAllTaskTypesWithConfig({ reader: mainnet });
    assert.equal(sepolia.configCalls.length, sepoliaBefore);
    assert.equal(mainnet.configCalls.length, mainnetBefore);
  });
});
