import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { preparePaidListingHandler } from "./prepare-paid-listing.js";

const validAddr = "0x" + "a".repeat(40);

const fullInput = {
  provider_slug: "alchemy",
  name: "Alchemy RPC",
  description: "EVM node API.",
  endpoint: "https://api.alchemy.com/query",
  method: "POST" as const,
  price_usdc: 0.05,
  output_schema: { type: "object" },
  payout_address: validAddr,
};

describe("preparePaidListingHandler", () => {
  it("returns ready when all required fields are present", () => {
    const result = preparePaidListingHandler(fullInput);
    assert.equal(result.readiness, "ready");
    assert.equal(result.metadata?.name, "Alchemy RPC");
    assert.equal(result.metadata?.pricing?.amount, "50000");
    assert.equal(result.metadata?.pricing?.unit, "per_call");
    assert.ok(result.register_url.includes("alchemy"));
    assert.equal(result.warnings.length, 0);
  });

  it("returns incomplete when endpoint is missing", () => {
    const result = preparePaidListingHandler({ ...fullInput, endpoint: undefined });
    assert.equal(result.readiness, "incomplete");
    assert.ok(result.next_steps.some((s) => /endpoint/.test(s)));
  });

  it("returns incomplete when price_usdc is missing", () => {
    const result = preparePaidListingHandler({ ...fullInput, price_usdc: undefined });
    assert.equal(result.readiness, "incomplete");
    assert.ok(result.next_steps.some((s) => /price_usdc/.test(s)));
  });

  it("returns incomplete when output_schema is missing", () => {
    const result = preparePaidListingHandler({ ...fullInput, output_schema: undefined });
    assert.equal(result.readiness, "incomplete");
    assert.ok(result.next_steps.some((s) => /output_schema/.test(s)));
  });

  it("warns on invalid payout_address", () => {
    const result = preparePaidListingHandler({ ...fullInput, payout_address: "0xinvalid" });
    assert.ok(result.warnings.some((w) => /payout_address/.test(w)));
  });

  it("merges name and description from directory_metadata when not explicit", () => {
    const result = preparePaidListingHandler({
      provider_slug: "alchemy",
      directory_metadata: { name: "Alchemy", description: "From directory.", tags: ["rpc"] },
      endpoint: "https://api.alchemy.com/query",
      method: "POST",
      price_usdc: 0.01,
      output_schema: { type: "object" },
      payout_address: validAddr,
    });
    assert.equal(result.metadata?.name, "Alchemy");
    assert.equal(result.metadata?.description, "From directory.");
    assert.deepEqual(result.metadata?.tags, ["rpc"]);
  });

  it("preserves source_attestation from directory_metadata", () => {
    const result = preparePaidListingHandler({
      ...fullInput,
      directory_metadata: {
        source_attestation: "https://github.com/alchemyplatform",
      },
    });
    assert.equal(result.metadata?.source_attestation, "https://github.com/alchemyplatform");
  });

  it("throws when provider_slug is missing", () => {
    assert.throws(() => preparePaidListingHandler({ ...fullInput, provider_slug: "" }), /required/);
  });

  it("warns on invalid endpoint URL", () => {
    const result = preparePaidListingHandler({ ...fullInput, endpoint: "not-a-url" });
    assert.ok(result.warnings.some((w) => /valid URL/.test(w)));
  });

  it("converts price correctly for fractional USDC", () => {
    const result = preparePaidListingHandler({ ...fullInput, price_usdc: 0.001 });
    assert.equal(result.metadata?.pricing?.amount, "1000");
  });
});
