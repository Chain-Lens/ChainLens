#!/usr/bin/env node
/**
 * Entry point for the ChainLens MCP tool.
 *
 * Reads env config, wires production dependencies (viem public/wallet clients,
 * live fetch, ERC20 approve via viem contract abi) and launches a stdio
 * transport so Claude Desktop can consume the three tools.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  stringToBytes,
  type Abi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Account } from "viem";
import {
  ApiMarketEscrowV2Abi,
  CONTRACT_ADDRESSES_V2,
  USDC_ADDRESSES,
  baseSepolia,
  baseMainnet,
} from "@chain-lens/shared";
import { connectDaemon, daemonAccount } from "@chain-lens/sign";

import { loadMcpConfig, type McpConfig } from "./config.js";
import { buildMcpServer } from "./server.js";

// Minimal ERC-20 approve ABI (we only need approve for the escrow flow).
const ERC20_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const satisfies Abi;

function chainFor(chainId: number) {
  if (chainId === baseSepolia.id) return baseSepolia;
  if (chainId === baseMainnet.id) return baseMainnet;
  throw new Error(`Unsupported CHAIN_ID ${chainId}. Expected ${baseSepolia.id} or ${baseMainnet.id}.`);
}

function bytes32FromName(name: string): `0x${string}` {
  // Canonical task type id: keccak256(utf8(name)) — matches gateway encoding.
  return keccak256(stringToBytes(name));
}

function canonicalInputsHash(inputs: unknown): `0x${string}` {
  // JSON.stringify with stable key ordering. The backend does the same
  // (gateway canonicalises before hashing) so buyer and recorder agree.
  return keccak256(stringToBytes(stableStringify(inputs)));
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

async function resolveAccount(config: McpConfig): Promise<Account | undefined> {
  // Prefer the sign daemon when its socket is set. Falls back to the plaintext
  // WALLET_PRIVATE_KEY env for legacy setups; loadMcpConfig already rejects
  // both being set simultaneously.
  if (config.signSocketPath) {
    const client = await connectDaemon(config.signSocketPath);
    return daemonAccount(client);
  }
  if (config.walletPrivateKey) {
    return privateKeyToAccount(config.walletPrivateKey);
  }
  return undefined;
}

async function main() {
  const config = loadMcpConfig();
  if (config.walletPrivateKey) {
    process.stderr.write(
      "⚠  chain-lens-mcp: WALLET_PRIVATE_KEY is set. This is a TESTNET-ONLY pattern — the key " +
        "lives in plaintext in your MCP config and the server can sign arbitrary txs without " +
        "interactive confirmation. Use a throwaway Base Sepolia wallet only. Prefer " +
        "`@chain-lens/sign` (unlock daemon + per-tx approval + spending limits) via " +
        "CHAIN_LENS_SIGN_SOCKET.\n",
    );
  }
  const chain = chainFor(config.chainId);
  const escrowAddress = CONTRACT_ADDRESSES_V2[config.chainId];
  const usdcAddress = USDC_ADDRESSES[config.chainId];
  if (!escrowAddress || escrowAddress === "0x0000000000000000000000000000000000000000") {
    throw new Error(`No ApiMarketEscrowV2 deployed for chainId ${config.chainId}`);
  }
  if (!usdcAddress || usdcAddress === "0x0000000000000000000000000000000000000000") {
    throw new Error(`No USDC address configured for chainId ${config.chainId}`);
  }

  const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });

  const sharedReadDeps = {
    apiBaseUrl: config.apiBaseUrl,
    fetch: globalThis.fetch.bind(globalThis),
  };

  const requestDeps = await (async () => {
    const account = await resolveAccount(config);
    if (!account) return undefined;
    const walletClient = createWalletClient({ chain, transport: http(config.rpcUrl), account });
    return {
      apiBaseUrl: config.apiBaseUrl,
      fetch: globalThis.fetch.bind(globalThis),
      publicClient,
      walletClient,
      account,
      escrowAddress,
      escrowAbi: ApiMarketEscrowV2Abi as Abi,
      usdcAddress,
      usdcAbi: ERC20_APPROVE_ABI as Abi,
      keccak256: (s: string) => keccak256(stringToBytes(s)),
      taskTypeId: bytes32FromName,
      inputsHash: canonicalInputsHash,
      pollIntervalMs: config.pollIntervalMs,
      pollTimeoutMs: config.pollTimeoutMs,
    };
  })();

  const server = buildMcpServer({
    discover: sharedReadDeps,
    status: sharedReadDeps,
    request: requestDeps,
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("chain-lens-mcp fatal:", err);
  process.exit(1);
});
