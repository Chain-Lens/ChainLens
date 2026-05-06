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
  /**
   * GitHub personal-access token (or fine-grained token) for Phase B seller tools.
   * Required scopes: contents:write, pull_requests:write on the target repo.
   * Optional: Phase B tools are omitted from ListTools when this is unset.
   */
  githubToken?: string;
  /** Owner (user or org) of the awesome-onchain-data-providers repo. */
  githubRepoOwner?: string;
  /** Repository name, usually "awesome-onchain-data-providers". */
  githubRepoName?: string;
  /**
   * Which signing provider to use for seller.register_paid_listing.
   * "local_signer" (default) uses CHAIN_LENS_WALLET_PRIVATE_KEY or CHAIN_LENS_SIGN_SOCKET.
   * "smart_account" uses a session-key-backed smart account (Phase C.2).
   * "waiaas" delegates signing to an external wallet-as-a-service provider (Phase C.3).
   */
  signingProvider: "local_signer" | "smart_account" | "waiaas";
  /**
   * Smart account address (Phase C.2). Required when signingProvider=smart_account.
   * This is the on-chain account that submits the registration transaction.
   */
  smartAccountAddress?: `0x${string}`;
  /**
   * Session key private key (Phase C.2). Required when signingProvider=smart_account.
   * This key must be authorised to call ChainLensMarket.register on the smart account.
   * Keep out of version control — treat with the same care as WALLET_PRIVATE_KEY.
   */
  sessionKeyPrivateKey?: `0x${string}`;
  /**
   * Optional comma-separated list of permitted payout addresses for the smart account
   * adapter. When non-empty, register_paid_listing rejects any payout address not in the
   * list. Addresses are compared case-insensitively.
   */
  payoutAllowlist?: ReadonlyArray<`0x${string}`>;
  /**
   * WAIAAS provider API base URL (Phase C.3). Required when signingProvider=waiaas.
   * Example: "https://api.privy.io/v1" or your WAIAAS provider's endpoint.
   */
  waiaasApiUrl?: string;
  /**
   * WAIAAS provider API key (Phase C.3). Required when signingProvider=waiaas.
   * Keep out of version control.
   */
  waiaasApiKey?: string;
  /**
   * Wallet/account ID within the WAIAAS provider (Phase C.3). Required when signingProvider=waiaas.
   * This identifies which managed wallet submits the registration transaction.
   */
  waiaasWalletId?: string;
}

const warnedDeprecatedEnvNames = new Set<string>();

function warnDeprecatedEnvName(oldName: string, newName: string) {
  if (warnedDeprecatedEnvNames.has(oldName)) return;
  warnedDeprecatedEnvNames.add(oldName);
  process.stderr.write(
    `chain-lens-mcp: ${oldName} is deprecated; use ${newName} instead. Support for ${oldName} will be removed in a future release.\n`,
  );
}

