import { isPlainObject } from "./common.js";

export type Strictness = "loose" | "balanced" | "strict";

export interface DraftOutputSchemaInput {
  /** A sample JSON response from the seller endpoint. */
  sample_response: unknown;
  /** How tightly to bind types. Default "balanced". */
  strictness?: Strictness;
}

export interface DraftOutputSchemaResult {
  output_schema: Record<string, unknown>;
  summary: string;
  warnings: string[];
}

export function draftOutputSchemaHandler(input: DraftOutputSchemaInput): DraftOutputSchemaResult {
  const strictness: Strictness = input.strictness ?? "balanced";
  const warnings: string[] = [];

  if (input.sample_response === undefined || input.sample_response === null) {
    return {
      output_schema: { type: "null" },
      summary: "Sample response is null/undefined — schema is minimal.",
      warnings: ["sample_response is null or undefined; schema will be very loose."],
    };
  }

  const schema = inferSchema(input.sample_response, strictness, warnings, 0);

  return {
    output_schema: schema,
    summary: buildSummary(schema, strictness),
    warnings,
  };
}

function inferSchema(
  value: unknown,
  strictness: Strictness,
  warnings: string[],
  depth: number,
): Record<string, unknown> {
  if (depth > 10) {
    warnings.push("Schema inference stopped at depth 10 — deeply nested structure detected.");
    return { type: "object" };
  }

  if (value === null) return { type: "null" };

  switch (typeof value) {
    case "boolean":
      return { type: "boolean" };
    case "number":
      return Number.isInteger(value) ? { type: "integer" } : { type: "number" };
    case "string":
      return { type: "string" };
    case "object":
      if (Array.isArray(value)) {
        return inferArraySchema(value, strictness, warnings, depth);
      }
      return inferObjectSchema(value as Record<string, unknown>, strictness, warnings, depth);
    default:
      return { type: "string" };
  }
}

function inferArraySchema(
  arr: unknown[],
  strictness: Strictness,
  warnings: string[],
  depth: number,
): Record<string, unknown> {
  if (arr.length === 0) {
    warnings.push("Sample contains an empty array — item schema cannot be inferred.");
    return { type: "array", items: {} };
  }

  // Check for mixed types
  const types = new Set(arr.map((item) => (item === null ? "null" : typeof item)));
  if (types.size > 1) {
    warnings.push(
      `Array contains mixed types (${[...types].join(", ")}) — item schema may be inaccurate.`,
    );
  }

  if (arr.length > 100) {
    warnings.push(
      `Sample array has ${arr.length} items — only the first item was used for schema inference.`,
    );
  }

  // Use first item as representative
  const itemSchema = inferSchema(arr[0], strictness, warnings, depth + 1);
  return { type: "array", items: itemSchema };
}

function inferObjectSchema(
  obj: Record<string, unknown>,
  strictness: Strictness,
  warnings: string[],
  depth: number,
): Record<string, unknown> {
  const keys = Object.keys(obj);

  if (keys.length === 0) {
    return { type: "object" };
  }

  const properties: Record<string, unknown> = {};
  const nullHeavyKeys: string[] = [];

  for (const key of keys) {
    const val = obj[key];
    if (val === null) nullHeavyKeys.push(key);
    properties[key] = inferSchema(val, strictness, warnings, depth + 1);
  }

  if (nullHeavyKeys.length > 0) {
    warnings.push(
      `Fields with null values (${nullHeavyKeys.join(", ")}) — actual type cannot be inferred from this sample.`,
    );
  }

  const schema: Record<string, unknown> = { type: "object", properties };

  if (strictness === "strict") {
    schema.required = keys;
    schema.additionalProperties = false;
  } else if (strictness === "balanced") {
    // Require keys whose values are non-null
    const required = keys.filter((k) => obj[k] !== null && obj[k] !== undefined);
    if (required.length > 0) schema.required = required;
  }
  // loose: no required, no additionalProperties

  return schema;
}

function buildSummary(schema: Record<string, unknown>, strictness: Strictness): string {
  const topType = schema.type as string | undefined;
  if (topType === "object") {
    const props = schema.properties as Record<string, unknown> | undefined;
    const count = props ? Object.keys(props).length : 0;
    return `Object schema with ${count} field(s), strictness=${strictness}.`;
  }
  if (topType === "array") {
    return `Array schema, strictness=${strictness}.`;
  }
  return `Scalar schema (${topType ?? "unknown"}), strictness=${strictness}.`;
}

export const draftOutputSchemaToolDefinition = {
  name: "seller.draft_output_schema",
  description:
    "Generate a deterministic JSON Schema draft from a sample API response. Describe data types and shapes without embedding literal values as constants. Use this before seller.prepare_paid_listing to produce an output_schema.",
  inputSchema: {
    type: "object",
    required: ["sample_response"],
    properties: {
      sample_response: {
        description: "A sample JSON response from the seller endpoint (object, array, or scalar).",
      },
      strictness: {
        type: "string",
        enum: ["loose", "balanced", "strict"],
        description:
          "How tightly to bind types. 'loose' avoids overfitting (no required fields). 'balanced' (default) requires non-null fields. 'strict' adds required + additionalProperties:false.",
      },
    },
  },
} as const;
