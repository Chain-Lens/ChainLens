import { type FetchFn, fetchJson } from "./common.js";

export interface PreflightEndpointInput {
  /** The seller endpoint URL to test. */
  endpoint: string;
  /** HTTP method. Default GET. */
  method?: "GET" | "POST";
  /** Example payload (POST only). Do NOT include secrets. */
  payload?: unknown;
  /** Output schema to validate the response against (optional). */
  output_schema?: unknown;
}

export interface PreflightEndpointResult {
  http_status: number | null;
  latency_ms: number | null;
  body_sample: unknown;
  schema_valid: boolean | null;
  warnings: string[];
  error: string | null;
}

export interface PreflightEndpointDeps {
  apiBaseUrl: string;
  fetch: FetchFn;
}

export async function preflightEndpointHandler(
  input: PreflightEndpointInput,
  deps: PreflightEndpointDeps,
): Promise<PreflightEndpointResult> {
  const warnings: string[] = [];

  if (!input.endpoint) {
    return errorResult("endpoint is required.", warnings);
  }

  // Basic URL validation
  try {
    new URL(input.endpoint);
  } catch {
    return errorResult(`endpoint is not a valid URL: ${input.endpoint}`, warnings);
  }

  const method = input.method ?? "GET";

  if (input.payload && method === "GET") {
    warnings.push("payload is ignored for GET requests.");
  }

  if (input.payload) {
    const payloadStr = JSON.stringify(input.payload);
    if (/\b(password|secret|api[_-]?key|token|private[_-]?key)\b/i.test(payloadStr)) {
      warnings.push(
        "payload may contain secrets — do NOT include real credentials in example payloads.",
      );
    }
  }

  const body: Record<string, unknown> = {
    endpoint: input.endpoint,
    method,
  };
  if (method === "POST" && input.payload !== undefined) {
    body.payload = input.payload;
  }
  if (input.output_schema !== undefined) {
    body.output_schema = input.output_schema;
  }

  let backendResult: BackendPreflightResponse;
  try {
    backendResult = await fetchJson<BackendPreflightResponse>(
      `${deps.apiBaseUrl}/seller/preflight`,
      deps.fetch,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
  } catch (err) {
    return errorResult(
      `ChainLens preflight backend error: ${err instanceof Error ? err.message : String(err)}`,
      warnings,
    );
  }

  // Map backend shape → MCP output shape.
  // Backend: { status, body, latencyMs, safety: { schemaValid, warnings }, error }
  if (backendResult.safety?.warnings) {
    warnings.push(...backendResult.safety.warnings);
  }

  return {
    http_status: backendResult.status ?? null,
    latency_ms: backendResult.latencyMs ?? null,
    body_sample: backendResult.body ?? null,
    schema_valid: backendResult.safety?.schemaValid ?? null,
    warnings,
    error: backendResult.error ?? null,
  };
}

interface BackendPreflightResponse {
  status?: number;
  body?: unknown;
  latencyMs?: number;
  safety?: {
    scanned?: boolean;
    schemaValid?: boolean | null;
    warnings?: string[];
  };
  error?: string;
}

function errorResult(error: string, warnings: string[]): PreflightEndpointResult {
  return {
    http_status: null,
    latency_ms: null,
    body_sample: null,
    schema_valid: null,
    warnings,
    error,
  };
}

export const preflightEndpointToolDefinition = {
  name: "seller.preflight_endpoint",
  description:
    "Run a seller endpoint through the ChainLens backend preflight check. The backend handles SSRF protection and response scanning — the MCP never calls the seller endpoint directly. Returns HTTP status, latency, a body sample, and schema validation result.",
  inputSchema: {
    type: "object",
    required: ["endpoint"],
    properties: {
      endpoint: {
        type: "string",
        description: "The seller API endpoint URL to preflight.",
      },
      method: {
        type: "string",
        enum: ["GET", "POST"],
        description: "HTTP method. Default GET.",
      },
      payload: {
        description:
          "Example request payload for POST endpoints. Do NOT include real secrets or API keys.",
      },
      output_schema: {
        description:
          "JSON Schema to validate the response against. Use seller.draft_output_schema to generate one first.",
      },
    },
  },
} as const;
