import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import { AppError } from "../utils/errors.js";

const ajv = new Ajv({ strict: true, allErrors: true });
addFormats(ajv);

// Cache compiled validators (not raw schemas) so we only pay ajv.compile once
// per schemaURI.
const validatorCache = new Map<string, ValidateFunction>();

export interface SchemaValidationResult {
  valid: boolean;
  errors?: string[];
}

export async function validateAgainstSchema(
  data: unknown,
  schemaURI: string,
): Promise<SchemaValidationResult> {
  const validate = await getValidator(schemaURI);
  const valid = validate(data);
  if (valid) return { valid: true };
  return {
    valid: false,
    errors: (validate.errors ?? []).map(
      (e) => `${e.instancePath || "/"}: ${e.message ?? "invalid"}`,
    ),
  };
}

/**
 * Prime the cache with a schema object. Useful when the schema is bundled
 * in-repo (e.g., the spec §8 task types) or when tests want to skip the fetch.
 */
export function primeSchemaCache(schemaURI: string, schema: object): void {
  validatorCache.set(schemaURI, ajv.compile(schema));
}

export function clearSchemaCache(): void {
  validatorCache.clear();
}

async function getValidator(schemaURI: string): Promise<ValidateFunction> {
  const cached = validatorCache.get(schemaURI);
  if (cached) return cached;
  const schema = await fetchSchema(schemaURI);
  const validator = ajv.compile(schema);
  validatorCache.set(schemaURI, validator);
  return validator;
}

async function fetchSchema(uri: string): Promise<object> {
  const url = uri.startsWith("ipfs://")
    ? `https://ipfs.io/ipfs/${uri.slice("ipfs://".length)}`
    : uri;
  const response = await fetch(url);
  if (!response.ok) {
    throw new AppError(
      `schema fetch failed: ${uri} -> HTTP ${response.status}`,
      502,
      "SCHEMA_FETCH_FAILED"
    );
  }
  return (await response.json()) as object;
}
