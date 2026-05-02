import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { prepareProviderEntryHandler } from "./prepare-provider-entry.js";

const validInput = {
  name: "Alchemy",
  slug: "alchemy",
  website: "https://alchemy.com",
  docs: "https://docs.alchemy.com",
  category: "rpc",
  description: "Node provider for EVM chains.",
  source_attestation: "https://github.com/alchemyplatform",
};

describe("prepareProviderEntryHandler", () => {
  it("returns valid provider JSON for good inputs", () => {
    const result = prepareProviderEntryHandler(validInput);
    assert.equal(result.warnings.length, 0);
    assert.equal(result.missing_fields.length, 0);
    assert.equal(result.provider_json.name, "Alchemy");
    assert.equal(result.provider_json.slug, "alchemy");
    assert.equal(result.filename, "providers/alchemy.json");
    // Both added_date and last_verified must be present (required by schema)
    assert.ok(typeof result.provider_json.added_date === "string");
    assert.ok(typeof result.provider_json.last_verified === "string");
    assert.equal(result.provider_json.added_date, result.provider_json.last_verified);
  });

  it("warns on invalid slug", () => {
    const result = prepareProviderEntryHandler({ ...validInput, slug: "My Provider!" });
    assert.ok(result.warnings.some((w) => /invalid/.test(w)));
  });

  it("adds slug to missing_fields when absent", () => {
    const result = prepareProviderEntryHandler({ ...validInput, slug: "" });
    assert.ok(result.missing_fields.includes("slug"));
  });

  it("warns on marketing language in description", () => {
    const result = prepareProviderEntryHandler({
      ...validInput,
      description: "The best in class blockchain provider.",
    });
    assert.ok(result.warnings.some((w) => /marketing/i.test(w)));
  });

  it("adds source_attestation to missing_fields and warns when absent", () => {
    const result = prepareProviderEntryHandler({ ...validInput, source_attestation: undefined });
    assert.ok(result.missing_fields.includes("source_attestation"));
    assert.ok(result.warnings.some((w) => /source_attestation/.test(w)));
    // Must not write null into the JSON (would fail format:uri validation)
    assert.equal(result.provider_json.source_attestation, undefined);
  });

  it("adds website to missing_fields when absent", () => {
    const result = prepareProviderEntryHandler({ ...validInput, website: undefined });
    assert.ok(result.missing_fields.includes("website"));
    assert.equal(result.provider_json.website, undefined);
  });

  it("warns when source_attestation is not https", () => {
    const result = prepareProviderEntryHandler({
      ...validInput,
      source_attestation: "http://example.com",
    });
    assert.ok(result.warnings.some((w) => /official/.test(w)));
  });

  it("includes chainlens block when chainlens_intent provided", () => {
    const result = prepareProviderEntryHandler({
      ...validInput,
      chainlens_intent: { wants_listing: true, listing_status: "not_listed" },
    });
    assert.ok(result.provider_json.chainlens);
    const cl = result.provider_json.chainlens as { wants_listing: boolean };
    assert.equal(cl.wants_listing, true);
  });

  it("warns on unknown category (not in schema enum)", () => {
    const result = prepareProviderEntryHandler({ ...validInput, category: "infrastructure" });
    assert.ok(result.warnings.some((w) => /category/.test(w)));
  });

  it("adds missing_fields for name, category, description", () => {
    const result = prepareProviderEntryHandler({
      ...validInput,
      name: "",
      category: "",
      description: "",
    });
    assert.ok(result.missing_fields.includes("name"));
    assert.ok(result.missing_fields.includes("category"));
    assert.ok(result.missing_fields.includes("description"));
  });

  it("omits docs from output when absent (optional field, must not write null)", () => {
    const result = prepareProviderEntryHandler({ ...validInput, docs: undefined });
    assert.equal(result.provider_json.docs, undefined);
  });

  it("omits chainlens.contact from output when absent (optional URI, must not write null)", () => {
    const result = prepareProviderEntryHandler({
      ...validInput,
      chainlens_intent: { wants_listing: true },
    });
    const cl = result.provider_json.chainlens as Record<string, unknown>;
    assert.equal(cl.contact, undefined);
  });
});
