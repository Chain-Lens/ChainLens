import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CONTRACT_ADDRESSES_V2, SELLER_REGISTRY_ADDRESSES } from "@chainlens/shared";
import {
  startV2EventListener,
  type V2ListenerDeps,
} from "./v2-event-listener.service.js";
import type {
  EvidenceRecordInput,
  EvidenceCompletion,
  EvidenceStore,
} from "./evidence.service.js";

const BASE_SEPOLIA_CHAIN_ID = Object.keys(CONTRACT_ADDRESSES_V2)
  .map(Number)
  .find(
    (id) =>
      CONTRACT_ADDRESSES_V2[id] &&
      CONTRACT_ADDRESSES_V2[id] !== "0x0000000000000000000000000000000000000000" &&
      SELLER_REGISTRY_ADDRESSES[id] &&
      SELLER_REGISTRY_ADDRESSES[id] !==
        "0x0000000000000000000000000000000000000000",
  );

interface Subscription {
  address: `0x${string}`;
  eventName: string;
  onLogs: (logs: unknown[]) => void | Promise<void>;
  onError?: (err: unknown) => void;
}

function makeFakeClient() {
  const subs: Subscription[] = [];
  const unsubs: string[] = [];
  return {
    subs,
    unsubs,
    watchContractEvent(args: {
      address: `0x${string}`;
      abi: readonly unknown[];
      eventName: string;
      onLogs: (logs: unknown[]) => void | Promise<void>;
      onError?: (err: unknown) => void;
    }) {
      subs.push({
        address: args.address,
        eventName: args.eventName,
        onLogs: args.onLogs,
        onError: args.onError,
      });
      return () => unsubs.push(args.eventName);
    },
  };
}

describe("startV2EventListener", () => {
  it("throws when the chain has no v2 escrow deployed", () => {
    const creates: EvidenceRecordInput[] = [];
    const completes: Array<{ jobId: bigint; patch: EvidenceCompletion }> = [];
    const store: EvidenceStore = {
      async create(d) {
        creates.push(d);
      },
      async complete(id, patch) {
        completes.push({ jobId: id, patch });
      },
      async findByOnchainId() {
        return null;
      },
    };
    const deps: V2ListenerDeps = {
      store,
      platformUrl: "http://localhost:3001",
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    };
    assert.throws(
      () =>
        startV2EventListener({
          chainId: 999999,
          publicClient: makeFakeClient(),
          deps,
        }),
      /ApiMarketEscrowV2 not deployed/,
    );
  });

  it("subscribes to 4 events and routes logs to the right handlers end-to-end", async () => {
    assert.ok(
      BASE_SEPOLIA_CHAIN_ID !== undefined,
      "expected at least one chainId to have both v2 + registry addresses configured",
    );
    const creates: EvidenceRecordInput[] = [];
    const completes: Array<{ jobId: bigint; patch: EvidenceCompletion }> = [];
    const store: EvidenceStore = {
      async create(d) {
        creates.push(d);
      },
      async complete(id, patch) {
        completes.push({ jobId: id, patch });
      },
      async findByOnchainId() {
        return null;
      },
    };
    const infos: string[] = [];
    const deps: V2ListenerDeps = {
      store,
      platformUrl: "http://localhost:3001",
      logger: {
        info: (_obj, msg) => infos.push(msg),
        warn: () => {},
        error: () => {},
      },
    };
    const client = makeFakeClient();
    const stop = startV2EventListener({
      chainId: BASE_SEPOLIA_CHAIN_ID,
      publicClient: client,
      deps,
    });

    assert.deepEqual(
      client.subs.map((s) => s.eventName).sort(),
      ["JobCreated", "JobResultRecorded", "JobSubmitted", "PaymentRefunded"],
    );

    const escrow = CONTRACT_ADDRESSES_V2[BASE_SEPOLIA_CHAIN_ID];
    const registry = SELLER_REGISTRY_ADDRESSES[BASE_SEPOLIA_CHAIN_ID];
    for (const s of client.subs) {
      if (s.eventName === "JobResultRecorded") assert.equal(s.address, registry);
      else assert.equal(s.address, escrow);
    }

    const created = client.subs.find((s) => s.eventName === "JobCreated");
    const submitted = client.subs.find((s) => s.eventName === "JobSubmitted");
    const refunded = client.subs.find((s) => s.eventName === "PaymentRefunded");
    const recorded = client.subs.find((s) => s.eventName === "JobResultRecorded");

    await created!.onLogs([
      {
        args: {
          jobId: 1n,
          buyer: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          seller: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          taskType:
            "0x1111111111111111111111111111111111111111111111111111111111111111",
          amount: 100000n,
          inputsHash:
            "0x2222222222222222222222222222222222222222222222222222222222222222",
          apiId: 7n,
        },
      },
    ]);
    await submitted!.onLogs([
      {
        args: {
          jobId: 1n,
          responseHash:
            "0x3333333333333333333333333333333333333333333333333333333333333333",
          evidenceURI: "http://localhost:3001/api/evidence/1",
        },
      },
    ]);
    await refunded!.onLogs([
      {
        args: {
          paymentId: 2n,
          buyer: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          amount: 50000n,
        },
      },
    ]);
    recorded!.onLogs([
      {
        args: {
          seller: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          success: true,
          amount: 100000n,
        },
      },
    ]);

    assert.equal(creates.length, 1);
    assert.equal(creates[0].onchainJobId, 1n);
    assert.equal(completes.length, 2);
    assert.equal(completes[0].jobId, 1n);
    assert.equal(completes[0].patch.status, "COMPLETED");
    assert.equal(completes[1].jobId, 2n);
    assert.equal(completes[1].patch.status, "REFUNDED");

    stop();
    assert.equal(client.unsubs.length, 4);
  });
});
