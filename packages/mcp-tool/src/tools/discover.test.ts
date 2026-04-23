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

const SAMPLE_ITEM = {
  listingId: "7",
  owner: "0xaaaa",
  payout: "0xaaaa",
  active: true,
  metadata: {
    name: "TSLA Price",
    description: "Real-time TSLA analytics",
    endpoint: "https://seller.example.com/tsla",
    method: "GET",
    pricing: { amount: "50000", unit: "per_call" },
    tags: ["finance", "stocks"],
  },
  stats: {
    successRate: 0.9,
    avgLatencyMs: 340,
    totalCalls: 10,
    successes: 9,
    lastCalledAt: "2026-04-23T00:00:00.000Z",
    windowDays: 30,
  },
  score: 2.121,
};

const SAMPLE_PAGE = {
  items: [SAMPLE_ITEM],
  total: 1,
  totalBeforeFilter: 1,
  limit: 20,
  sort: "score",
};

describe("discoverHandler", () => {
  it("hits v3 /market/listings and enriches items with priceUsdc", async () => {
    const { fetch, calls } = fakeFetch(() => ({
      status: 200,
      body: SAMPLE_PAGE,
    }));
    const deps: DiscoverDeps = { apiBaseUrl: "http://x/api", fetch };
    const out = await discoverHandler({ q: "tsla", limit: 5 }, deps);

    assert.equal(calls.length, 1);
    assert.ok(
      calls[0].startsWith("http://x/api/market/listings?"),
      `expected v3 path, got ${calls[0]}`,
    );
    assert.ok(calls[0].includes("q=tsla"));
    assert.ok(calls[0].includes("limit=5"));

    assert.equal(out.total, 1);
    assert.equal(out.sort, "score");
    assert.equal(out.items[0]!.priceUsdc, "0.050000 USDC");
    assert.equal(out.items[0]!.listingId, "7");
    assert.equal(out.items[0]!.stats.successRate, 0.9);
    assert.equal(out.items[0]!.score, 2.121);
  });

  it("omits query string entirely when no filters supplied", async () => {
    const { fetch, calls } = fakeFetch(() => ({
      status: 200,
      body: { items: [], total: 0, totalBeforeFilter: 0, limit: 20, sort: "score" },
    }));
    await discoverHandler({}, { apiBaseUrl: "http://x/api", fetch });
    assert.equal(calls[0], "http://x/api/market/listings");
  });

  it("threads all filter params into the query string", async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 200, body: SAMPLE_PAGE }));
    await discoverHandler(
      {
        q: "weather",
        tag: "climate",
        min_success_rate: 0.8,
        max_price_usdc: 0.1,
        limit: 50,
        sort: "score_strict",
        seed: "abc",
      },
      { apiBaseUrl: "http://x/api", fetch },
    );
    const url = calls[0]!;
    assert.ok(url.includes("q=weather"));
    assert.ok(url.includes("tag=climate"));
    assert.ok(url.includes("min_success_rate=0.8"));
    assert.ok(url.includes("max_price_usdc=0.1"));
    assert.ok(url.includes("limit=50"));
    assert.ok(url.includes("sort=score_strict"));
    assert.ok(url.includes("seed=abc"));
  });

  it("propagates seed back into the result when the backend echoes it", async () => {
    const { fetch } = fakeFetch(() => ({
      status: 200,
      body: { ...SAMPLE_PAGE, seed: "xyz" },
    }));
    const out = await discoverHandler({ seed: "xyz" }, { apiBaseUrl: "http://x/api", fetch });
    assert.equal(out.seed, "xyz");
  });

  it("priceUsdc is null when metadata lacks a well-formed pricing.amount", async () => {
    const { fetch } = fakeFetch(() => ({
      status: 200,
      body: {
        ...SAMPLE_PAGE,
        items: [
          {
            ...SAMPLE_ITEM,
            metadata: { ...SAMPLE_ITEM.metadata, pricing: {} },
          },
        ],
      },
    }));
    const out = await discoverHandler({}, { apiBaseUrl: "http://x/api", fetch });
    assert.equal(out.items[0]!.priceUsdc, null);
  });

  it("throws with status text when backend returns non-ok", async () => {
    const { fetch } = fakeFetch(() => ({ status: 500, body: { error: "boom" } }));
    await assert.rejects(
      discoverHandler({}, { apiBaseUrl: "http://x/api", fetch }),
      /backend returned 500/,
    );
  });
});