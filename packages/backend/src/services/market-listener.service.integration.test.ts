import { test, describe, beforeEach } from "node:test";
import * as assert from "node:assert/strict";
import { startMarketListener, type MarketListenerDeps } from "./market-listener.service.js";
import type { ListingMetadata } from "./market-chain.service.js";

// ──────────────────────────────────────────────────────────────────────
// Fake builder — fresh state per test via beforeEach assignment
// ──────────────────────────────────────────────────────────────────────

type LogsCallback = (logs: unknown[]) => Promise<void>;

interface FakeEnv {
  deps: MarketListenerDeps;
  upsertCalls: unknown[];
  updateManyCalls: unknown[];
  setFindFirstResult(r: { onChainId: number } | null): void;
  setNextListingId(n: bigint): void;
  fireRegistered(args: {
    listingId: bigint;
    owner: `0x${string}`;
    payout: `0x${string}`;
    metadataURI: string;
  }): Promise<void>;
  fireMetadata(args: { listingId: bigint; metadataURI: string }): Promise<void>;
}

function buildFakeEnv(): FakeEnv {
  const upsertCalls: unknown[] = [];
  const updateManyCalls: unknown[] = [];
  let findFirstResult: { onChainId: number } | null = null;
  let nextListingIdValue = 0n;

  let registeredOnLogs: LogsCallback | undefined;
  let metadataOnLogs: LogsCallback | undefined;

  const db: MarketListenerDeps["db"] = {
    apiListing: {
      async upsert(args) {
        upsertCalls.push(args);
        return {};
      },
      async updateMany(args) {
        updateManyCalls.push(args);
        return { count: 1 };
      },
      async findFirst(_args) {
        return findFirstResult;
      },
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function watchEvent(params: any): () => void {
    if (params.eventName === "ListingRegistered") registeredOnLogs = params.onLogs as LogsCallback;
    if (params.eventName === "ListingMetadataUpdated")
      metadataOnLogs = params.onLogs as LogsCallback;
    return () => {};
  }

  async function resolveMetadata_(uri: string): Promise<ListingMetadata> {
    // Support inline JSON for convenience; otherwise return a stub.
    if (uri.startsWith("data:application/json,")) {
      return JSON.parse(
        decodeURIComponent(uri.slice("data:application/json,".length)),
      ) as ListingMetadata;
    }
    return {
      name: `stub from ${uri}`,
      endpoint: "https://stub.example.com",
      pricing: { amount: "50" },
      tags: ["test"],
    };
  }

  async function readListing_(id: bigint) {
    return {
      owner: "0xOwner" as `0x${string}`,
      payout: "0xPayout" as `0x${string}`,
      metadataURI: `data:application/json,{"name":"Listing ${id}","endpoint":"https://ex.com/${id}"}`,
      active: true,
    };
  }

  const deps: MarketListenerDeps = {
    db,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    watchEvent: watchEvent as any,
    getMarketAddress: () => "0x45bB56fDB0E6bb14d178E417b67Ed7B3323ffFf7",
    readListing_,
    nextListingId_: async () => nextListingIdValue,
    resolveMetadata_,
  };

  return {
    deps,
    upsertCalls,
    updateManyCalls,
    setFindFirstResult: (r) => {
      findFirstResult = r;
    },
    setNextListingId: (n) => {
      nextListingIdValue = n;
    },
    async fireRegistered(args) {
      if (!registeredOnLogs)
        throw new Error(
          "ListingRegistered handler not registered — startMarketListener not called?",
        );
      await registeredOnLogs([{ args }]);
    },
    async fireMetadata(args) {
      if (!metadataOnLogs)
        throw new Error(
          "ListingMetadataUpdated handler not registered — startMarketListener not called?",
        );
      await metadataOnLogs([{ args }]);
    },
  };
}

// ──────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────

describe("market-listener integration", () => {
  let env: FakeEnv;

  beforeEach(() => {
    env = buildFakeEnv();
  });

  test("ListingRegistered → upsert with contractVersion V3 and status PENDING", async () => {
    const { catchupDone } = startMarketListener(env.deps);
    await catchupDone;

    await env.fireRegistered({
      listingId: 1n,
      owner: "0xOwner" as `0x${string}`,
      payout: "0xPayout" as `0x${string}`,
      metadataURI:
        'data:application/json,{"name":"Test API","endpoint":"https://ex.com","pricing":{"amount":"100"},"tags":["finance"]}',
    });

    assert.equal(env.upsertCalls.length, 1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = env.upsertCalls[0] as any;
    assert.equal(call.where.contractVersion_onChainId.contractVersion, "V3");
    assert.equal(call.where.contractVersion_onChainId.onChainId, 1);
    assert.equal(call.create.contractVersion, "V3");
    assert.equal(call.create.status, "PENDING");
    assert.equal(call.create.onChainId, 1);
    assert.equal(call.create.name, "Test API");
    assert.equal(call.create.sellerAddress, "0xowner"); // lowercased
  });

  test("ListingMetadataUpdated → updateMany with metadata fields, status not touched", async () => {
    const { catchupDone } = startMarketListener(env.deps);
    await catchupDone;

    await env.fireMetadata({
      listingId: 2n,
      metadataURI:
        'data:application/json,{"name":"New Name","endpoint":"https://ex.com/v2","pricing":{"amount":"200"}}',
    });

    assert.equal(env.updateManyCalls.length, 1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = env.updateManyCalls[0] as any;
    assert.equal(call.where.contractVersion, "V3");
    assert.equal(call.where.onChainId, 2);
    assert.ok(!("status" in call.data), "updateMany data must not touch status");
    assert.equal(call.data.name, "New Name");
    assert.equal(call.data.endpoint, "https://ex.com/v2");
    assert.equal(call.data.price, "200");
  });

  test("reorg replay (same id re-registered) → update block has no status", async () => {
    const { catchupDone } = startMarketListener(env.deps);
    await catchupDone;

    const log = {
      listingId: 3n,
      owner: "0xOwner" as `0x${string}`,
      payout: "0xPayout" as `0x${string}`,
      metadataURI:
        'data:application/json,{"name":"My API","endpoint":"https://ex.com","pricing":{"amount":"50"}}',
    };

    await env.fireRegistered(log);
    await env.fireRegistered(log); // reorg replay — same id

    assert.equal(env.upsertCalls.length, 2);
    for (const raw of env.upsertCalls) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const call = raw as any;
      assert.ok(
        !("status" in call.update),
        "update block must never touch status (admin approval preserved)",
      );
    }
    // First call creates with PENDING
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assert.equal((env.upsertCalls[0] as any).create.status, "PENDING");
  });

  test("catchupOnBoot fills gap between DB max and on-chain max", async () => {
    env.setFindFirstResult({ onChainId: 3 }); // DB max = 3
    env.setNextListingId(7n); // on-chain nextListingId = 7 → max id = 6

    const { catchupDone } = startMarketListener(env.deps);
    await catchupDone;

    // ids 4, 5, 6 must be upserted
    assert.equal(env.upsertCalls.length, 3);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ids = (env.upsertCalls as any[])
      .map((c) => c.where.contractVersion_onChainId.onChainId)
      .sort((a: number, b: number) => a - b);
    assert.deepEqual(ids, [4, 5, 6]);
  });

  test("catchupOnBoot skips when DB is already at chain height", async () => {
    env.setFindFirstResult({ onChainId: 6 }); // DB max = 6
    env.setNextListingId(7n); // on-chain max id = 6 → no gap

    const { catchupDone } = startMarketListener(env.deps);
    await catchupDone;

    assert.equal(env.upsertCalls.length, 0);
  });
});
