/**
 * Signer abstraction for the ChainLens MCP tool.
 *
 * A `Signer` is anything that carries an address and can produce EIP-712
 * signatures — i.e. any viem `LocalAccount`. All built-in adapters conform:
 *
 *   - `WALLET_PRIVATE_KEY` → `privateKeyToAccount(...)` (legacy, plaintext key)
 *   - `CHAIN_LENS_SIGN_SOCKET` → `daemonAccount(...)` (local signer daemon
 *     with unlock + spending limits + per-tx approval)
 *   - WaaS providers (Privy, Dynamic, Turnkey, Coinbase Smart Wallet, …):
 *     wrap the provider's signing primitive in a LocalAccount and pass it here.
 *
 * Nothing below this interface is provider-specific. Handlers call
 * `signer.signTypedData(...)` regardless of origin.
 */

import type { LocalAccount } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { connectDaemon, daemonAccount } from "@chain-lens/sign";
import type { McpConfig } from "./config.js";

export type Signer = LocalAccount;

/**
 * Build a Signer from MCP config. Prefers the sign daemon over the plaintext
 * private key path (mutual exclusion already enforced in `loadMcpConfig`).
 * Returns undefined when neither is configured — handlers that need signing
 * will then surface a "not configured" error to the caller.
 */
export async function resolveSigner(
  config: McpConfig,
): Promise<Signer | undefined> {
  if (config.signSocketPath) {
    let client;
    try {
      client = await connectDaemon(config.signSocketPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `CHAIN_LENS_SIGN_SOCKET is set, but no signing daemon is reachable at ${config.signSocketPath}.\n` +
          `Start the approval console first:\n\n` +
          `  chain-lens-sign status\n` +
          `  chain-lens-sign unlock --ttl 2h\n\n` +
          `Keep the unlock terminal visible while using paid MCP tools. Original error: ${message}`,
      );
    }
    // daemonAccount returns `Promise<Account>` — a superset of LocalAccount
    // (the daemon exposes signTypedData but not always the extra LocalAccount
    // fields). Cast to our Signer shape, which is the subset we actually use.
    const account = await daemonAccount(client);
    return account as unknown as Signer;
  }
  if (config.walletPrivateKey) {
    return privateKeyToAccount(config.walletPrivateKey);
  }
  return undefined;
}
