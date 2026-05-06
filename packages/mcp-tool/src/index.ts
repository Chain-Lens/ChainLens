#!/usr/bin/env node
/**
 * Entry point for the ChainLens MCP tool.
 *
 * Reads env config, wires production dependencies (viem public/wallet clients,
 * live fetch, ERC20 approve via viem contract abi) and launches a stdio
 * transport so Claude Desktop can consume the three tools.
 */

import { randomBytes } from "node:crypto";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  stringToBytes,
  type Abi,
} from "viem";
import {
  ApiMarketEscrowV2Abi,
  ChainLensMarketAbi,
  CONTRACT_ADDRESSES_V2,
  CHAIN_LENS_MARKET_ADDRESSES,
  USDC_ADDRESSES,
  baseSepolia,
  baseMainnet,
} from "@chain-lens/shared";

import { loadMcpConfig, type McpConfig } from "./config.js";
import { buildMcpServer } from "./server.js";
import { resolveSigner } from "./signer.js";
import type { RequestDeps } from "./tools/request.js";
import type { CallDeps } from "./tools/call.js";
import type { GitHubDeps } from "./tools/seller/github.js";
import { createLocalSignerAdapter, type ContractWriteFn } from "./tools/seller/signing-adapter.js";
import {
  createSmartAccountSessionAdapter,
  buildSmartAccountWriteFn,
} from "./tools/seller/smart-account-adapter.js";
import type { RegisterPaidListingDeps } from "./tools/seller/register-paid-listing.js";

// USDC EIP-712 domain for TransferWithAuthorization signing. FiatTokenV2 on
// both Base Mainnet and Base Sepolia uses "USDC" / "2". Exposed via env vars
// so forks/clones with different domains (e.g. custom stablecoin sellers) can
// override without editing code.
const DEFAULT_USDC_EIP712_NAME = "USDC";
const DEFAULT_USDC_EIP712_VERSION = "2";

