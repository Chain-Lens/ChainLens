import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  publishListingMetadataGistHandler,
  type PublishListingMetadataGistInput,
} from "./publish-listing-metadata-gist.js";
import type { GistDeps } from "./github.js";

type Route = (url: string, init?: RequestInit) => { status: number; body: unknown };

function makeDeps(
  route: Route,
): GistDeps & { calls: Array<{ url: string; method: string; body: unknown }> } {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url, method, body });
    const { status, body: resBody } = route(url, init);
    const bodyStr = typeof resBody === "string" ? resBody : JSON.stringify(resBody);
    return new Response(bodyStr, { status });
  }) as typeof fetch;
  return { token: "ghp_test_token_secret", fetch: fetchFn, calls };
}

const GIST_RAW_URL =
  "https://gist.githubusercontent.com/user/abc123/raw/def456/test-provider.chainlens.metadata.json";

function makeGistResponse(filename: string, rawUrl: string) {
  return {
    id: "abc123",
    html_url: "https://gist.github.com/user/abc123",
    files: {
      [filename]: { filename, raw_url: rawUrl },
    },
  };
}

const readyInput: PublishListingMetadataGistInput = {
  provider_slug: "test-provider",
  name: "Test Provider",
  description: "A test provider for unit tests.",
  endpoint: "https://api.test-provider.example.com/v1",
  method: "GET",
  price_usdc: 0.05,
  output_schema: { type: "object", properties: { result: { type: "string" } } },
  payout_address: "0xD21dE9470d8A0dbae0dE0b5f705001a6482Db580",
};

const EXPECTED_FILENAME = "test-provider.chainlens.metadata.json";

describe("publishListingMetadataGistHandler", () => {
  it("posts to Gist API when input is ready", async () => {
    const fetchedContent = JSON.stringify({ stub: true });
    const route: Route = (url, init) => {
      if (url === "https://api.github.com/gists" && init?.method === "POST") {
        return { status: 201, body: makeGistResponse(EXPECTED_FILENAME, GIST_RAW_URL) };
      }
      if (url === GIST_RAW_URL) {
        return { status: 200, body: fetchedContent };
      }
      return { status: 404, body: { message: "unexpected" } };
    };
    const deps = makeDeps(route);
    const result = await publishListingMetadataGistHandler(readyInput, deps);

    // Gist POST was called
    const gistCall = deps.calls.find(
      (c) => c.url === "https://api.github.com/gists" && c.method === "POST",
    );
    assert.ok(gistCall, "Gist POST should be called");

    assert.equal(result.gist_url, "https://gist.github.com/user/abc123");
    assert.equal(result.metadata_uri, GIST_RAW_URL);
    assert.equal(result.register_args.metadata_uri, GIST_RAW_URL);
    assert.equal(result.register_args.payout_address, readyInput.payout_address);
    assert.equal(result.register_args.provider_slug, "test-provider");
    assert.ok(result.expected_metadata_hash.length === 64, "SHA-256 should be 64 hex chars");
    assert.equal(result.register_args.expected_metadata_hash, result.expected_metadata_hash);
  });

  it("fetches raw_url and hashes fetched content, not local JSON", async () => {
    const localJson = '{"local": true}';
    const fetchedContent = '{"fetched": true}'; // differs from local
    const route: Route = (url, init) => {
      if (url === "https://api.github.com/gists" && init?.method === "POST") {
        return { status: 201, body: makeGistResponse(EXPECTED_FILENAME, GIST_RAW_URL) };
      }
      if (url === GIST_RAW_URL) {
        return { status: 200, body: fetchedContent };
      }
      return { status: 404, body: { message: "unexpected" } };
    };
    const deps = makeDeps(route);

    // Compute expected hash of fetched content
    const { createHash } = await import("node:crypto");
    const expectedHash = createHash("sha256").update(fetchedContent, "utf8").digest("hex");

    const result = await publishListingMetadataGistHandler(readyInput, deps);

    // Hash must come from fetched content, not local JSON
    assert.equal(result.expected_metadata_hash, expectedHash);
    // raw_url fetch was called
    const rawFetch = deps.calls.find((c) => c.url === GIST_RAW_URL);
    assert.ok(rawFetch, "raw_url should be fetched");
    // Warning about content mismatch should appear
    assert.ok(result.warnings.some((w) => w.includes("differs")));
  });

  it("rejects when listing readiness is incomplete (missing fields)", async () => {
    const deps = makeDeps(() => ({ status: 500, body: {} }));
    const incompleteInput: PublishListingMetadataGistInput = {
      provider_slug: "test-provider",
      payout_address: "0xD21dE9470d8A0dbae0dE0b5f705001a6482Db580",
      // missing endpoint, method, price_usdc, output_schema
    };
    await assert.rejects(
      () => publishListingMetadataGistHandler(incompleteInput, deps),
      (err: Error) => {
        assert.ok(err.message.includes("not ready"), `expected "not ready", got: ${err.message}`);
        return true;
      },
    );
    // Gist POST must NOT have been called
    assert.equal(deps.calls.length, 0, "Gist POST must not be called for incomplete input");
  });

  it("rejects when price_usdc is zero even if other fields are set", async () => {
    const deps = makeDeps(() => ({ status: 500, body: {} }));
    await assert.rejects(
      () =>
        publishListingMetadataGistHandler(
          { ...readyInput, price_usdc: 0 },
          deps,
        ),
      /not ready/,
    );
    assert.equal(deps.calls.length, 0);
  });

  it("does not include GitHub token in result or error output", async () => {
    const TOKEN = "ghp_test_token_secret";
    const route: Route = (url, init) => {
      if (url === "https://api.github.com/gists" && init?.method === "POST") {
        return { status: 201, body: makeGistResponse(EXPECTED_FILENAME, GIST_RAW_URL) };
      }
      if (url === GIST_RAW_URL) {
        return { status: 200, body: '{"ok":true}' };
      }
      return { status: 404, body: { message: "unexpected" } };
    };
    const deps = makeDeps(route);
    const result = await publishListingMetadataGistHandler(readyInput, deps);
    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes(TOKEN), "token must not appear in result");
  });

  it("surfaces Gist API error without leaking token", async () => {
    const TOKEN = "ghp_test_token_secret";
    const route: Route = (url, init) => {
      if (url === "https://api.github.com/gists" && init?.method === "POST") {
        return { status: 401, body: { message: "Bad credentials" } };
      }
      return { status: 404, body: {} };
    };
    const deps = makeDeps(route);
    await assert.rejects(
      () => publishListingMetadataGistHandler(readyInput, deps),
      (err: Error) => {
        assert.ok(err.message.includes("401"), `expected 401, got: ${err.message}`);
        assert.ok(!err.message.includes(TOKEN), "token must not appear in error");
        return true;
      },
    );
  });
});
