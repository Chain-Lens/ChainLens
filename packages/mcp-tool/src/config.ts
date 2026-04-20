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

export function loadMcpConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  const apiBaseUrl = (env.CHAIN_LENS_API_URL ?? "http://localhost:3001/api").replace(/\/+$/, "");
  const chainId = Number(env.CHAIN_ID ?? "84532");
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(`Invalid CHAIN_ID: ${env.CHAIN_ID}`);
  }
  const rpcUrl = env.RPC_URL ?? "https://sepolia.base.org";
  const walletPrivateKey = env.WALLET_PRIVATE_KEY as `0x${string}` | undefined;
  if (walletPrivateKey && !/^0x[0-9a-fA-F]{64}$/.test(walletPrivateKey)) {
    throw new Error("WALLET_PRIVATE_KEY must be a 0x-prefixed 32-byte hex string");
  }
  const signSocketPath = env.CHAIN_LENS_SIGN_SOCKET || undefined;
  if (walletPrivateKey && signSocketPath) {
    throw new Error(
      "Both WALLET_PRIVATE_KEY and CHAIN_LENS_SIGN_SOCKET are set. Use one.\n" +
        "If you've migrated to the sign daemon (recommended), remove WALLET_PRIVATE_KEY from your env.\n" +
        "If you still need the legacy path, unset CHAIN_LENS_SIGN_SOCKET.",
    );
  }
  const pollIntervalMs = Number(env.CHAIN_LENS_POLL_INTERVAL_MS ?? "2000");
  const pollTimeoutMs = Number(env.CHAIN_LENS_POLL_TIMEOUT_MS ?? "120000");
  return { apiBaseUrl, chainId, rpcUrl, walletPrivateKey, signSocketPath, pollIntervalMs, pollTimeoutMs };
}
