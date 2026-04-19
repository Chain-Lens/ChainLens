import { BadInputError, UpstreamError, type TaskHandler } from "../lib/types.js";

export interface SourcifyDeps {
  fetch: typeof fetch;
  /** Base URL of a Sourcify server, e.g. https://sourcify.dev/server. */
  baseUrl: string;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function makeVerifyHandler(deps: SourcifyDeps): TaskHandler {
  return async (inputs) => {
    const address = inputs.contract_address;
    const chainId = inputs.chain_id;
    if (typeof address !== "string" || !ADDRESS_RE.test(address)) {
      throw new BadInputError("invalid contract_address");
    }
    const id = typeof chainId === "number" ? chainId : Number(chainId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadInputError("invalid chain_id");
    }
    const res = await deps.fetch(
      `${deps.baseUrl}/check-all-by-addresses?addresses=${address}&chainIds=${id}`,
    );
    if (!res.ok) {
      throw new UpstreamError(`Sourcify HTTP ${res.status}`, 502);
    }
    const body = (await res.json()) as unknown;
    const entry = Array.isArray(body) ? (body[0] as Record<string, unknown> | undefined) : undefined;
    const status = typeof entry?.status === "string" ? entry.status : "unknown";
    return {
      contract_address: address,
      chain_id: id,
      status, // "perfect" | "partial" | "false" | "unknown"
      verified: status === "perfect" || status === "partial",
      match_type: status === "perfect" || status === "partial" ? status : null,
      checked_at: new Date().toISOString(),
    };
  };
}

export const DEFAULT_SOURCIFY_BASE = "https://sourcify.dev/server";