function chainFor(chainId: number) {
  if (chainId === baseSepolia.id) return baseSepolia;
  if (chainId === baseMainnet.id) return baseMainnet;
  throw new Error(
    `Unsupported CHAIN_LENS_CHAIN_ID ${chainId}. Expected ${baseSepolia.id} or ${baseMainnet.id}.`,
  );
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

function isZero(addr: string | undefined): boolean {
  return !addr || /^0x0+$/.test(addr);
}

async function main() {
  const config = loadMcpConfig();
  if (config.walletPrivateKey) {
    process.stderr.write(
      "⚠  chain-lens-mcp: CHAIN_LENS_WALLET_PRIVATE_KEY is set. This is a TESTNET-ONLY pattern — the key " +
        "lives in plaintext in your MCP config and the server can sign arbitrary txs without " +
        "interactive confirmation. Use a throwaway Base Sepolia wallet only. Prefer " +
        "`@chain-lens/sign` (unlock daemon + per-tx approval + spending limits) via " +
        "CHAIN_LENS_SIGN_SOCKET.\n",
    );
  }
  const chain = chainFor(config.chainId);
  const usdcAddress = USDC_ADDRESSES[config.chainId];
  if (isZero(usdcAddress)) {
    throw new Error(`No USDC address configured for chainId ${config.chainId}`);
  }
  const escrowAddress = CONTRACT_ADDRESSES_V2[config.chainId];
  const marketAddress = CHAIN_LENS_MARKET_ADDRESSES[config.chainId];

  const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });

  const sharedReadDeps = {
    apiBaseUrl: config.apiBaseUrl,
    fetch: globalThis.fetch.bind(globalThis),
  };

  // One Signer resolution, shared by both v2 request and v3 call tools.
  const signer = await resolveSigner(config);

  // v2 RequestDeps — only when we have a signer AND the v2 escrow is deployed
  // on the configured chain. Otherwise chain-lens.request is silently omitted
  // from the tool list.
  let requestDeps: RequestDeps | undefined;
  if (signer && !isZero(escrowAddress)) {
    const walletClient = createWalletClient({
      chain,
      transport: http(config.rpcUrl),
      account: signer,
    });
    requestDeps = {
      apiBaseUrl: config.apiBaseUrl,
      fetch: globalThis.fetch.bind(globalThis),
      publicClient,
      walletClient,
      account: signer,
      escrowAddress: escrowAddress as `0x${string}`,
      escrowAbi: ApiMarketEscrowV2Abi as Abi,
      usdcAddress: usdcAddress as `0x${string}`,
      usdcEip712Name: process.env.USDC_EIP712_NAME || DEFAULT_USDC_EIP712_NAME,
      usdcEip712Version: process.env.USDC_EIP712_VERSION || DEFAULT_USDC_EIP712_VERSION,
      keccak256: (s: string) => keccak256(stringToBytes(s)),
      taskTypeId: bytes32FromName,
      inputsHash: canonicalInputsHash,
      randomNonce: () => `0x${randomBytes(32).toString("hex")}` as `0x${string}`,
      pollIntervalMs: config.pollIntervalMs,
      pollTimeoutMs: config.pollTimeoutMs,
    };
  }

  // v3 CallDeps — only when we have a signer AND ChainLensMarket is deployed
  // on the configured chain.
  let callDeps: CallDeps | undefined;
  if (signer && !isZero(marketAddress)) {
    callDeps = {
      apiBaseUrl: config.apiBaseUrl,
      fetch: globalThis.fetch.bind(globalThis),
      signer,
      marketAddress: marketAddress as `0x${string}`,
      usdcAddress: usdcAddress as `0x${string}`,
      chainId: config.chainId,
      usdcEip712Name: process.env.USDC_EIP712_NAME || DEFAULT_USDC_EIP712_NAME,
      usdcEip712Version: process.env.USDC_EIP712_VERSION || DEFAULT_USDC_EIP712_VERSION,
    };
  }

  // Phase C register listing deps.
  //   local_signer (default): requires existing signer (walletPrivateKey or signSocket).
  //   smart_account (Phase C.2): uses session key + smart account address.
  //   waiaas (Phase C.3): adapter boundary wired; real SDK injection required to activate.
  let registerListingDeps: RegisterPaidListingDeps | undefined;
  if (!isZero(marketAddress)) {
    if (config.signingProvider === "smart_account") {
      // Phase C.2 — session key signs execute() on the smart account;
      // smart account becomes msg.sender for the inner ChainLensMarket.register call.
      const { privateKeyToAccount } = await import("viem/accounts");
      const sessionKeyAccount = privateKeyToAccount(config.sessionKeyPrivateKey!);
      const sessionKeyWalletClient = createWalletClient({
        chain,
        transport: http(config.rpcUrl),
        account: sessionKeyAccount,
      });
      // Raw write bound to the session key EOA — used only by buildSmartAccountWriteFn.
      const sessionKeyWrite = (args: Parameters<typeof sessionKeyWalletClient.writeContract>[0]) =>
        sessionKeyWalletClient.writeContract({ ...args, account: sessionKeyAccount, chain });
      registerListingDeps = {
        signingProvider: createSmartAccountSessionAdapter({
          // Routes inner calls through smartAccountAddress.execute(dest, 0, calldata).
          // msg.sender for ChainLensMarket.register will be smartAccountAddress.
          writeContract: buildSmartAccountWriteFn({
            sessionKeyWriteContract: sessionKeyWrite as ContractWriteFn,
            smartAccountAddress: config.smartAccountAddress!,
          }),
          waitForTransactionReceipt: (args) => publicClient.waitForTransactionReceipt(args),
          marketAddress: marketAddress as `0x${string}`,
          marketAbi: ChainLensMarketAbi as Abi,
          smartAccountAddress: config.smartAccountAddress!,
          payoutAllowlist: config.payoutAllowlist,
        }),
        chainLensBaseUrl: config.apiBaseUrl.replace(/\/api$/, ""),
        fetch: globalThis.fetch.bind(globalThis),
      };
    } else if (config.signingProvider === "waiaas") {
      // Phase C.3 — WAIAAS adapter boundary is implemented; real SDK wiring is the next step.
      // To activate: replace this block with a real WaiaasClient (Privy, Turnkey, Coinbase CDP,
      // etc.) and remove the warning. Until then, leave registerListingDeps undefined so
      // seller.register_paid_listing is hidden from ListTools rather than exposed in a broken state.
      process.stderr.write(
        "⚠  chain-lens-mcp: CHAIN_LENS_SIGNING_PROVIDER=waiaas is configured but no real WAIAAS\n" +
          "   SDK client is wired in index.ts. seller.register_paid_listing will not be available.\n" +
          "   Inject a WaiaasClient for your provider (Privy, Turnkey, Coinbase CDP, etc.) and\n" +
          "   call createWaiaasAdapter({ client, waitForTransactionReceipt, marketAddress, marketAbi }).\n",
      );
    } else if (signer) {
      // Phase C.1 — local signer (walletPrivateKey or signSocket).
      const registerWalletClient = createWalletClient({
        chain,
        transport: http(config.rpcUrl),
        account: signer,
      });
      registerListingDeps = {
        signingProvider: createLocalSignerAdapter({
          writeContract: (args) =>
            registerWalletClient.writeContract({
              ...args,
              account: signer,
              chain,
            } as Parameters<typeof registerWalletClient.writeContract>[0]),
          waitForTransactionReceipt: (args) => publicClient.waitForTransactionReceipt(args),
          marketAddress: marketAddress as `0x${string}`,
          marketAbi: ChainLensMarketAbi as Abi,
        }),
        chainLensBaseUrl: config.apiBaseUrl.replace(/\/api$/, ""),
        fetch: globalThis.fetch.bind(globalThis),
      };
    }
    // If neither branch matches, registerListingDeps stays undefined and the tool is hidden.
  }

  // Phase B GitHub deps — only when all three env vars are set.
  let githubDeps: GitHubDeps | undefined;
  if (config.githubToken && config.githubRepoOwner && config.githubRepoName) {
    githubDeps = {
      token: config.githubToken,
      repoOwner: config.githubRepoOwner,
      repoName: config.githubRepoName,
      fetch: globalThis.fetch.bind(globalThis),
    };
  }

  const server = buildMcpServer({
    discover: sharedReadDeps,
    status: sharedReadDeps,
    inspect: sharedReadDeps,
    seller: sharedReadDeps,
    sellerDraft: sharedReadDeps,
    github: githubDeps,
    registerListing: registerListingDeps,
    request: requestDeps,
    call: callDeps,
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("chain-lens-mcp fatal:", err);
  process.exit(1);
});
