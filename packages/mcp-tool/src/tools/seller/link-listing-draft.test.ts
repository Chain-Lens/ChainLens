import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { linkListingDraftHandler, type LinkListingDraftDeps } from "./link-listing-draft.js";

function makeDeps(handler: (url: string, init?: RequestInit) => { status: number; body: unknown }): LinkListingDraftDeps {
  return {
    apiBaseUrl: "https://api.example.com/api",
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const { status, body } = handler(url, init);
      return new Response(JSON.stringify(body), { status });
    }) as typeof fetch,
  };
}

const listedDraft = {
  id: "draft-1",
  providerSlug: "alchemy",
  name: "Alchemy",
  description: "An RPC provider.",
  category: "rpc",
  website: "https://alchemy.com",
  sourceAttestation: "https://github.com/alchemy",
  directoryMetadata: {},
  directoryVerified: true,
  status: "LISTED" as const,
  listingOnChainId: 42,
  listingUrl: "https://chainlens.xyz/discover/42",
  claimedBy: "0xABC",
  claimedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("linkListingDraftHandler", () => {
  it("PATCHes the listing endpoint and returns the updated draft", async () => {
    let capturedInit: RequestInit | undefined;
    const deps = makeDeps((url, init) => {
      capturedInit = init;
      return { status: 200, body: listedDraft };
    });

    const result = await linkListingDraftHandler(
      {
        provider_slug: "alchemy",
        listing_on_chain_id: 42,
        listing_url: "https://chainlens.xyz/discover/42",
        seller_auth_token: "tok123",
      },
      deps,
    );

    assert.equal(result.provider_slug, "alchemy");
    assert.equal(result.draft.listingOnChainId, 42);
    assert.ok(result.endpoint.includes("/directory/drafts/alchemy/listing"));
    assert.equal(result.warnings.length, 0);

    // Verify auth cookie was sent
    assert.ok((capturedInit?.headers as Record<string, string>)?.["Cookie"]?.includes("seller_token=tok123"));
    assert.equal(capturedInit?.method, "PATCH");

    const body = JSON.parse(capturedInit?.body as string);
    assert.equal(body.listingOnChainId, 42);
    assert.equal(body.listingUrl, "https://chainlens.xyz/discover/42");
  });

  it("omits listingUrl from body when not provided", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const deps = makeDeps((_, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return { status: 200, body: listedDraft };
    });

    await linkListingDraftHandler(
      { provider_slug: "alchemy", listing_on_chain_id: 42, seller_auth_token: "tok" },
      deps,
    );

    assert.ok(!("listingUrl" in (capturedBody ?? {})));
  });

  it("warns when draft status is not LISTED after PATCH", async () => {
    const claimedDraft = { ...listedDraft, status: "CLAIMED" as const };
    const deps = makeDeps(() => ({ status: 200, body: claimedDraft }));
    const result = await linkListingDraftHandler(
      { provider_slug: "alchemy", listing_on_chain_id: 42, seller_auth_token: "tok" },
      deps,
    );
    assert.ok(result.warnings.some((w) => w.includes("CLAIMED")));
  });

  it("warns when no listing_url provided and draft has none", async () => {
    const noUrlDraft = { ...listedDraft, listingUrl: null };
    const deps = makeDeps(() => ({ status: 200, body: noUrlDraft }));
    const result = await linkListingDraftHandler(
      { provider_slug: "alchemy", listing_on_chain_id: 42, seller_auth_token: "tok" },
      deps,
    );
    assert.ok(result.warnings.some((w) => w.includes("listing_url")));
  });

  it("throws when provider_slug is empty", async () => {
    const deps = makeDeps(() => ({ status: 200, body: listedDraft }));
    await assert.rejects(
      linkListingDraftHandler({ provider_slug: "", listing_on_chain_id: 1, seller_auth_token: "tok" }, deps),
      /required/,
    );
  });

  it("throws when seller_auth_token is empty", async () => {
    const deps = makeDeps(() => ({ status: 200, body: listedDraft }));
    await assert.rejects(
      linkListingDraftHandler({ provider_slug: "alchemy", listing_on_chain_id: 1, seller_auth_token: "" }, deps),
      /required/,
    );
  });

  it("throws on negative listing_on_chain_id", async () => {
    const deps = makeDeps(() => ({ status: 200, body: listedDraft }));
    await assert.rejects(
      linkListingDraftHandler({ provider_slug: "alchemy", listing_on_chain_id: -1, seller_auth_token: "tok" }, deps),
      /non-negative integer/,
    );
  });

  it("throws on non-integer listing_on_chain_id", async () => {
    const deps = makeDeps(() => ({ status: 200, body: listedDraft }));
    await assert.rejects(
      linkListingDraftHandler({ provider_slug: "alchemy", listing_on_chain_id: 1.5, seller_auth_token: "tok" }, deps),
      /non-negative integer/,
    );
  });

  it("throws on HTTP error from backend", async () => {
    const deps = makeDeps(() => ({ status: 403, body: { message: "Forbidden" } }));
    await assert.rejects(
      linkListingDraftHandler({ provider_slug: "alchemy", listing_on_chain_id: 1, seller_auth_token: "tok" }, deps),
      /403/,
    );
  });

  it("respects api_base_url override", async () => {
    let capturedUrl = "";
    const deps = makeDeps((url) => {
      capturedUrl = url;
      return { status: 200, body: listedDraft };
    });

    await linkListingDraftHandler(
      {
        provider_slug: "alchemy",
        listing_on_chain_id: 1,
        seller_auth_token: "tok",
        api_base_url: "https://custom.example.com/api",
      },
      deps,
    );

    assert.ok(capturedUrl.startsWith("https://custom.example.com/api"));
  });
});
