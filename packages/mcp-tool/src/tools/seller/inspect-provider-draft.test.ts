import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  inspectProviderDraftHandler,
  type InspectProviderDraftDeps,
} from "./inspect-provider-draft.js";

function makeDeps(handler: (url: string) => { status: number; body: unknown }): InspectProviderDraftDeps {
  return {
    apiBaseUrl: "https://api.example.com/api",
    fetch: (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      const { status, body } = handler(url);
      return new Response(JSON.stringify(body), { status });
    }) as typeof fetch,
  };
}

const baseDraft = {
  id: "draft-1",
  providerSlug: "alchemy",
  name: "Alchemy",
  description: "An RPC provider.",
  category: "rpc",
  website: "https://alchemy.com",
  sourceAttestation: "https://github.com/alchemy",
  directoryMetadata: {},
  directoryVerified: true,
  status: "UNCLAIMED" as const,
  lastSyncedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("inspectProviderDraftHandler", () => {
  it("returns draft with UNCLAIMED next_action", async () => {
    const deps = makeDeps(() => ({ status: 200, body: baseDraft }));
    const result = await inspectProviderDraftHandler({ provider_slug: "alchemy" }, deps);

    assert.equal(result.found, true);
    assert.equal(result.status, "UNCLAIMED");
    assert.ok(result.next_action.includes("unclaimed") || result.next_action.includes("Unclaimed"));
    assert.ok(result.claim_url?.includes("/claim"));
    assert.ok(result.register_url?.includes("register"));
    assert.equal(result.warnings.length, 0);
  });

  it("returns null + not found guidance for 404", async () => {
    const deps = makeDeps(() => ({ status: 404, body: { message: "Not Found" } }));
    const result = await inspectProviderDraftHandler({ provider_slug: "missing" }, deps);

    assert.equal(result.found, false);
    assert.equal(result.draft, null);
    assert.equal(result.status, null);
    assert.ok(result.next_action.includes("No ChainLens draft") || result.next_action.includes("not found") || result.next_action.includes("No ChainLens draft"));
    assert.equal(result.claim_url, null);
  });

  it("warns when directoryVerified is false", async () => {
    const draft = { ...baseDraft, directoryVerified: false };
    const deps = makeDeps(() => ({ status: 200, body: draft }));
    const result = await inspectProviderDraftHandler({ provider_slug: "alchemy" }, deps);

    assert.ok(result.warnings.some((w) => w.includes("directoryVerified")));
  });

  it("warns when lastSyncedAt is stale", async () => {
    const staleDraft = { ...baseDraft, lastSyncedAt: "2020-01-01T00:00:00.000Z" };
    const deps = makeDeps(() => ({ status: 200, body: staleDraft }));
    const result = await inspectProviderDraftHandler({ provider_slug: "alchemy" }, deps);

    assert.ok(result.warnings.some((w) => w.includes("lastSyncedAt")));
  });

  it("returns no claim_url for LISTED draft", async () => {
    const listedDraft = { ...baseDraft, status: "LISTED" as const, listingOnChainId: 42 };
    const deps = makeDeps(() => ({ status: 200, body: listedDraft }));
    const result = await inspectProviderDraftHandler({ provider_slug: "alchemy" }, deps);

    assert.equal(result.claim_url, null);
    assert.ok(result.next_action.includes("42"));
  });

  it("returns CLAIMED next_action with claimedBy", async () => {
    const claimedDraft = { ...baseDraft, status: "CLAIMED" as const, claimedBy: "0xABC" };
    const deps = makeDeps(() => ({ status: 200, body: claimedDraft }));
    const result = await inspectProviderDraftHandler({ provider_slug: "alchemy" }, deps);

    assert.ok(result.next_action.includes("0xABC"));
    assert.ok(result.claim_url?.includes("/claim"));
  });

  it("throws when provider_slug is empty", async () => {
    const deps = makeDeps(() => ({ status: 200, body: baseDraft }));
    await assert.rejects(
      inspectProviderDraftHandler({ provider_slug: "" }, deps),
      /required/,
    );
  });

  it("rethrows non-404 errors", async () => {
    const deps = makeDeps(() => ({ status: 500, body: { message: "Internal Server Error" } }));
    await assert.rejects(
      inspectProviderDraftHandler({ provider_slug: "alchemy" }, deps),
      /500/,
    );
  });
});
