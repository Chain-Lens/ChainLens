import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { claimHandoffHandler } from "./claim-handoff.js";

const deps = { apiBaseUrl: "https://api.example.com/api" };

describe("claimHandoffHandler", () => {
  it("generates claim endpoint and register URL", () => {
    const result = claimHandoffHandler({ provider_slug: "alchemy" }, deps);

    assert.equal(result.provider_slug, "alchemy");
    assert.ok(result.claim_api_endpoint.includes("/directory/drafts/alchemy/claim"));
    assert.ok(result.register_url.includes("register?provider=alchemy"));
    assert.equal(result.draft_status, null);
    assert.equal(result.warnings.length, 0);
  });

  it("strips /api suffix from baseUrl for register_url", () => {
    const result = claimHandoffHandler({ provider_slug: "alchemy" }, { apiBaseUrl: "https://api.example.com/api" });
    assert.ok(!result.register_url.includes("/api/register"), "register_url must not include /api prefix");
    assert.ok(result.register_url.startsWith("https://api.example.com/register"));
  });

  it("produces UNCLAIMED seller_actions with auth steps", () => {
    const result = claimHandoffHandler(
      { provider_slug: "alchemy", draft: { status: "UNCLAIMED" } as never },
      deps,
    );

    assert.ok(result.seller_actions.length >= 4);
    assert.ok(result.seller_actions.some((a) => a.requires_auth && a.action.includes("seller_auth_token")));
    assert.ok(result.seller_actions.some((a) => a.action.includes("link_listing_draft")));
    assert.ok(result.seller_actions.some((a) => a.action.includes("backfill_listing_url")));
  });

  it("warns when draft is LISTED", () => {
    const result = claimHandoffHandler(
      { provider_slug: "alchemy", draft: { status: "LISTED" } as never },
      deps,
    );
    assert.ok(result.warnings.some((w) => w.includes("LISTED")));
  });

  it("warns when draft is ARCHIVED", () => {
    const result = claimHandoffHandler(
      { provider_slug: "alchemy", draft: { status: "ARCHIVED" } as never },
      deps,
    );
    assert.ok(result.warnings.some((w) => w.includes("ARCHIVED")));
  });

  it("warns when directoryVerified is false", () => {
    const result = claimHandoffHandler(
      { provider_slug: "alchemy", draft: { status: "UNCLAIMED", directoryVerified: false } as never },
      deps,
    );
    assert.ok(result.warnings.some((w) => w.includes("directoryVerified")));
  });

  it("encodes slug in claim_api_endpoint", () => {
    const result = claimHandoffHandler({ provider_slug: "my provider" }, deps);
    assert.ok(result.claim_api_endpoint.includes("my%20provider"));
  });

  it("throws when provider_slug is empty", () => {
    assert.throws(
      () => claimHandoffHandler({ provider_slug: "" }, deps),
      /required/,
    );
  });

  it("respects api_base_url override", () => {
    const result = claimHandoffHandler(
      { provider_slug: "alchemy", api_base_url: "https://custom.example.com/api" },
      deps,
    );
    assert.ok(result.claim_api_endpoint.startsWith("https://custom.example.com/api"));
    assert.ok(result.register_url.startsWith("https://custom.example.com/register"));
  });
});