function readEnv(
  env: NodeJS.ProcessEnv,
  primaryName: string,
  deprecatedName?: string,
): string | undefined {
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
  const githubToken = env.GITHUB_TOKEN || undefined;
  const githubRepoOwner = env.GITHUB_REPO_OWNER || undefined;
  const githubRepoName = env.GITHUB_REPO_NAME || undefined;

  if (githubToken && (!githubRepoOwner || !githubRepoName)) {
    throw new Error(
      "GITHUB_TOKEN is set but GITHUB_REPO_OWNER or GITHUB_REPO_NAME is missing. " +
        "Set all three to enable Phase B seller tools (open_directory_pr, backfill_listing_url).",
    );
  }

  // Signing provider config (Phase C.1/C.2/C.3)
  const signingProviderRaw = env.CHAIN_LENS_SIGNING_PROVIDER ?? "local_signer";
  if (
    signingProviderRaw !== "local_signer" &&
    signingProviderRaw !== "smart_account" &&
    signingProviderRaw !== "waiaas"
  ) {
    throw new Error(
      `Invalid CHAIN_LENS_SIGNING_PROVIDER: "${signingProviderRaw}". Expected "local_signer", "smart_account", or "waiaas".`,
    );
  }
  const signingProvider = signingProviderRaw as "local_signer" | "smart_account" | "waiaas";

  let smartAccountAddress: `0x${string}` | undefined;
  let sessionKeyPrivateKey: `0x${string}` | undefined;

  if (signingProvider === "smart_account") {
    const rawAddr = env.CHAIN_LENS_SMART_ACCOUNT_ADDRESS;
    if (!rawAddr || !/^0x[0-9a-fA-F]{40}$/.test(rawAddr)) {
      throw new Error(
        "CHAIN_LENS_SMART_ACCOUNT_ADDRESS is required when CHAIN_LENS_SIGNING_PROVIDER=smart_account " +
          "(expected 0x + 40 hex chars).",
      );
    }
    smartAccountAddress = rawAddr as `0x${string}`;

    const rawSk = env.CHAIN_LENS_SESSION_KEY_PRIVATE_KEY;
    if (!rawSk || !/^0x[0-9a-fA-F]{64}$/.test(rawSk)) {
      throw new Error(
        "CHAIN_LENS_SESSION_KEY_PRIVATE_KEY is required when CHAIN_LENS_SIGNING_PROVIDER=smart_account " +
          "(expected 0x + 64 hex chars).",
      );
    }
    sessionKeyPrivateKey = rawSk as `0x${string}`;
  }

  // WAIAAS config (Phase C.3)
  let waiaasApiUrl: string | undefined;
  let waiaasApiKey: string | undefined;
  let waiaasWalletId: string | undefined;

  if (signingProvider === "waiaas") {
    waiaasApiUrl = env.CHAIN_LENS_WAIAAS_API_URL;
    if (!waiaasApiUrl) {
      throw new Error(
        "CHAIN_LENS_WAIAAS_API_URL is required when CHAIN_LENS_SIGNING_PROVIDER=waiaas.",
      );
    }
    waiaasApiKey = env.CHAIN_LENS_WAIAAS_API_KEY;
    if (!waiaasApiKey) {
      throw new Error(
        "CHAIN_LENS_WAIAAS_API_KEY is required when CHAIN_LENS_SIGNING_PROVIDER=waiaas.",
      );
    }
    waiaasWalletId = env.CHAIN_LENS_WAIAAS_WALLET_ID;
    if (!waiaasWalletId) {
      throw new Error(
        "CHAIN_LENS_WAIAAS_WALLET_ID is required when CHAIN_LENS_SIGNING_PROVIDER=waiaas.",
      );
    }
  }

  // Optional payout allowlist — comma-separated EVM addresses.
  const rawAllowlist = env.CHAIN_LENS_PAYOUT_ALLOWLIST;
  let payoutAllowlist: ReadonlyArray<`0x${string}`> | undefined;
  if (rawAllowlist) {
    const entries = rawAllowlist.split(",").map((s) => s.trim()).filter(Boolean);
    for (const entry of entries) {
      if (!/^0x[0-9a-fA-F]{40}$/.test(entry)) {
        throw new Error(
          `CHAIN_LENS_PAYOUT_ALLOWLIST contains invalid EVM address: "${entry}".`,
        );
      }
    }
    payoutAllowlist = entries as `0x${string}`[];
  }

  return {
    apiBaseUrl,
    chainId,
    rpcUrl,
    walletPrivateKey,
    signSocketPath,
    pollIntervalMs,
    pollTimeoutMs,
    githubToken,
    githubRepoOwner,
    githubRepoName,
    signingProvider,
    smartAccountAddress,
    sessionKeyPrivateKey,
    payoutAllowlist,
    waiaasApiUrl,
    waiaasApiKey,
    waiaasWalletId,
  };
}
