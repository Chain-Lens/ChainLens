import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { getMarketplaceApis } from "./marketplace.js";

type MockFetch = typeof globalThis.fetch;

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("getMarketplaceApis", () => {
  beforeEach(() => {
    globalThis.fetch = undefined as unknown as MockFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns backend items and marks the result as non-mock on success", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      assert.match(String(input), /\/apis\?category=ai&search=gpt$/);
      return jsonResponse({
        items: [
          {
            id: "api-1",
            name: "GPT Summarizer",
            description: "Summarize text",
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      });
    }) as MockFetch;

    const result = await getMarketplaceApis({ category: "ai", search: "gpt" });

    assert.equal(result.isMock, false);
    assert.equal(result.apis.length, 1);
    assert.equal(result.apis[0]?.id, "api-1");
  });

  it("falls back to mock data when the backend request fails", async () => {
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as MockFetch;

    const result = await getMarketplaceApis({ category: "ai", search: "sentiment" });

    assert.equal(result.isMock, true);
    assert.equal(result.apis.length, 1);
    assert.equal(result.apis[0]?.name, "Sentiment Analysis");
  });

  it("falls back to filtered mock data when the backend returns a non-ok response", async () => {
    globalThis.fetch = (async () =>
      jsonResponse({ error: { message: "server error" } }, { status: 503 })) as MockFetch;

    const result = await getMarketplaceApis({ category: "data", search: "weather" });

    assert.equal(result.isMock, true);
    assert.equal(result.apis.length, 1);
    assert.equal(result.apis[0]?.name, "Weather API");
  });
});
