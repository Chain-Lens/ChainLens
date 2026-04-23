import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { inspectHandler, type InspectDeps } from "./inspect.js";

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

const SAMPLE_DETAIL = {
  listingId: "7",
  owner: "0xaaaa",
  payout: "0xaaaa",
  active: true,
  metadataURI: "data:application/json,%7B%22name%22%3A%22TSLA%22%7D",
  metadata: {
    name: "TSLA Price",
    description: "Real-time TSLA analytics",
    endpoint: "https://seller.example.com/tsla",
    method: "GET",
    pricing: { amount: "50000", unit: "per_call" },
    tags: ["finance", "stocks"],
    inputs_schema: {
      type: "object",
      properties: { ticker: { type: "string" } },
      required: ["ticker"],
    },
    output_schema: {
      type: "object",
      properties: { price: { type: "number" } },
      required: ["price"],
    },
    example_request: { ticker: "TSLA" },
    example_response: { price: 150.23 },
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
  recentErrors: {
    windowDays: 7,
    totalFailures: 4,
    breakdown: {
      seller_timeout: 1,
      seller_5xx: 1,
      response_rejected_schema: 2,
    },
  },
};

describe("inspectHandler", () => {
  it("hits /market/listings/:id and threads through recentErrors", async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 200, body: SAMPLE_DETAIL }));
    const deps: InspectDeps = { apiBaseUrl: "http://x/api", fetch };
    const out = await inspectHandler({ listing_id: "7" }, deps);

    assert.equal(calls.length, 1);
    assert.equal(calls[0], "http://x/api/market/listings/7");
    assert.equal(out.listingId, "7");
    assert.equal(out.stats.successRate, 0.9);
    assert.equal(out.recentErrors.totalFailures, 4);
    assert.equal(out.recentErrors.breakdown["seller_timeout"], 1);
    assert.equal(out.recentErrors.breakdown["seller_5xx"], 1);
    assert.equal(out.securityRecentFailures.schemaRejects, 2);
    assert.equal(out.securityRecentFailures.hasSchemaRejects, true);
    assert.equal(out.securityRecentFailures.totalPolicyRejects, 2);
  });

  it("derives priceUsdc from metadata.pricing.amount", async () => {
    const { fetch } = fakeFetch(() => ({ status: 200, body: SAMPLE_DETAIL }));
    const out = await inspectHandler(
      { listing_id: "7" },
      { apiBaseUrl: "http://x/api", fetch },
    );
    assert.equal(out.priceUsdc, "0.050000 USDC");
  });

  it("priceUsdc is null when metadata.pricing.amount is missing or malformed", async () => {
    const { fetch } = fakeFetch(() => ({
      status: 200,
      body: {
        ...SAMPLE_DETAIL,
        metadata: { ...SAMPLE_DETAIL.metadata, pricing: {} },
      },
    }));
    const out = await inspectHandler(
      { listing_id: "7" },
      { apiBaseUrl: "http://x/api", fetch },
    );
    assert.equal(out.priceUsdc, null);
  });

  it("preserves metadataError when backend returned one", async () => {
    const { fetch } = fakeFetch(() => ({
      status: 200,
      body: {
        ...SAMPLE_DETAIL,
        metadata: null,
        metadataError: "metadata fetch 500",
      },
    }));
    const out = await inspectHandler(
      { listing_id: "7" },
      { apiBaseUrl: "http://x/api", fetch },
    );
    assert.equal(out.metadataError, "metadata fetch 500");
    assert.equal(out.priceUsdc, null);
  });

  it("rejects non-decimal listing_id before hitting the network", async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 200, body: SAMPLE_DETAIL }));
    await assert.rejects(
      inspectHandler(
        { listing_id: "abc" },
        { apiBaseUrl: "http://x/api", fetch },
      ),
      /listing_id must be a decimal string/,
    );
    assert.equal(calls.length, 0);
  });

  it("surfaces backend 404 with status text", async () => {
    const { fetch } = fakeFetch(() => ({ status: 404, body: { error: "not found" } }));
    await assert.rejects(
      inspectHandler(
        { listing_id: "999" },
        { apiBaseUrl: "http://x/api", fetch },
      ),
      /backend returned 404/,
    );
  });
});
