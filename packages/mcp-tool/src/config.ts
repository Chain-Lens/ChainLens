/**
 * Runtime configuration for the ChainLens MCP tool.
 *
 * Read from process.env exactly once so tests can supply their own `McpConfig`
 * directly to handlers without touching the environment.
 */
export interface McpConfig {
  /** Base URL of the ChainLens backend, no trailing slash. e.g. `http://localhost:3001/api` */
  apiBaseUrl: string;
  /** Chain id the MCP tool talks to (default Base Sepolia). */
  chainId: number;
  /** RPC URL used for readContract calls + walletClient when private key is set. */
  rpcUrl: string;
  /**
   * Private key for the buyer wallet used by `chain-lens.request`.
   * Mutually exclusive with `signSocketPath`. Optional: discover + status work
   * read-only, but request tool needs one of these two signer paths.
   */
  walletPrivateKey?: `0x${string}`;
  /**
   * Unix socket path of a running `chain-lens-sign` daemon. When set, the MCP
   * tool signs via the daemon (with approval prompts + limits) instead of
   * holding a private key in env. Mutually exclusive with `walletPrivateKey`.
   */
  signSocketPath?: string;
  /** Polling interval in ms for `chain-lens.request` evidence polling. */
  pollIntervalMs: number;
  /** How long `chain-lens.request` waits for a COMPLETED/REFUNDED state before giving up. */
  pollTimeoutMs: number;
}

const warnedDeprecatedEnvNames = new Set<string>();

function warnDeprecatedEnvName(oldName: string, newName: string) {
  if (warnedDeprecatedEnvNames.has(oldName)) return;
  warnedDeprecatedEnvNames.add(oldName);
  process.stderr.write(
    `chain-lens-mcp: ${oldName} is deprecated; use ${newName} instead. Support for ${oldName} will be removed in a future release.\n`,
  );
}

function readEnv(env: NodeJS.ProcessEnv, primaryName: string, deprecatedName?: string): string | undefined {
  const primaryValue = env[primaryName];
  if (primaryValue) return primaryValue;
  if (deprecatedName) {
    const deprecatedValue = env[deprecatedName];
    if (deprecatedValue) {
      warnDeprecatedEnvName(deprecatedName, primaryName);
      return deprecatedValue;
    }
  }
  return undefined;
}

function requireEnv(env: NodeJS.ProcessEnv, name: string, deprecatedName?: string): string {
  const value = readEnv(env, name, deprecatedName);
  if (!value) {
    throw new Error(
      `Missing required ${name}${deprecatedName ? ` (legacy alias: ${deprecatedName})` : ""}. Set it in your MCP client config before starting chain-lens-mcp.`,
    );
  }
  return value;
}

export function loadMcpConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  const apiBaseUrl = requireEnv(env, "CHAIN_LENS_API_URL").replace(/\/+$/, "");
  const chainIdRaw = requireEnv(env, "CHAIN_LENS_CHAIN_ID", "CHAIN_ID");
  const chainId = Number(chainIdRaw);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(`Invalid CHAIN_LENS_CHAIN_ID: ${chainIdRaw}`);
  }
  const rpcUrl = requireEnv(env, "CHAIN_LENS_RPC_URL", "RPC_URL");
  const walletPrivateKey = readEnv(env, "CHAIN_LENS_WALLET_PRIVATE_KEY", "WALLET_PRIVATE_KEY") as
    | `0x${string}`
    | undefined;
  if (walletPrivateKey && !/^0x[0-9a-fA-F]{64}$/.test(walletPrivateKey)) {
    throw new Error("CHAIN_LENS_WALLET_PRIVATE_KEY must be a 0x-prefixed 32-byte hex string");
  }
  const signSocketPath = env.CHAIN_LENS_SIGN_SOCKET || undefined;
  if (walletPrivateKey && signSocketPath) {
    throw new Error(
      "Both CHAIN_LENS_WALLET_PRIVATE_KEY and CHAIN_LENS_SIGN_SOCKET are set. Use one.\n" +
        "If you've migrated to the sign daemon (recommended), remove CHAIN_LENS_WALLET_PRIVATE_KEY from your env.\n" +
        "If you still need the legacy path, unset CHAIN_LENS_SIGN_SOCKET.",
    );
  }
  const pollIntervalMs = Number(env.CHAIN_LENS_POLL_INTERVAL_MS ?? "2000");
  const pollTimeoutMs = Number(env.CHAIN_LENS_POLL_TIMEOUT_MS ?? "120000");
  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs <= 0) {
    throw new Error(`Invalid CHAIN_LENS_POLL_INTERVAL_MS: ${env.CHAIN_LENS_POLL_INTERVAL_MS}`);
  }
  if (!Number.isInteger(pollTimeoutMs) || pollTimeoutMs <= 0) {
    throw new Error(`Invalid CHAIN_LENS_POLL_TIMEOUT_MS: ${env.CHAIN_LENS_POLL_TIMEOUT_MS}`);
  }
  return { apiBaseUrl, chainId, rpcUrl, walletPrivateKey, signSocketPath, pollIntervalMs, pollTimeoutMs };
}
