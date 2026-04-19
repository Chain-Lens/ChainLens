import type { OnChainTaskTypeConfig } from "@chainlens/shared";
import { validateAgainstSchema } from "./schema-validator.service.js";
import { scanResponse } from "./injection-filter.service.js";
import { getTestPayload } from "./test-payloads.js";

// Lazy import so unit tests that stub `getConfig` never load the on-chain
// module (which pulls env + viem at module load).
async function defaultGetConfig(name: string): Promise<OnChainTaskTypeConfig | null> {
  const mod = await import("./task-type.service.js");
  return mod.getTaskTypeConfig(name);
}

export interface TestInput {
  sellerAddress: string;
  endpointUrl: string;
  capabilities: string[];
}

export interface CapabilityResult {
  capability: string;
  passed: boolean;
  responseTimeMs?: number;
  statusCode?: number;
  schemaValid?: boolean;
  injectionFree?: boolean;
  error?: string;
}

export interface TestResult {
  passed: boolean;
  capabilityResults: CapabilityResult[];
}

export interface TestSellerDeps {
  getConfig?: (name: string) => Promise<OnChainTaskTypeConfig | null>;
  fetchImpl?: typeof fetch;
  payloadFor?: (capability: string) => object;
}

export async function testSeller(
  input: TestInput,
  deps: TestSellerDeps = {},
): Promise<TestResult> {
  const getConfig = deps.getConfig ?? defaultGetConfig;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const payloadFor = deps.payloadFor ?? getTestPayload;

  const capabilityResults: CapabilityResult[] = [];
  for (const capability of input.capabilities) {
    const cfg = await getConfig(capability);
    if (!cfg) {
      capabilityResults.push({
        capability,
        passed: false,
        error: "unknown_task_type",
      });
      continue;
    }
    if (!cfg.enabled) {
      capabilityResults.push({
        capability,
        passed: false,
        error: "task_type_disabled",
      });
      continue;
    }
    capabilityResults.push(
      await probeCapability(
        capability,
        input.endpointUrl,
        cfg,
        payloadFor(capability),
        fetchImpl,
      ),
    );
  }

  return {
    passed:
      capabilityResults.length > 0 &&
      capabilityResults.every((r) => r.passed),
    capabilityResults,
  };
}

async function probeCapability(
  capability: string,
  endpointUrl: string,
  cfg: OnChainTaskTypeConfig,
  payload: object,
  fetchImpl: typeof fetch,
): Promise<CapabilityResult> {
  const start = Date.now();

  let response: Response;
  try {
    response = await fetchImpl(endpointUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_type: capability, inputs: payload }),
      signal: AbortSignal.timeout(Number(cfg.maxResponseTime) * 1000),
    });
  } catch (err) {
    return {
      capability,
      passed: false,
      error: err instanceof Error ? err.message : "network_error",
    };
  }

  const responseTimeMs = Date.now() - start;

  if (!response.ok) {
    return {
      capability,
      passed: false,
      statusCode: response.status,
      responseTimeMs,
      error: `HTTP ${response.status}`,
    };
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return {
      capability,
      passed: false,
      statusCode: response.status,
      responseTimeMs,
      error: "invalid_json",
    };
  }

  const scan = scanResponse(data);
  if (!scan.clean) {
    return {
      capability,
      passed: false,
      statusCode: response.status,
      responseTimeMs,
      injectionFree: false,
      error: scan.reason,
    };
  }

  let schemaValid = true;
  let schemaError: string | undefined;
  if (cfg.schemaURI && cfg.schemaURI.length > 0) {
    try {
      const sr = await validateAgainstSchema(data, cfg.schemaURI);
      schemaValid = sr.valid;
      if (!sr.valid) {
        schemaError = `schema_invalid: ${(sr.errors ?? []).join(", ")}`;
      }
    } catch (err) {
      // Fetching the schema itself failed (unreachable URI, IPFS timeout, etc).
      // Treat as a test failure rather than poisoning all capabilities: the
      // seller can retry once the task-type registry points at a live schema.
      return {
        capability,
        passed: false,
        statusCode: response.status,
        responseTimeMs,
        injectionFree: true,
        schemaValid: false,
        error: `schema_fetch_failed: ${
          err instanceof Error ? err.message : "unknown"
        }`,
      };
    }
  }

  const passed = schemaValid && scan.clean;
  return {
    capability,
    passed,
    statusCode: response.status,
    responseTimeMs,
    schemaValid,
    injectionFree: scan.clean,
    error: passed ? undefined : schemaError,
  };
}
