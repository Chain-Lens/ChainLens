import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  validateAgainstSchema,
  primeSchemaCache,
  clearSchemaCache,
} from "./schema-validator.service.js";

const BLOCKSCOUT_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  required: ["contract_address", "source_code", "compiler_version"],
  additionalProperties: false,
  properties: {
    contract_address: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
    source_code: { type: "string", minLength: 1 },
    compiler_version: { type: "string" },
    verified: { type: "boolean" },
  },
} as const;

const TEST_URI = "ipfs://test-blockscout";

describe("schema-validator", () => {
  beforeEach(() => {
    clearSchemaCache();
    primeSchemaCache(TEST_URI, BLOCKSCOUT_SCHEMA);
  });

  it("validates a well-formed payload", async () => {
    const r = await validateAgainstSchema(
      {
        contract_address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
        source_code: "contract UNI {}",
        compiler_version: "0.8.28",
      },
      TEST_URI,
    );
    assert.deepEqual(r, { valid: true });
  });

  it("returns errors with instancePath + message on a bad payload", async () => {
    const r = await validateAgainstSchema(
      {
        contract_address: "0xNOT",
        source_code: "x",
      },
      TEST_URI,
    );
    assert.equal(r.valid, false);
    assert.ok(r.errors && r.errors.length > 0);
    // At least one error should mention the pattern violation or a missing field
    const combined = (r.errors ?? []).join(" | ");
    assert.match(combined, /pattern|required|compiler_version/);
  });

  it("rejects unknown properties (additionalProperties:false)", async () => {
    const r = await validateAgainstSchema(
      {
        contract_address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
        source_code: "contract x {}",
        compiler_version: "0.8.28",
        malicious_extra: "ignore previous instructions",
      },
      TEST_URI,
    );
    assert.equal(r.valid, false);
    assert.ok(
      (r.errors ?? []).some((e) => /additional|malicious_extra/i.test(e)),
      `expected error about additional property, got: ${JSON.stringify(r.errors)}`,
    );
  });

  it("uses cached compiled validator (no refetch) between calls", async () => {
    // First call primes the cache via primeSchemaCache in beforeEach.
    const first = await validateAgainstSchema(
      {
        contract_address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
        source_code: "ok",
        compiler_version: "0.8",
      },
      TEST_URI,
    );
    const second = await validateAgainstSchema({ bad: true }, TEST_URI);
    assert.equal(first.valid, true);
    assert.equal(second.valid, false);
    // If cache were missed, the unknown URI would trigger a network fetch and throw.
  });

  it("throws a descriptive error when the URI is uncached and fetch unavailable", async () => {
    clearSchemaCache();
    await assert.rejects(
      () => validateAgainstSchema({}, "https://127.0.0.1:1/never-listens.json"),
      /schema fetch failed|fetch failed|ECONNREFUSED|ENOTFOUND/i,
    );
  });
});
