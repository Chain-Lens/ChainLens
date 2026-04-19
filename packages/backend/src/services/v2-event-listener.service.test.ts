import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  handleJobCreated,
  handleJobSubmitted,
  handlePaymentRefunded,
  handleJobResultRecorded,
  type V2ListenerDeps,
  type ListenerLogger,
} from "./v2-event-listener.service.js";
import type {
  EvidenceStore,
  EvidenceRecordInput,
  EvidenceCompletion,
  EvidenceView,
} from "./evidence.service.js";

interface StoreCalls {
  creates: EvidenceRecordInput[];
  completes: Array<{ jobId: bigint; patch: EvidenceCompletion }>;
}

interface LogCalls {
  info: Array<{ obj: object; msg: string }>;
  warn: Array<{ obj: object; msg: string }>;
  error: Array<{ obj: object; msg: string }>;
}

function makeStore(
  calls: StoreCalls,
  override: Partial<EvidenceStore> = {},
): EvidenceStore {
  return {
    async create(data) {
      calls.creates.push(data);
    },
    async complete(jobId, patch) {
      calls.completes.push({ jobId, patch });
    },
    async findByOnchainId(): Promise<EvidenceView | null> {
      return null;
    },
    ...override,
  };
}

function makeLogger(log: LogCalls): ListenerLogger {
  return {
    info: (obj, msg) => log.info.push({ obj, msg }),
    warn: (obj, msg) => log.warn.push({ obj, msg }),
    error: (obj, msg) => log.error.push({ obj, msg }),
  };
}

const ZERO32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;
const TASK32 =
  "0x1111111111111111111111111111111111111111111111111111111111111111" as const;
const INPUTS_HASH =
  "0x2222222222222222222222222222222222222222222222222222222222222222" as const;
const RESPONSE_HASH =
  "0x3333333333333333333333333333333333333333333333333333333333333333" as const;
const BUYER = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
const SELLER = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;

describe("handleJobCreated", () => {
  let calls: StoreCalls;
  let log: LogCalls;
  let deps: V2ListenerDeps;
  beforeEach(() => {
    calls = { creates: [], completes: [] };
    log = { info: [], warn: [], error: [] };
    deps = {
      store: makeStore(calls),
      platformUrl: "http://localhost:3001/",
      logger: makeLogger(log),
    };
  });

  it("creates a Job row with PAID status and canonical evidenceURI", async () => {
    await handleJobCreated(
      {
        jobId: 42n,
        buyer: BUYER,
        seller: SELLER,
        taskType: TASK32,
        amount: 100000n,
        inputsHash: INPUTS_HASH,
        apiId: 7n,
      },
      deps,
    );
    assert.equal(calls.creates.length, 1);
    const row = calls.creates[0];
    assert.equal(row.onchainJobId, 42n);
    assert.equal(row.buyer, BUYER);
    assert.equal(row.seller, SELLER);
    assert.equal(row.apiId, 7n);
    assert.equal(row.taskType, TASK32);
    assert.equal(row.amount, "100000");
    assert.equal(row.inputsHash, INPUTS_HASH);
    assert.equal(row.evidenceURI, "http://localhost:3001/api/evidence/42");
    assert.equal(log.error.length, 0);
    assert.equal(log.info.length, 1);
  });

  it("stores taskType as null when the event carries the zero bytes32 (legacy path)", async () => {
    await handleJobCreated(
      {
        jobId: 1n,
        buyer: BUYER,
        seller: SELLER,
        taskType: ZERO32,
        amount: 1n,
        inputsHash: INPUTS_HASH,
        apiId: 1n,
      },
      deps,
    );
    assert.equal(calls.creates[0].taskType, null);
  });

  it("swallows store failures but logs them at error level", async () => {
    deps = {
      ...deps,
      store: makeStore(calls, {
        async create() {
          throw new Error("db down");
        },
      }),
    };
    await handleJobCreated(
      {
        jobId: 9n,
        buyer: BUYER,
        seller: SELLER,
        taskType: TASK32,
        amount: 1n,
        inputsHash: INPUTS_HASH,
        apiId: 1n,
      },
      deps,
    );
    assert.equal(log.error.length, 1);
    assert.match(log.error[0].msg, /JobCreated handler failed/);
  });
});

describe("handleJobSubmitted", () => {
  let calls: StoreCalls;
  let log: LogCalls;
  let deps: V2ListenerDeps;
  beforeEach(() => {
    calls = { creates: [], completes: [] };
    log = { info: [], warn: [], error: [] };
    deps = {
      store: makeStore(calls),
      platformUrl: "http://localhost:3001",
      logger: makeLogger(log),
    };
  });

  it("marks the job COMPLETED with the responseHash from the event", async () => {
    await handleJobSubmitted(
      {
        jobId: 42n,
        responseHash: RESPONSE_HASH,
        evidenceURI: "http://localhost:3001/api/evidence/42",
      },
      deps,
    );
    assert.equal(calls.completes.length, 1);
    const c = calls.completes[0];
    assert.equal(c.jobId, 42n);
    assert.equal(c.patch.status, "COMPLETED");
    assert.equal(c.patch.responseHash, RESPONSE_HASH);
    assert.equal(log.error.length, 0);
  });

  it("logs but does not throw when the row is missing (race with JobCreated)", async () => {
    deps = {
      ...deps,
      store: makeStore(calls, {
        async complete() {
          throw new Error("record not found");
        },
      }),
    };
    await handleJobSubmitted(
      {
        jobId: 99n,
        responseHash: RESPONSE_HASH,
        evidenceURI: "x",
      },
      deps,
    );
    assert.equal(log.error.length, 1);
  });
});

describe("handlePaymentRefunded", () => {
  let calls: StoreCalls;
  let log: LogCalls;
  let deps: V2ListenerDeps;
  beforeEach(() => {
    calls = { creates: [], completes: [] };
    log = { info: [], warn: [], error: [] };
    deps = {
      store: makeStore(calls),
      platformUrl: "http://localhost:3001",
      logger: makeLogger(log),
    };
  });

  it("marks the job REFUNDED", async () => {
    await handlePaymentRefunded(
      { paymentId: 42n, buyer: BUYER, amount: 100000n },
      deps,
    );
    assert.equal(calls.completes.length, 1);
    assert.equal(calls.completes[0].jobId, 42n);
    assert.equal(calls.completes[0].patch.status, "REFUNDED");
  });
});

describe("handleJobResultRecorded", () => {
  it("only logs (reputation is authoritative on-chain)", () => {
    const calls: StoreCalls = { creates: [], completes: [] };
    const log: LogCalls = { info: [], warn: [], error: [] };
    const deps: V2ListenerDeps = {
      store: makeStore(calls),
      platformUrl: "http://x",
      logger: makeLogger(log),
    };
    handleJobResultRecorded(
      { seller: SELLER, success: true, amount: 100000n },
      deps,
    );
    assert.equal(calls.creates.length, 0);
    assert.equal(calls.completes.length, 0);
    assert.equal(log.info.length, 1);
    assert.match(log.info[0].msg, /JobResultRecorded/);
  });
});
