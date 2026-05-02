import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  importDirectoryProviderHandler,
  type ImportDirectoryProviderDeps,
} from "./import-directory-provider.js";

type FakeRoute = (url: string) => { status: number; body: unknown };

function makeDeps(responder: FakeRoute): ImportDirectoryProviderDeps {
  const fetchFn = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const { status, body } = responder(url);
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { apiBaseUrl: "http://api/api", fetch: fetchFn };
}

const freshDate = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);

const fakeProviderEntry = {
  slug: "alchemy",
  name: "Alchemy",
  description: "Node provider for EVM chains.",
  category: "infrastructure",
  tags: ["rpc", "node"],
  website: "https://alchemy.com",
  docs: "https://docs.alchemy.com",
  source_attestation: "https://github.com/alchemyplatform",
  last_verified: freshDate,
};

describe("importDirectoryProviderHandler", () => {
  it("returns provider and prefill on successful import from directory array", async () => {
    const deps = makeDeps((url) => {
      // ChainLens draft → 404, fall back to directory
      if (url.includes("/directory/drafts/")) return { status: 404, body: {} };
      // Real dist/providers.json shape: { providers: [...] }
      return { status: 200, body: { generated_at: "2026-05-02", providers: [fakeProviderEntry] } };
    });
    const result = await importDirectoryProviderHandler(
      { provider_slug: "alchemy", prefer_chainlens_draft: false },
      deps,
    );
    assert.equal(result.provider?.name, "Alchemy");
    assert.equal(result.listing_prefill?.provider_slug, "alchemy");
    assert.equal(result.listing_prefill?.name, "Alchemy");
    assert.ok(result.register_url.includes("alchemy"));
    // Endpoint/price/schema/payout always missing at import time
    assert.ok(result.missing_paid_listing_fields.includes("endpoint"));
    assert.ok(result.missing_paid_listing_fields.includes("payout_address"));
  });

  it("uses ChainLens draft API when prefer_chainlens_draft is true and draft exists", async () => {
    const deps = makeDeps((url) => {
      if (url.includes("/directory/drafts/alchemy")) {
        return { status: 200, body: fakeProviderEntry };
      }
      return { status: 200, body: [] };
    });
    const result = await importDirectoryProviderHandler(
      { provider_slug: "alchemy" },
      deps,
    );
    assert.equal(result.provider?.name, "Alchemy");
  });

  it("throws when slug not found in directory", async () => {
    const deps = makeDeps(() => ({ status: 200, body: { providers: [] } }));
    await assert.rejects(
      importDirectoryProviderHandler(
        { provider_slug: "nonexistent", prefer_chainlens_draft: false },
        deps,
      ),
      /not found/,
    );
  });

  it("throws when provider_slug is empty", async () => {
    const deps = makeDeps(() => ({ status: 200, body: [] }));
    await assert.rejects(
      importDirectoryProviderHandler({ provider_slug: "" }, deps),
      /required/,
    );
  });

  it("warns when last_verified is stale", async () => {
    const staleEntry = { ...fakeProviderEntry, last_verified: "2020-01-01" };
    const deps = makeDeps(() => ({ status: 200, body: { providers: [staleEntry] } }));
    const result = await importDirectoryProviderHandler(
      { provider_slug: "alchemy", prefer_chainlens_draft: false },
      deps,
    );
    assert.ok(result.warnings.some((w) => /stale|outdated/i.test(w)));
  });

  it("warns when source_attestation is missing", async () => {
    const noAttest = { ...fakeProviderEntry, source_attestation: undefined };
    const deps = makeDeps(() => ({ status: 200, body: { providers: [noAttest] } }));
    const result = await importDirectoryProviderHandler(
      { provider_slug: "alchemy", prefer_chainlens_draft: false },
      deps,
    );
    assert.ok(result.warnings.some((w) => /source_attestation/i.test(w)));
  });
});
