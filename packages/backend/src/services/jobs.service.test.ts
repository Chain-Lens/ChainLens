import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeFilter,
  listJobs,
  JOBS_DEFAULT_LIMIT,
  JOBS_MAX_LIMIT,
  type JobsStore,
  type NormalizedJobFilter,
  type JobListPage,
} from "./jobs.service.js";
import type { EvidenceView } from "./evidence.service.js";

describe("normalizeFilter", () => {
  it("applies defaults when limit/offset are omitted", () => {
    const n = normalizeFilter({});
    assert.equal(n.limit, JOBS_DEFAULT_LIMIT);
    assert.equal(n.offset, 0);
  });

  it("clamps limit to the [1, max] range and floors decimals", () => {
    assert.equal(normalizeFilter({ limit: 0 }).limit, 1);
    assert.equal(normalizeFilter({ limit: -5 }).limit, 1);
    assert.equal(normalizeFilter({ limit: 1000 }).limit, JOBS_MAX_LIMIT);
    assert.equal(normalizeFilter({ limit: 37.9 }).limit, 37);
  });

  it("clamps negative offsets to 0 and floors decimals", () => {
    assert.equal(normalizeFilter({ offset: -10 }).offset, 0);
    assert.equal(normalizeFilter({ offset: 42.7 }).offset, 42);
  });

  it("lowercases buyer and seller addresses", () => {
    const n = normalizeFilter({
      buyer: "0xABCDEF0123456789ABCDEF0123456789ABCDEF01",
      seller: "0xDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF",
    });
    assert.equal(n.buyer, "0xabcdef0123456789abcdef0123456789abcdef01");
    assert.equal(n.seller, "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef");
  });

  it("passes taskType and status through unchanged", () => {
    const n = normalizeFilter({
      taskType: "blockscout_contract_source",
      status: "COMPLETED",
    });
    assert.equal(n.taskType, "blockscout_contract_source");
    assert.equal(n.status, "COMPLETED");
  });

  it("omits buyer/seller fields entirely when not provided", () => {
    const n = normalizeFilter({});
    assert.equal(n.buyer, undefined);
    assert.equal(n.seller, undefined);
    assert.equal(n.taskType, undefined);
    assert.equal(n.status, undefined);
  });
});

describe("listJobs", () => {
  const VIEW: EvidenceView = {
    onchainJobId: "1",
    buyer: "0xbuyer",
    seller: "0xseller",
    apiId: "7",
    taskType: "blockscout_contract_source",
    amount: "0.100000",
    inputs: null,
    inputsHash: "0xinputs",
    response: null,
    responseHash: null,
    evidenceURI: null,
    status: "COMPLETED",
    errorReason: null,
    createdAt: "2026-04-19T10:00:00.000Z",
    completedAt: null,
  };

  it("hands the store a normalized filter and returns its page", async () => {
    const calls: NormalizedJobFilter[] = [];
    const store: JobsStore = {
      async list(filter) {
        calls.push(filter);
        const page: JobListPage = {
          items: [VIEW],
          limit: filter.limit,
          offset: filter.offset,
          total: 1,
        };
        return page;
      },
    };
    const out = await listJobs(
      {
        buyer: "0xABCDEF0123456789ABCDEF0123456789ABCDEF01",
        limit: 999,
        offset: -1,
      },
      store,
    );
    assert.equal(calls.length, 1);
    const seen = calls[0];
    assert.equal(seen.buyer, "0xabcdef0123456789abcdef0123456789abcdef01");
    assert.equal(seen.limit, JOBS_MAX_LIMIT);
    assert.equal(seen.offset, 0);
    assert.equal(out.total, 1);
    assert.equal(out.items.length, 1);
    assert.equal(out.items[0].onchainJobId, "1");
  });
});
