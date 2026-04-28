import type { ListingMetadata } from "./market-chain.service.js";

export interface ResponseSchemaResult {
  applicable: boolean;
  valid: boolean;
  reason?: string;
}

type JsonSchemaLike = {
  type?: string | string[];
  required?: string[];
  properties?: Record<string, JsonSchemaLike>;
  items?: JsonSchemaLike;
  enum?: unknown[];
  additionalProperties?: boolean;
};

export function validateResponseShape(
  data: unknown,
  metadata: ListingMetadata,
): ResponseSchemaResult {
  const explicitSchema = metadata.output_schema;
  if (explicitSchema && typeof explicitSchema === "object") {
    const check = validateAgainstJsonSchemaLike(data, explicitSchema as JsonSchemaLike, "$");
    return check.valid
      ? { applicable: true, valid: true }
      : { applicable: true, valid: false, reason: check.reason };
  }

  if (metadata.example_response !== undefined) {
    const check = validateAgainstExampleShape(data, metadata.example_response, "$");
    return check.valid
      ? { applicable: true, valid: true }
      : { applicable: true, valid: false, reason: check.reason };
  }

  return { applicable: false, valid: true };
}

function validateAgainstJsonSchemaLike(
  value: unknown,
  schema: JsonSchemaLike,
  path: string,
): { valid: boolean; reason?: string } {
  if (schema.enum && !schema.enum.some((candidate) => deepEqual(candidate, value))) {
    return { valid: false, reason: `${path}: enum mismatch` };
  }

  if (schema.type) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = jsonTypeOf(value);
    if (!allowed.includes(actual)) {
      return {
        valid: false,
        reason: `${path}: expected ${allowed.join("|")}, got ${actual}`,
      };
    }
  }

  if (schema.properties || schema.required) {
    if (!isPlainObject(value)) {
      return { valid: false, reason: `${path}: expected object` };
    }
    const objectValue = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!(key in objectValue)) {
        return { valid: false, reason: `${path}.${key}: required` };
      }
    }
    for (const [key, propertySchema] of Object.entries(schema.properties ?? {})) {
      if (!(key in objectValue)) continue;
      const nested = validateAgainstJsonSchemaLike(
        objectValue[key],
        propertySchema,
        `${path}.${key}`,
      );
      if (!nested.valid) return nested;
    }
    if (schema.additionalProperties === false && schema.properties) {
      for (const key of Object.keys(objectValue)) {
        if (!(key in schema.properties)) {
          return {
            valid: false,
            reason: `${path}.${key}: additional property not allowed`,
          };
        }
      }
    }
  }

  if (schema.items) {
    if (!Array.isArray(value)) {
      return { valid: false, reason: `${path}: expected array` };
    }
    for (let i = 0; i < value.length; i++) {
      const nested = validateAgainstJsonSchemaLike(value[i], schema.items, `${path}[${i}]`);
      if (!nested.valid) return nested;
    }
  }

  return { valid: true };
}

function validateAgainstExampleShape(
  value: unknown,
  example: unknown,
  path: string,
): { valid: boolean; reason?: string } {
  const expectedType = jsonTypeOf(example);
  const actualType = jsonTypeOf(value);
  if (expectedType !== actualType) {
    return {
      valid: false,
      reason: `${path}: expected ${expectedType}, got ${actualType}`,
    };
  }

  if (Array.isArray(example)) {
    if (!Array.isArray(value)) {
      return { valid: false, reason: `${path}: expected array` };
    }
    if (example.length === 0 || value.length === 0) return { valid: true };
    return validateAgainstExampleShape(value[0], example[0], `${path}[0]`);
  }

  if (isPlainObject(example)) {
    if (!isPlainObject(value)) {
      return { valid: false, reason: `${path}: expected object` };
    }
    const exampleObject = example as Record<string, unknown>;
    const valueObject = value as Record<string, unknown>;
    for (const [key, exampleChild] of Object.entries(exampleObject)) {
      if (!(key in valueObject)) {
        return { valid: false, reason: `${path}.${key}: missing` };
      }
      const nested = validateAgainstExampleShape(valueObject[key], exampleChild, `${path}.${key}`);
      if (!nested.valid) return nested;
    }
  }

  return { valid: true };
}

function jsonTypeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value === "object" ? "object" : typeof value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
