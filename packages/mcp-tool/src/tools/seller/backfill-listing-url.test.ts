import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { backfillListingUrlHandler, type BackfillListingUrlDeps } from "./backfill-listing-url.js";

type Route = (url: string, init?: RequestInit) => { status: number; body: unknown };

const existingProviderJson = {
  name: "Alchemy",
  slug: "alchemy",
  category: "rpc",
  description: "Node provider.",
  website: "https://alchemy.com",
  source_attestation: "https://github.com/alchemyplatform",
  added_date: "2026-05-02",
  last_verified: "2026-05-02",
  chainlens: { wants_listing: true, listing_status: "not_listed", listing_url: null },
};

const encodedContent = Buffer.from(JSON.stringify(existingProviderJson, null, 2), "utf-8").toString("base64");

function makeDeps(route: Route): BackfillListingUrlDeps {
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const { status, body } = route(url, init);
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { token: "tok", repoOwner: "owner", repoName: "repo", fetch: fetchFn };
}

function defaultRoute(url: string, init?: RequestInit): { status: number; body: unknown } {
  if (url.endsWith("/repos/owner/repo") && (!init?.method || init.method === "GET")) {
    return { status: 200, body: { default_branch: "main" } };
  }
  if (url.includes("/git/ref/heads/main")) {
    return { status: 200, body: { object: { sha: "abc123" } } };
  }
  if (url.includes("/git/refs") && init?.method === "POST") {
    return { status: 201, body: {} };
  }
  if (url.includes("/contents/providers/alchemy.json") && (!init?.method || init.method === "GET")) {
    return { status: 200, body: { sha: "fileSha", content: encodedContent, encoding: "base64" } };
  }
  if (url.includes("/contents/providers/") && init?.method === "PUT") {
    return { status: 200, body: { content: { sha: "newsha" } } };
  }
  if (url.includes("/pulls") && (!init?.method || init.method === "GET")) {
    return { status: 200, body: [] };
  }
  if (url.includes("/pulls") && init?.method === "POST") {
    return { status: 201, body: { html_url: "https://github.com/owner/repo/pull/42", number: 42 } };
  }
  return { status: 404, body: { message: "Unexpected call" } };
}

describe("backfillListingUrlHandler", () => {
  it("updates chainlens block and opens PR", async () => {
    const deps = makeDeps(defaultRoute);
    const result = await backfillListingUrlHandler(
      {
        provider_slug: "alchemy",
        listing_url: "https://chainlens.pelicanlab.dev/discover/123",
      },
      deps,
    );

    assert.equal(result.pr_url, "https://github.com/owner/repo/pull/42");
    const cl = result.updated_json.chainlens as Record<string, unknown>;
    assert.equal(cl.listing_status, "listed");
    assert.equal(cl.listing_url, "https://chainlens.pelicanlab.dev/discover/123");
    assert.equal(result.warnings.length, 0);
  });

  it("preserves existing chainlens fields", async () => {
    const deps = makeDeps(defaultRoute);
    const result = await backfillListingUrlHandler(
      {
        provider_slug: "alchemy",
        listing_url: "https://chainlens.pelicanlab.dev/discover/123",
      },
      deps,
    );
    const cl = result.updated_json.chainlens as Record<string, unknown>;
    assert.equal(cl.wants_listing, true);
  });

  it("throws when listing_url is not a ChainLens domain", async () => {
    const deps = makeDeps(defaultRoute);
    await assert.rejects(
      backfillListingUrlHandler(
        { provider_slug: "alchemy", listing_url: "https://evil.com/listing/1" },
        deps,
      ),
      /ChainLens domain/,
    );
  });

  it("throws when providers/<slug>.json does not exist on main", async () => {
    const deps = makeDeps((url, init) => {
      if (url.includes("/contents/providers/") && (!init?.method || init.method === "GET")) {
        return { status: 404, body: {} };
      }
      return defaultRoute(url, init);
    });
    await assert.rejects(
      backfillListingUrlHandler(
        { provider_slug: "alchemy", listing_url: "https://chainlens.xyz/discover/1" },
        deps,
      ),
      /not found/,
    );
  });

  it("throws when provider_slug is missing", async () => {
    const deps = makeDeps(defaultRoute);
    await assert.rejects(
      backfillListingUrlHandler(
        { provider_slug: "", listing_url: "https://chainlens.xyz/discover/1" },
        deps,
      ),
      /required/,
    );
  });

  it("throws when listing_url is missing", async () => {
    const deps = makeDeps(defaultRoute);
    await assert.rejects(
      backfillListingUrlHandler({ provider_slug: "alchemy", listing_url: "" }, deps),
      /required/,
    );
  });

  it("accepts chainlens.xyz domain", async () => {
    const deps = makeDeps(defaultRoute);
    const result = await backfillListingUrlHandler(
      { provider_slug: "alchemy", listing_url: "https://chainlens.xyz/discover/5" },
      deps,
    );
    assert.ok(result.pr_url.length > 0);
  });
});
