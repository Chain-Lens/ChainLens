import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { fetchRequestStatus, refundRequest } from "./requests.js";

type MockFetch = typeof globalThis.fetch;

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("requests lib", () => {
  beforeEach(() => {
    globalThis.fetch = undefined as unknown as MockFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetchRequestStatus calls the request status endpoint and returns parsed json", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(input), "http://localhost:3001/api/requests/req-123");
      assert.equal(init?.cache, "no-store");
      return jsonResponse({
        id: "req-123",
        buyer: "0xabc",
        seller: "0xdef",
        api: { name: "Weather API", description: "Forecasts" },
      });
    }) as MockFetch;

    const result = await fetchRequestStatus("req-123");

    assert.equal(result.id, "req-123");
    assert.equal(result.api?.name, "Weather API");
  });

  it("refundRequest posts the buyer payload to the refund endpoint", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(input), "http://localhost:3001/api/payments/requests/req-123/refund");
      assert.equal(init?.method, "POST");
      assert.equal(init?.cache, "no-store");
      assert.equal(
        init?.body,
        JSON.stringify({ buyer: "0xabcdef0000000000000000000000000000000001" }),
      );
      return jsonResponse({ ok: true });
    }) as MockFetch;

    await refundRequest("req-123", "0xabcdef0000000000000000000000000000000001");
  });

  it("surfaces backend error messages when a request fails", async () => {
    globalThis.fetch = (async () =>
      jsonResponse(
        { error: { message: "Refund window expired" } },
        { status: 400 },
      )) as MockFetch;

    await assert.rejects(
      () => refundRequest("req-123", "0xabc"),
      /Refund window expired/,
    );
  });
});
