import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  registerPaidListingHandler,
  type RegisterPaidListingDeps,
} from "./register-paid-listing.js";
import type { SigningProvider } from "./signing-adapter.js";

const VALID_PAYOUT = "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12";
const TX_HASH = "0xdeadbeef00000000000000000000000000000000000000000000000000000001" as `0x${string}`;

const FULL_METADATA = JSON.stringify({
  name: "Test API",
  endpoint: "https://api.example.com/query",
  pricing: { amount: "50000", unit: "per_call" },
  output_schema: { type: "object" },
});

function makeSigningProvider(overrides: Partial<SigningProvider> = {}): SigningProvider {
  return {
    kind: "local_signer",
    signAndSubmit: async () => ({ txHash: TX_HASH, listingOnChainId: 42 }),
    ...overrides,
  };
}

function makeDeps(
  signingProvider?: SigningProvider,
  fetchImpl?: typeof fetch,
): RegisterPaidListingDeps {
  return {
    signingProvider: signingProvider ?? makeSigningProvider(),
    chainLensBaseUrl: "https://chainlens.xyz",
    fetch: (fetchImpl ?? (async () => new Response("{}", { status: 200 }))) as typeof fetch,
  };
}

describe("registerPaidListingHandler", () => {
  it("happy path — https metadata with all fields → no warnings", async () => {
    const deps = makeDeps(
      undefined,
      async () => new Response(FULL_METADATA, { status: 200 }) as Response,
    );
    const result = await registerPaidListingHandler(
      { payout_address: VALID_PAYOUT, metadata_uri: "https://example.com/meta.json" },
      deps,
    );

    assert.equal(result.tx_hash, TX_HASH);
    assert.equal(result.listing_on_chain_id, 42);
    assert.equal(result.listing_url, "https://chainlens.xyz/discover/42");
    assert.equal(result.signing_provider_kind, "local_signer");
    assert.equal(result.warnings.length, 0);
  });

  it("data:application/json inline — parses without network", async () => {
    const fetchSpy = async () => {
      throw new Error("fetch should not be called for data URIs");
    };
    const deps = makeDeps(undefined, fetchSpy as typeof fetch);
    const uri = `data:application/json,${encodeURIComponent(FULL_METADATA)}`;
    const result = await registerPaidListingHandler(
      { payout_address: VALID_PAYOUT, metadata_uri: uri },
      deps,
    );
    assert.equal(result.warnings.length, 0);
  });

  it("data:application/json;base64 — decodes and parses", async () => {
    const noFetch: typeof fetch = async () => { throw new Error("no fetch"); };
    const deps = makeDeps(undefined, noFetch);
    const encoded = Buffer.from(FULL_METADATA).toString("base64");
    const uri = `data:application/json;base64,${encoded}`;
    const result = await registerPaidListingHandler(
      { payout_address: VALID_PAYOUT, metadata_uri: uri },
      deps,
    );
    assert.equal(result.warnings.length, 0);
  });

  it("ipfs:// — warns about skipped validation, still registers", async () => {
    const fetchSpy = async () => { throw new Error("fetch should not be called"); };
    const deps = makeDeps(undefined, fetchSpy as typeof fetch);
    const result = await registerPaidListingHandler(
      { payout_address: VALID_PAYOUT, metadata_uri: "ipfs://Qmabcdef1234567890" },
      deps,
    );
    assert.ok(result.warnings.some((w) => w.includes("ipfs://")));
    assert.equal(result.listing_on_chain_id, 42);
  });

  it("warns when metadata.endpoint is missing", async () => {
    const meta = JSON.stringify({ pricing: { amount: "50000" }, output_schema: {} });
    const deps = makeDeps(undefined, async () => new Response(meta, { status: 200 }) as Response);
    const result = await registerPaidListingHandler(
      { payout_address: VALID_PAYOUT, metadata_uri: "https://example.com/meta.json" },
      deps,
    );
    assert.ok(result.warnings.some((w) => w.includes("endpoint")));
  });

  it("warns when metadata.pricing.amount is missing", async () => {
    const meta = JSON.stringify({ endpoint: "https://example.com", output_schema: {} });
    const deps = makeDeps(undefined, async () => new Response(meta, { status: 200 }) as Response);
    const result = await registerPaidListingHandler(
      { payout_address: VALID_PAYOUT, metadata_uri: "https://example.com/meta.json" },
      deps,
    );
    assert.ok(result.warnings.some((w) => w.includes("pricing.amount")));
  });

  it("warns when metadata.output_schema is missing", async () => {
    const meta = JSON.stringify({ endpoint: "https://x", pricing: { amount: "1" } });
    const deps = makeDeps(undefined, async () => new Response(meta, { status: 200 }) as Response);
    const result = await registerPaidListingHandler(
      { payout_address: VALID_PAYOUT, metadata_uri: "https://example.com/meta.json" },
      deps,
    );
    assert.ok(result.warnings.some((w) => w.includes("output_schema")));
  });

  it("warns on hash mismatch (not throw)", async () => {
    const deps = makeDeps(
      undefined,
      async () => new Response(FULL_METADATA, { status: 200 }) as Response,
    );
    const result = await registerPaidListingHandler(
      {
        payout_address: VALID_PAYOUT,
        metadata_uri: "https://example.com/meta.json",
        expected_metadata_hash: "aaaa",
      },
      deps,
    );
    assert.ok(result.warnings.some((w) => w.includes("hash mismatch")));
    assert.equal(result.listing_on_chain_id, 42);
  });

  it("passes hash check when content matches", async () => {
    const hash = createHash("sha256").update(FULL_METADATA, "utf-8").digest("hex");
    const deps = makeDeps(
      undefined,
      async () => new Response(FULL_METADATA, { status: 200 }) as Response,
    );
    const result = await registerPaidListingHandler(
      {
        payout_address: VALID_PAYOUT,
        metadata_uri: "https://example.com/meta.json",
        expected_metadata_hash: hash,
      },
      deps,
    );
    assert.ok(!result.warnings.some((w) => w.includes("hash mismatch")));
  });

  it("warns on fetch error (not throw) and still registers", async () => {
    const failFetch: typeof fetch = async () => { throw new Error("network unreachable"); };
    const deps = makeDeps(undefined, failFetch);
    const result = await registerPaidListingHandler(
      { payout_address: VALID_PAYOUT, metadata_uri: "https://example.com/meta.json" },
      deps,
    );
    assert.ok(result.warnings.some((w) => w.includes("fetch failed")));
    assert.equal(result.listing_on_chain_id, 42);
  });

  it("warns on metadata fetch HTTP error (not throw)", async () => {
    const deps = makeDeps(
      undefined,
      async () => new Response("not found", { status: 404 }) as Response,
    );
    const result = await registerPaidListingHandler(
      { payout_address: VALID_PAYOUT, metadata_uri: "https://example.com/meta.json" },
      deps,
    );
    assert.ok(result.warnings.some((w) => w.includes("HTTP 404")));
  });

  it("throws on invalid payout address", async () => {
    const deps = makeDeps();
    await assert.rejects(
      registerPaidListingHandler(
        { payout_address: "not-an-address", metadata_uri: "https://example.com/m.json" },
        deps,
      ),
      /valid EVM address/,
    );
  });

  it("throws when payout_address is empty", async () => {
    const deps = makeDeps();
    await assert.rejects(
      registerPaidListingHandler(
        { payout_address: "", metadata_uri: "https://example.com/m.json" },
        deps,
      ),
      /required/,
    );
  });

  it("throws on disallowed metadata URI scheme", async () => {
    const deps = makeDeps();
    await assert.rejects(
      registerPaidListingHandler(
        { payout_address: VALID_PAYOUT, metadata_uri: "ftp://example.com/meta.json" },
        deps,
      ),
      /https:\/\//,
    );
  });

  it("throws when metadata_uri is empty", async () => {
    const deps = makeDeps();
    await assert.rejects(
      registerPaidListingHandler({ payout_address: VALID_PAYOUT, metadata_uri: "" }, deps),
      /required/,
    );
  });

  it("throws when metadata_uri exceeds 2048 chars", async () => {
    const deps = makeDeps();
    const uri = "https://example.com/" + "a".repeat(2048);
    await assert.rejects(
      registerPaidListingHandler({ payout_address: VALID_PAYOUT, metadata_uri: uri }, deps),
      /2048/,
    );
  });

  it("propagates signing provider errors", async () => {
    const signingProvider = makeSigningProvider({
      signAndSubmit: async () => { throw new Error("wallet locked"); },
    });
    const deps = makeDeps(
      signingProvider,
      async () => new Response(FULL_METADATA, { status: 200 }) as Response,
    );
    await assert.rejects(
      registerPaidListingHandler(
        { payout_address: VALID_PAYOUT, metadata_uri: "https://example.com/meta.json" },
        deps,
      ),
      /wallet locked/,
    );
  });

  it("listing_url derives from chainLensBaseUrl", async () => {
    const signingProvider = makeSigningProvider({
      signAndSubmit: async () => ({ txHash: TX_HASH, listingOnChainId: 7 }),
    });
    const deps: RegisterPaidListingDeps = {
      signingProvider,
      chainLensBaseUrl: "https://chainlens.pelicanlab.dev",
      fetch: async () => new Response(FULL_METADATA, { status: 200 }) as Response,
    };
    const result = await registerPaidListingHandler(
      { payout_address: VALID_PAYOUT, metadata_uri: "https://example.com/meta.json" },
      deps,
    );
    assert.equal(result.listing_url, "https://chainlens.pelicanlab.dev/discover/7");
  });
});
