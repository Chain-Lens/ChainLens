import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { preflightEndpointHandler, type PreflightEndpointDeps } from "./preflight-endpoint.js";

// Backend response shape: { status, body, latencyMs, safety: { schemaValid, warnings }, error }
function backendResponse(overrides: Record<string, unknown> = {}) {
  return {
    status: 200,
    body: { ok: true },
    latencyMs: 42,
    safety: { scanned: true, schemaValid: true, warnings: [] },
    error: null,
    ...overrides,
  };
}

function makeDeps(
  responder: (url: string, init?: RequestInit) => { status: number; body: unknown },
): PreflightEndpointDeps & { calls: Array<{ url: string; body: unknown }> } {
  const calls: Array<{ url: string; body: unknown }> = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url, body });
    const { status, body: resBody } = responder(url, init);
    return new Response(JSON.stringify(resBody), { status });
  }) as typeof fetch;
  return { apiBaseUrl: "http://api/api", fetch: fetchFn, calls };
}

describe("preflightEndpointHandler", () => {
  it("maps backend shape to MCP output shape", async () => {
    const deps = makeDeps(() => ({
      status: 200,
      body: backendResponse(),
    }));
    const result = await preflightEndpointHandler(
      { endpoint: "https://api.example.com/data", method: "GET" },
      deps,
    );
    assert.equal(deps.calls[0].url, "http://api/api/seller/preflight");
    assert.equal((deps.calls[0].body as { method: string }).method, "GET");
    assert.equal(result.http_status, 200);
    assert.equal(result.latency_ms, 42);
    assert.equal(result.schema_valid, true);
    assert.equal(result.error, null);
  });

  it("includes payload for POST", async () => {
    const deps = makeDeps(() => ({ status: 200, body: backendResponse() }));
    await preflightEndpointHandler(
      { endpoint: "https://api.example.com/query", method: "POST", payload: { q: "ETH" } },
      deps,
    );
    assert.deepEqual((deps.calls[0].body as { payload: unknown }).payload, { q: "ETH" });
  });

  it("returns error on invalid URL", async () => {
    const deps = makeDeps(() => ({ status: 200, body: {} }));
    const result = await preflightEndpointHandler({ endpoint: "not-a-url" }, deps);
    assert.ok(result.error?.includes("not a valid URL"));
    assert.equal(deps.calls.length, 0);
  });

  it("returns error when endpoint is missing", async () => {
    const deps = makeDeps(() => ({ status: 200, body: {} }));
    const result = await preflightEndpointHandler({ endpoint: "" }, deps);
    assert.ok(result.error?.includes("required"));
  });

  it("surfaces backend safety.warnings", async () => {
    const deps = makeDeps(() => ({
      status: 200,
      body: backendResponse({
        safety: { scanned: true, schemaValid: true, warnings: ["response is slow"] },
      }),
    }));
    const result = await preflightEndpointHandler(
      { endpoint: "https://example.com/api" },
      deps,
    );
    assert.ok(result.warnings.includes("response is slow"));
  });

  it("surfaces schema_valid=false from backend", async () => {
    const deps = makeDeps(() => ({
      status: 200,
      body: backendResponse({ safety: { scanned: true, schemaValid: false, warnings: [] } }),
    }));
    const result = await preflightEndpointHandler(
      { endpoint: "https://example.com/api" },
      deps,
    );
    assert.equal(result.schema_valid, false);
  });

  it("wraps backend 500 as error", async () => {
    const deps = makeDeps(() => ({ status: 500, body: { error: "boom" } }));
    const result = await preflightEndpointHandler(
      { endpoint: "https://example.com/api" },
      deps,
    );
    assert.ok(result.error?.includes("preflight backend error"));
  });

  it("warns on payload with secret-looking keys", async () => {
    const deps = makeDeps(() => ({ status: 200, body: backendResponse() }));
    const result = await preflightEndpointHandler(
      {
        endpoint: "https://example.com/api",
        method: "POST",
        payload: { api_key: "my-secret" },
      },
      deps,
    );
    assert.ok(result.warnings.some((w) => /secrets/.test(w)));
  });
});
