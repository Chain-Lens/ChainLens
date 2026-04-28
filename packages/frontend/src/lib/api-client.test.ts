import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { apiClient } from "./api-client.js";

type MockFetch = typeof globalThis.fetch;

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("apiClient", () => {
  beforeEach(() => {
    globalThis.fetch = undefined as unknown as MockFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends JSON requests with credentials included", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(input), "http://localhost:3001/api/admin/jobs");
      assert.equal(init?.credentials, "include");
      assert.equal(init?.method, "POST");
      assert.equal(init?.body, JSON.stringify({ status: "pending" }));
      assert.deepEqual(init?.headers, { "Content-Type": "application/json" });
      return jsonResponse({ ok: true });
    }) as MockFetch;

    const result = await apiClient.post<{ ok: boolean }>("/admin/jobs", {
      status: "pending",
    });

    assert.deepEqual(result, { ok: true });
  });

  it("uses backend error messages when available", async () => {
    globalThis.fetch = (async () =>
      jsonResponse(
        { error: { message: "Unauthorized seller session" } },
        { status: 401 },
      )) as MockFetch;

    await assert.rejects(
      () => apiClient.get("/seller/listings"),
      /Unauthorized seller session/,
    );
  });

  it("falls back to a generic status message when the error body is not json", async () => {
    globalThis.fetch = (async () =>
      new Response("upstream failed", { status: 502 })) as MockFetch;

    await assert.rejects(
      () => apiClient.delete("/seller/listings/api-1"),
      /Request failed with status 502/,
    );
  });
});
