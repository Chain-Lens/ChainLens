import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { onboardProviderHandler } from "./onboard-provider.js";

const BASE = {
  name: "Example API",
  slug: "example-api",
  category: "indexer",
  description: "Provides indexed onchain data via REST.",
  website: "https://example.com",
  docs: "https://docs.example.com",
  source_attestation: "https://github.com/example/example-api",
} as const;

describe("seller.onboard_provider", () => {
  describe("fast path — minimal input", () => {
    it("returns provider_entry and listing_prep inline", () => {
      const result = onboardProviderHandler({ path: "fast", ...BASE });
      assert.equal(result.path, "fast");
      assert.ok(result.provider_entry);
      assert.equal(result.provider_entry.filename, "providers/example-api.json");
      assert.ok(result.listing_prep);
      assert.equal(result.listing_prep.readiness, "incomplete");
    });

    it("marks prepare_provider_entry step as done", () => {
      const result = onboardProviderHandler({ path: "fast", ...BASE });
      const step = result.steps.find((s) => s.tool === "seller.prepare_provider_entry");
      assert.ok(step);
      assert.equal(step.status, "done");
      assert.equal(step.requires_confirmation, false);
    });

    it("marks preflight step as pending when no endpoint", () => {
      const result = onboardProviderHandler({ path: "fast", ...BASE });
      const step = result.steps.find((s) => s.tool === "seller.preflight_endpoint");
      assert.ok(step);
      assert.equal(step.status, "pending");
      assert.ok(step.blocked_by);
    });

    it("marks preflight step as ready when endpoint provided", () => {
      const result = onboardProviderHandler({
        path: "fast",
        ...BASE,
        endpoint: "https://api.example.com/query",
        method: "GET",
      });
      const step = result.steps.find((s) => s.tool === "seller.preflight_endpoint");
      assert.ok(step);
      assert.equal(step.status, "ready");
      assert.equal((step.args as Record<string, unknown>).endpoint, "https://api.example.com/query");
    });

    it("includes draft_output_schema step when no schema provided", () => {
      const result = onboardProviderHandler({ path: "fast", ...BASE });
      const step = result.steps.find((s) => s.tool === "seller.draft_output_schema");
      assert.ok(step, "draft_output_schema step should be present");
      assert.equal(step.status, "pending");
    });

    it("omits draft_output_schema step when schema is already provided", () => {
      const result = onboardProviderHandler({
        path: "fast",
        ...BASE,
        output_schema: { type: "object" },
      });
      const step = result.steps.find((s) => s.tool === "seller.draft_output_schema");
      assert.equal(step, undefined, "draft_output_schema should be omitted when schema is present");
    });

    it("marks registration step as needs_confirmation when all fields present", () => {
      const result = onboardProviderHandler({
        path: "fast",
        ...BASE,
        endpoint: "https://api.example.com/q",
        method: "POST",
        price_usdc: 0.05,
        output_schema: { type: "object" },
        payout_address: "0x1111111111111111111111111111111111111111",
        metadata_uri: "https://example.com/meta.json",
      });
      const step = result.steps.find((s) => s.tool === "seller.register_paid_listing");
      assert.ok(step);
      assert.equal(step.status, "needs_confirmation");
      assert.equal(step.requires_confirmation, true);
      assert.equal((step.args as Record<string, unknown>).metadata_uri, "https://example.com/meta.json");
      assert.equal(
        (step.args as Record<string, unknown>).payout_address,
        "0x1111111111111111111111111111111111111111",
      );
    });

    it("marks registration step as pending when metadata_uri missing", () => {
      const result = onboardProviderHandler({
        path: "fast",
        ...BASE,
        endpoint: "https://api.example.com/q",
        method: "POST",
        price_usdc: 0.05,
        output_schema: { type: "object" },
        payout_address: "0x1111111111111111111111111111111111111111",
        // metadata_uri omitted
      });
      const step = result.steps.find((s) => s.tool === "seller.register_paid_listing");
      assert.ok(step);
      assert.equal(step.status, "pending");
      assert.ok(step.blocked_by?.includes("metadata_uri"));
    });

    it("does NOT include directory PR or backfill steps on fast path", () => {
      const result = onboardProviderHandler({ path: "fast", ...BASE });
      const prStep = result.steps.find((s) => s.tool === "seller.open_directory_pr");
      const backfillStep = result.steps.find((s) => s.tool === "seller.backfill_listing_url");
      assert.equal(prStep, undefined);
      assert.equal(backfillStep, undefined);
    });
  });

  describe("directory_backed path", () => {
    it("includes open_directory_pr step with needs_confirmation", () => {
      const result = onboardProviderHandler({ path: "directory_backed", ...BASE });
      const step = result.steps.find((s) => s.tool === "seller.open_directory_pr");
      assert.ok(step);
      assert.equal(step.status, "needs_confirmation");
      assert.equal(step.requires_confirmation, true);
      // Args should include provider_entries with the prepared JSON
      const args = step.args as Record<string, unknown>;
      assert.ok(Array.isArray(args.provider_entries));
    });

    it("includes import_directory_provider step blocked until PR merges", () => {
      const result = onboardProviderHandler({ path: "directory_backed", ...BASE });
      const step = result.steps.find((s) => s.tool === "seller.import_directory_provider");
      assert.ok(step);
      assert.equal(step.status, "pending");
      assert.ok(step.blocked_by?.includes("merged"));
    });

    it("marks import step as done when imported_directory_metadata is provided", () => {
      const result = onboardProviderHandler({
        path: "directory_backed",
        ...BASE,
        imported_directory_metadata: { name: "Example API", description: "Indexed data." },
      });
      const step = result.steps.find((s) => s.tool === "seller.import_directory_provider");
      assert.ok(step);
      assert.equal(step.status, "done");
    });

    it("includes backfill_listing_url step blocked on registration", () => {
      const result = onboardProviderHandler({ path: "directory_backed", ...BASE });
      const step = result.steps.find((s) => s.tool === "seller.backfill_listing_url");
      assert.ok(step);
      assert.equal(step.requires_confirmation, true);
      assert.ok(step.blocked_by?.includes("listing_url"));
      assert.equal((step.args as Record<string, unknown>).provider_slug, "example-api");
    });

    it("sets chainlens.wants_listing=true in provider_json", () => {
      const result = onboardProviderHandler({ path: "directory_backed", ...BASE });
      const json = result.provider_entry.provider_json as Record<string, unknown>;
      const cl = json.chainlens as Record<string, unknown> | undefined;
      assert.ok(cl, "chainlens block should be present");
      assert.equal(cl.wants_listing, true);
    });
  });

  describe("step ordering and completeness", () => {
    it("fast path has at least 4 steps", () => {
      const result = onboardProviderHandler({ path: "fast", ...BASE });
      assert.ok(result.steps.length >= 4);
    });

    it("directory_backed path has at least 6 steps", () => {
      const result = onboardProviderHandler({ path: "directory_backed", ...BASE });
      assert.ok(result.steps.length >= 6);
    });

    it("prepare_paid_listing step is always done", () => {
      const result = onboardProviderHandler({ path: "fast", ...BASE });
      const step = result.steps.find((s) => s.tool === "seller.prepare_paid_listing");
      assert.ok(step);
      assert.equal(step.status, "done");
    });
  });

  describe("summary", () => {
    it("mentions missing fields when provider entry is incomplete", () => {
      const result = onboardProviderHandler({
        path: "fast",
        name: "Bad Provider",
        slug: "bad",
        category: "rpc",
        description: "Test",
        // missing source_attestation, website
      });
      assert.ok(
        result.summary.toLowerCase().includes("missing") ||
          result.provider_entry.missing_fields.length > 0,
      );
    });

    it("mentions ready to register when all fields present", () => {
      const result = onboardProviderHandler({
        path: "fast",
        ...BASE,
        endpoint: "https://api.example.com/q",
        method: "POST",
        price_usdc: 0.05,
        output_schema: { type: "object" },
        payout_address: "0x1111111111111111111111111111111111111111",
        metadata_uri: "https://example.com/meta.json",
      });
      assert.ok(result.summary.toLowerCase().includes("ready") || result.listing_prep.readiness === "ready");
    });
  });

  describe("expected_metadata_hash passthrough", () => {
    it("passes expected_metadata_hash to registration step args", () => {
      const result = onboardProviderHandler({
        path: "fast",
        ...BASE,
        endpoint: "https://api.example.com/q",
        method: "POST",
        price_usdc: 0.05,
        output_schema: { type: "object" },
        payout_address: "0x1111111111111111111111111111111111111111",
        metadata_uri: "https://example.com/meta.json",
        expected_metadata_hash: "abc123",
      });
      const step = result.steps.find((s) => s.tool === "seller.register_paid_listing");
      assert.ok(step);
      assert.equal((step.args as Record<string, unknown>).expected_metadata_hash, "abc123");
    });
  });

  describe("name/description propagation to listing_prep (fix)", () => {
    it("listing_prep.metadata.name reflects input.name (not empty)", () => {
      const result = onboardProviderHandler({ path: "fast", ...BASE });
      assert.equal(result.listing_prep.metadata?.name, "Example API");
    });

    it("listing_prep.metadata.description reflects input.description (not empty)", () => {
      const result = onboardProviderHandler({ path: "fast", ...BASE });
      assert.equal(
        result.listing_prep.metadata?.description,
        "Provides indexed onchain data via REST.",
      );
    });

    it("explicit name/description override directory_metadata when both provided", () => {
      const result = onboardProviderHandler({
        path: "fast",
        ...BASE,
        name: "Explicit Name",
        description: "Explicit description.",
        imported_directory_metadata: {
          name: "Dir Name",
          description: "Dir description.",
        },
      });
      assert.equal(result.listing_prep.metadata?.name, "Explicit Name");
      assert.equal(result.listing_prep.metadata?.description, "Explicit description.");
    });
  });

  describe("imported_directory_metadata unwrapping (fix)", () => {
    it("accepts raw DirectoryMetadata shape", () => {
      const result = onboardProviderHandler({
        path: "fast",
        ...BASE,
        // explicit name/description omitted to test fallback from dirMeta
        name: undefined as unknown as string,
        description: undefined as unknown as string,
        imported_directory_metadata: {
          name: "Dir Name",
          description: "Dir description.",
          tags: ["onchain"],
        },
      });
      // listing_prefill from dirMeta should be used
      assert.equal(result.listing_prep.metadata?.name, "Dir Name");
    });

    it("accepts full ImportDirectoryProviderResult shape (unwraps listing_prefill)", () => {
      const fullImportResult = {
        provider: { slug: "example-api", name: "Example API" },
        listing_prefill: {
          name: "Prefill Name",
          description: "Prefill description.",
          tags: ["data"],
          provider_slug: "example-api",
        },
        missing_paid_listing_fields: ["endpoint", "pricing"],
        warnings: [],
        register_url: "/register?provider=example-api",
      };
      const result = onboardProviderHandler({
        path: "fast",
        ...BASE,
        name: undefined as unknown as string,
        description: undefined as unknown as string,
        imported_directory_metadata: fullImportResult as never,
      });
      assert.equal(result.listing_prep.metadata?.name, "Prefill Name");
      assert.equal(result.listing_prep.metadata?.description, "Prefill description.");
    });

    it("handles listing_prefill: null in full import result gracefully", () => {
      const fullImportResult = {
        provider: null,
        listing_prefill: null,
        missing_paid_listing_fields: [],
        warnings: [],
        register_url: "/register?provider=example-api",
      };
      // Should not throw; listing will use explicit name/description from BASE
      const result = onboardProviderHandler({
        path: "fast",
        ...BASE,
        imported_directory_metadata: fullImportResult as never,
      });
      assert.equal(result.listing_prep.metadata?.name, "Example API");
    });

    it("import step shows status=done when full import result is passed", () => {
      const result = onboardProviderHandler({
        path: "directory_backed",
        ...BASE,
        imported_directory_metadata: {
          listing_prefill: { name: "X", description: "Y", provider_slug: "example-api" },
          provider: {},
          missing_paid_listing_fields: [],
          warnings: [],
          register_url: "/register?provider=example-api",
        } as never,
      });
      const step = result.steps.find((s) => s.tool === "seller.import_directory_provider");
      assert.ok(step);
      assert.equal(step.status, "done");
    });
  });
});
