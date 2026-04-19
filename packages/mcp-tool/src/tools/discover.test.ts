import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { discoverHandler, type DiscoverDeps } from "./discover.js";

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

describe("discoverHandler", () => {
  it("builds URL with task_type and limit and returns the parsed body", async () => {
    const { fetch, calls } = fakeFetch(() => ({
      status: 200,
      body: { items: [{ name: "A" }], total: 1, limit: 5, offset: 0 },
    }));
    const deps: DiscoverDeps = { apiBaseUrl: "http://x/api", fetch };
    const out = await discoverHandler(
      { task_type: "blockscout_tx_info", limit: 5 },
      deps,
    );
    assert.equal(calls.length, 1);
    assert.ok(calls[0].includes("task_type=blockscout_tx_info"));
    assert.ok(calls[0].includes("limit=5"));
    assert.equal(out.total, 1);
  });

  it("omits query string entirely when no filters supplied", async () => {
    const { fetch, calls } = fakeFetch(() => ({
      status: 200,
      body: { items: [], total: 0, limit: 20, offset: 0 },
    }));
    await discoverHandler({}, { apiBaseUrl: "http://x/api", fetch });
    assert.equal(calls[0], "http://x/api/sellers");
  });

  it("passes active_only as 'true'/'false' strings", async () => {
    const { fetch, calls } = fakeFetch(() => ({
      status: 200,
      body: { items: [], total: 0, limit: 20, offset: 0 },
    }));
    await discoverHandler(
      { active_only: false },
      { apiBaseUrl: "http://x/api", fetch },
    );
    assert.ok(calls[0].includes("active_only=false"));
  });

  it("throws with status text when backend returns non-ok", async () => {
    const { fetch } = fakeFetch(() => ({ status: 500, body: { error: "boom" } }));
    await assert.rejects(
      discoverHandler({}, { apiBaseUrl: "http://x/api", fetch }),
      /backend returned 500/,
    );
  });
});
