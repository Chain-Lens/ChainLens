import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getSellerReputation,
  type ReputationDeps,
} from "./reputation.service.js";
import type {
  OnChainSellerInfo,
  OnChainSellerStats,
} from "./on-chain.service.js";

const SELLER = "0x1111111111111111111111111111111111111111" as const;

function makeDeps(override: Partial<ReputationDeps> = {}): ReputationDeps {
  const info: OnChainSellerInfo = {
    sellerAddress: SELLER,
    name: "alice",
    capabilities: ["0xaaaaaaaa" as `0x${string}`],
    metadataURI: "ipfs://meta",
    registeredAt: 1700000000n,
    active: true,
  };
  const stats: OnChainSellerStats = {
    completed: 10n,
    failed: 2n,
    earnings: 123456789n,
  };
  return {
    getSellerInfo: async () => info,
    getSellerReputationBps: async () => 8333n,
    getSellerStats: async () => stats,
    ...override,
  };
}

describe("getSellerReputation", () => {
  it("returns null when the seller is not registered", async () => {
    const deps = makeDeps({ getSellerInfo: async () => null });
    const result = await getSellerReputation(SELLER, deps);
    assert.equal(result, null);
  });

  it("combines seller info, bps, and stats into the public shape", async () => {
    const result = await getSellerReputation(SELLER, makeDeps());
    assert.ok(result);
    assert.equal(result.address, SELLER);
    assert.equal(result.active, true);
    assert.equal(result.name, "alice");
    assert.deepEqual(result.capabilities, ["0xaaaaaaaa"]);
    assert.equal(result.metadataURI, "ipfs://meta");
    assert.equal(result.registeredAt, "1700000000");
    assert.equal(result.reputationBps, "8333");
    assert.equal(result.jobsCompleted, "10");
    assert.equal(result.jobsFailed, "2");
    assert.equal(result.totalEarnings, "123456789");
  });

  it("serializes uint256-range values that exceed Number.MAX_SAFE_INTEGER", async () => {
    const big = 9999999999999999999999n;
    const deps = makeDeps({
      getSellerReputationBps: async () => big,
      getSellerStats: async () => ({
        completed: big,
        failed: big - 1n,
        earnings: big + 1n,
      }),
    });
    const result = await getSellerReputation(SELLER, deps);
    assert.ok(result);
    assert.equal(result.reputationBps, big.toString());
    assert.equal(result.jobsCompleted, big.toString());
    assert.equal(result.totalEarnings, (big + 1n).toString());
  });

  it("does not fetch bps/stats when the seller is unknown", async () => {
    let bpsCalls = 0;
    let statsCalls = 0;
    const deps: ReputationDeps = {
      getSellerInfo: async () => null,
      getSellerReputationBps: async () => {
        bpsCalls++;
        return 0n;
      },
      getSellerStats: async () => {
        statsCalls++;
        return { completed: 0n, failed: 0n, earnings: 0n };
      },
    };
    await getSellerReputation(SELLER, deps);
    assert.equal(bpsCalls, 0);
    assert.equal(statsCalls, 0);
  });
});
