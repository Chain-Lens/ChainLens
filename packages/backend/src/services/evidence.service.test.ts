import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildEvidenceURI,
  recordJobPaid,
  recordJobCompletion,
  getEvidence,
  type EvidenceStore,
  type EvidenceView,
  type EvidenceRecordInput,
  type EvidenceCompletion,
} from "./evidence.service.js";

function makeStore(
  initial: EvidenceView | null = null,
): { store: EvidenceStore; calls: {
  create: EvidenceRecordInput[];
  complete: Array<{ onchainJobId: bigint; patch: EvidenceCompletion }>;
  find: bigint[];
}; state: { view: EvidenceView | null } } {
  const calls = {
    create: [] as EvidenceRecordInput[],
    complete: [] as Array<{ onchainJobId: bigint; patch: EvidenceCompletion }>,
    find: [] as bigint[],
  };
  const state = { view: initial };
  const store: EvidenceStore = {
    async create(data) {
      calls.create.push(data);
    },
    async complete(onchainJobId, patch) {
      calls.complete.push({ onchainJobId, patch });
      if (state.view && state.view.onchainJobId === onchainJobId.toString()) {
        state.view = {
          ...state.view,
          status: patch.status,
          response: patch.response ?? null,
          responseHash: patch.responseHash ?? null,
          errorReason: patch.errorReason ?? null,
          completedAt: new Date().toISOString(),
        };
      }
    },
    async findByOnchainId(onchainJobId) {
      calls.find.push(onchainJobId);
      return state.view;
    },
  };
  return { store, calls, state };
}

describe("buildEvidenceURI", () => {
  it("composes the canonical evidence URI", () => {
    assert.equal(
      buildEvidenceURI(42n, "http://localhost:3001"),
      "http://localhost:3001/api/evidence/42",
    );
  });

  it("strips trailing slashes from the platform URL", () => {
    assert.equal(
      buildEvidenceURI(7n, "https://api.chain-lens.xyz/"),
      "https://api.chain-lens.xyz/api/evidence/7",
    );
    assert.equal(
      buildEvidenceURI(7n, "https://api.chain-lens.xyz///"),
      "https://api.chain-lens.xyz/api/evidence/7",
    );
  });
});

describe("recordJobPaid", () => {
  it("defaults status to PAID when caller omits it", async () => {
    const { store, calls } = makeStore();
    await recordJobPaid(
      {
        onchainJobId: 1n,
        escrowAddress: "0xEscrow",
        buyer: "0xBuyer",
        seller: "0xSeller",
        apiId: 2n,
        amount: "1.500000",
        inputsHash: "0xdeadbeef",
        evidenceURI: "http://localhost:3001/api/evidence/1",
      },
      store,
    );
    assert.equal(calls.create.length, 1);
    assert.equal(calls.create[0].status, "PAID");
  });

  it("preserves an explicit status override", async () => {
    const { store, calls } = makeStore();
    await recordJobPaid(
      {
        onchainJobId: 2n,
        escrowAddress: "0xEscrow",
        buyer: "0xB",
        seller: "0xS",
        apiId: 1n,
        amount: 1,
        inputsHash: "0x00",
        evidenceURI: "u",
        status: "PENDING",
      },
      store,
    );
    assert.equal(calls.create[0].status, "PENDING");
  });
});

describe("recordJobCompletion", () => {
  it("forwards the completion patch verbatim", async () => {
    const { store, calls } = makeStore();
    await recordJobCompletion(
      10n,
      {
        status: "COMPLETED",
        response: { ok: true },
        responseHash: "0xabc",
      },
      store,
    );
    assert.equal(calls.complete.length, 1);
    assert.equal(calls.complete[0].onchainJobId, 10n);
    assert.equal(calls.complete[0].patch.status, "COMPLETED");
    assert.deepEqual(calls.complete[0].patch.response, { ok: true });
    assert.equal(calls.complete[0].patch.responseHash, "0xabc");
  });

  it("supports REFUNDED and FAILED terminal states with an error reason", async () => {
    const { store, calls } = makeStore();
    await recordJobCompletion(
      11n,
      { status: "REFUNDED", errorReason: "schema_invalid" },
      store,
    );
    await recordJobCompletion(
      12n,
      { status: "FAILED", errorReason: "submit_failed: nonce too low" },
      store,
    );
    assert.equal(calls.complete[0].patch.status, "REFUNDED");
    assert.equal(calls.complete[0].patch.errorReason, "schema_invalid");
    assert.equal(calls.complete[1].patch.status, "FAILED");
    assert.match(calls.complete[1].patch.errorReason ?? "", /submit_failed/);
  });
});

describe("getEvidence", () => {
  it("returns null when the job does not exist", async () => {
    const { store } = makeStore(null);
    const out = await getEvidence(999n, store);
    assert.equal(out, null);
  });

  it("returns the stored evidence view", async () => {
    const view: EvidenceView = {
      onchainJobId: "5",
      buyer: "0xbuyer",
      seller: "0xseller",
      apiId: "3",
      taskType: "blockscout_contract_source",
      amount: "0.100000",
      inputs: { address: "0x..." },
      inputsHash: "0xinputs",
      response: { source: "contract X {}" },
      responseHash: "0xresp",
      evidenceURI: "http://localhost:3001/api/evidence/5",
      status: "COMPLETED",
      errorReason: null,
      createdAt: "2026-04-19T00:00:00.000Z",
      completedAt: "2026-04-19T00:00:05.000Z",
    };
    const { store } = makeStore(view);
    const out = await getEvidence(5n, store);
    assert.deepEqual(out, view);
  });
});
