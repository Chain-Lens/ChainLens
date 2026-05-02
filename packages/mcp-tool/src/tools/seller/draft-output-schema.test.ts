import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { draftOutputSchemaHandler } from "./draft-output-schema.js";

describe("draftOutputSchemaHandler", () => {
  it("infers object schema from plain object (balanced)", () => {
    const result = draftOutputSchemaHandler({
      sample_response: { price: 1.23, symbol: "ETH", active: true },
    });
    assert.equal(result.output_schema.type, "object");
    const props = result.output_schema.properties as Record<string, { type: string }>;
    assert.equal(props.price.type, "number");
    assert.equal(props.symbol.type, "string");
    assert.equal(props.active.type, "boolean");
    assert.deepEqual(result.output_schema.required, ["price", "symbol", "active"]);
  });

  it("strict mode adds required + additionalProperties false", () => {
    const result = draftOutputSchemaHandler({
      sample_response: { a: 1 },
      strictness: "strict",
    });
    assert.deepEqual(result.output_schema.required, ["a"]);
    assert.equal(result.output_schema.additionalProperties, false);
  });

  it("loose mode has no required", () => {
    const result = draftOutputSchemaHandler({
      sample_response: { a: 1 },
      strictness: "loose",
    });
    assert.equal(result.output_schema.required, undefined);
  });

  it("infers array schema from non-empty array", () => {
    const result = draftOutputSchemaHandler({ sample_response: [{ id: 1 }] });
    assert.equal(result.output_schema.type, "array");
    const items = result.output_schema.items as { type: string };
    assert.equal(items.type, "object");
  });

  it("warns on empty array", () => {
    const result = draftOutputSchemaHandler({ sample_response: [] });
    assert.ok(result.warnings.some((w) => /empty array/.test(w)));
  });

  it("warns on mixed-type array", () => {
    const result = draftOutputSchemaHandler({ sample_response: [1, "two"] });
    assert.ok(result.warnings.some((w) => /mixed types/.test(w)));
  });

  it("warns on null fields", () => {
    const result = draftOutputSchemaHandler({ sample_response: { x: null } });
    assert.ok(result.warnings.some((w) => /null values/.test(w)));
  });

  it("handles scalar string", () => {
    const result = draftOutputSchemaHandler({ sample_response: "hello" });
    assert.equal(result.output_schema.type, "string");
  });

  it("handles null sample_response", () => {
    const result = draftOutputSchemaHandler({ sample_response: null });
    assert.equal(result.output_schema.type, "null");
    assert.ok(result.warnings.length > 0);
  });

  it("integer vs number", () => {
    const ri = draftOutputSchemaHandler({ sample_response: 42 });
    assert.equal(ri.output_schema.type, "integer");
    const rn = draftOutputSchemaHandler({ sample_response: 3.14 });
    assert.equal(rn.output_schema.type, "number");
  });
});
