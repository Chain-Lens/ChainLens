import { BadInputError, UpstreamError, type TaskHandler } from "../lib/types.js";

export interface BlockscoutDeps {
  fetch: typeof fetch;
  /** chain_id → Blockscout base URL (no trailing slash). */
  baseUrlFor: (chainId: number) => string | undefined;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

function requireString(value: unknown, field: string, regex?: RegExp): string {
  if (typeof value !== "string" || !value.length) {
    throw new BadInputError(`missing ${field}`);
  }
  if (regex && !regex.test(value)) {
    throw new BadInputError(`invalid ${field}`);
  }
  return value;
}

function requireNumber(value: unknown, field: string): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value)
        ? Number(value)
        : Number.NaN;
  if (!Number.isInteger(n) || n <= 0) {
    throw new BadInputError(`invalid ${field}`);
  }
  return n;
}

async function callBlockscout(
  deps: BlockscoutDeps,
  chainId: number,
  path: string,
): Promise<unknown> {
  const base = deps.baseUrlFor(chainId);
  if (!base) {
    throw new BadInputError(`unsupported chain_id ${chainId}`);
  }
  const res = await deps.fetch(`${base}${path}`);
  if (!res.ok) {
    throw new UpstreamError(`Blockscout HTTP ${res.status}`, 502);
  }
  return res.json();
}

export function makeContractSourceHandler(deps: BlockscoutDeps): TaskHandler {
  return async (inputs) => {
    const address = requireString(inputs.contract_address, "contract_address", ADDRESS_RE);
    const chainId = requireNumber(inputs.chain_id, "chain_id");
    const raw = (await callBlockscout(
      deps,
      chainId,
      `/api/v2/smart-contracts/${address}`,
    )) as Record<string, unknown>;
    return {
      contract_address: address,
      chain_id: chainId,
      name: stringOrNull(raw.name),
      compiler_version: stringOrNull(raw.compiler_version),
      optimization_enabled: boolOrNull(raw.optimization_enabled),
      source_code: stringOrNull(raw.source_code),
      abi: raw.abi ?? null,
      verified: raw.is_verified === true,
    };
  };
}

export function makeTxInfoHandler(deps: BlockscoutDeps): TaskHandler {
  return async (inputs) => {
    const txHash = requireString(inputs.tx_hash, "tx_hash", TX_HASH_RE);
    const chainId = requireNumber(inputs.chain_id, "chain_id");
    const raw = (await callBlockscout(
      deps,
      chainId,
      `/api/v2/transactions/${txHash}`,
    )) as Record<string, unknown>;
    return {
      tx_hash: txHash,
      chain_id: chainId,
      block_number: numberOrNull(raw.block_number),
      from: extractAddress(raw.from),
      to: extractAddress(raw.to),
      value: stringOrNull(raw.value),
      status: stringOrNull(raw.status),
      gas_used: stringOrNull(raw.gas_used),
      timestamp: stringOrNull(raw.timestamp),
    };
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
function numberOrNull(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}
function boolOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}
function extractAddress(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "hash" in value) {
    const hash = (value as { hash: unknown }).hash;
    return typeof hash === "string" ? hash : null;
  }
  return null;
}

export const DEFAULT_BLOCKSCOUT_BASES: Record<number, string> = {
  1: "https://eth.blockscout.com",
  8453: "https://base.blockscout.com",
  84532: "https://base-sepolia.blockscout.com",
};
