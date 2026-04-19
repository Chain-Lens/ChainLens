import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { statusHandler, type StatusDeps } from "./status.js";

function fakeFetch(responder: (url: string) => { status: number; body: unknown }) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push(url);
    const { status, body } = responder(url);
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { fetch: impl, calls };
}

describe("statusHandler", () => {
  it("returns found=false on 404", async () => {
    const { fetch } = fakeFetch(() => ({ status: 404, body: { error: "evidence_not_found" } }));
    const deps: StatusDeps = { apiBaseUrl: "http://x/api", fetch };
    const out = await statusHandler({ job_id: "42" }, deps);
    assert.equal(out.found, false);
  });

  it("returns parsed evidence on 200", async () => {
    const ev = { onchainJobId: "42", status: "COMPLETED" };
    const { fetch, calls } = fakeFetch(() => ({ status: 200, body: ev }));
    const out = await statusHandler({ job_id: 42n }, { apiBaseUrl: "http://x/api", fetch });
    assert.equal(out.found, true);
    assert.deepEqual(out.evidence, ev);
    assert.equal(calls[0], "http://x/api/evidence/42");
  });

  it("rejects non-numeric job ids", async () => {
    const { fetch } = fakeFetch(() => ({ status: 200, body: {} }));
    await assert.rejects(
      statusHandler({ job_id: "abc" }, { apiBaseUrl: "http://x/api", fetch }),
      /non-negative integer/,
    );
  });

  it("throws on 500", async () => {
    const { fetch } = fakeFetch(() => ({ status: 500, body: { error: "boom" } }));
    await assert.rejects(
      statusHandler({ job_id: "1" }, { apiBaseUrl: "http://x/api", fetch }),
      /backend returned 500/,
    );
  });
});
