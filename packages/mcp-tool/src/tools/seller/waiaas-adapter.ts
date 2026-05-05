// Phase C.3 wallet-as-a-service (WAIAAS) signing adapter.
//
// Architecture:
//   This file defines a provider-neutral boundary (WaiaasClient) between the MCP
//   tool and any external WAIAAS SDK. Real provider SDK wiring (Coinbase CDP,
//   Turnkey, Privy, Dynamic, Biconomy, etc.) is a provider-specific follow-up step.
//
// Execution model:
//   The adapter calls WaiaasClient.submitContractCall with hardcoded target and
//   functionName. The WAIAAS provider manages key storage and transaction submission.
//   No private key material is held by the MCP server.
//
// Policy model — same guards as C.2 smart account adapter:
//   - Validates marketAddress at construction.
//   - Validates payoutAddress and metadata URI scheme before every submission.
//   - Optional payout allowlist (case-insensitive).
//   - Hardcodes target=marketAddress and functionName="register".
//   - Does not expose arbitrary call paths.

import type { Abi } from "viem";
import type { SigningProvider } from "./signing-adapter.js";
import {
  extractListingId,
  type WaitForReceiptFn,
} from "./signing-adapter.js";

const ALLOWED_URI_SCHEMES = ["https://", "ipfs://", "data:application/json"] as const;
const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Provider-neutral WAIAAS client interface.
 *
 * Real provider implementations should satisfy this contract. The MCP tool
 * only calls `submitContractCall`; authentication, key management, and nonce
 * handling are the provider's responsibility.
 */
export interface WaiaasClient {
  /**
   * Submit a contract write call through the WAIAAS provider.
   * Returns the transaction hash once the provider has broadcast it.
   *
   * The implementation must restrict calls to allowed contracts and functions
   * at the provider's policy layer. The adapter also enforces local guards
   * before calling this method.
   */
  submitContractCall(args: {
    target: `0x${string}`;
    abi: Abi;
    functionName: "register";
    args: readonly unknown[];
  }): Promise<{ txHash: `0x${string}` }>;
}

export interface WaiaasAdapterDeps {
  /** Provider-neutral WAIAAS client. Inject a real SDK wrapper or a mock. */
  client: WaiaasClient;
  waitForTransactionReceipt: WaitForReceiptFn;
  /** ChainLensMarket contract address — only target the adapter may submit to. */
  marketAddress: `0x${string}`;
  marketAbi: Abi;
  /**
   * Optional allowlist of permitted payout addresses (lowercase-compared).
   * When non-empty, any payoutAddress not in the list is rejected before submission.
   */
  payoutAllowlist?: ReadonlyArray<`0x${string}`>;
}

export function createWaiaasAdapter(deps: WaiaasAdapterDeps): SigningProvider {
  // Fail closed at construction.
  if (!EVM_ADDRESS_RE.test(deps.marketAddress)) {
    throw new Error(
      `waiaas: marketAddress "${deps.marketAddress}" is not a valid EVM address.`,
    );
  }

  const allowlistLower: string[] = deps.payoutAllowlist?.map((a) => a.toLowerCase()) ?? [];

  return {
    kind: "waiaas",

    async signAndSubmit({ payoutAddress, metadataURI }) {
      // Policy: payout address format
      if (!EVM_ADDRESS_RE.test(payoutAddress)) {
        throw new Error(
          `waiaas policy: payoutAddress "${payoutAddress}" is not a valid EVM address.`,
        );
      }

      // Policy: payout allowlist
      if (allowlistLower.length > 0 && !allowlistLower.includes(payoutAddress.toLowerCase())) {
        throw new Error(
          `waiaas policy: payoutAddress "${payoutAddress}" is not in the configured payout allowlist.`,
        );
      }

      // Policy: metadata URI scheme
      if (!ALLOWED_URI_SCHEMES.some((s) => metadataURI.startsWith(s))) {
        throw new Error(
          `waiaas policy: metadataURI scheme not allowed. ` +
            `Got "${metadataURI.slice(0, 60)}". ` +
            `Must start with https://, ipfs://, or data:application/json.`,
        );
      }

      // Submit — hardcoded to register only on the configured marketAddress.
      const { txHash } = await deps.client.submitContractCall({
        target: deps.marketAddress,
        abi: deps.marketAbi,
        functionName: "register",
        args: [payoutAddress, metadataURI],
      });

      const receipt = await deps.waitForTransactionReceipt({ hash: txHash });

      if (receipt.status === "reverted") {
        throw new Error(
          `waiaas register transaction reverted (tx: ${txHash}). ` +
            "Check payout address and metadata URI. The contract may have rejected the call.",
        );
      }

      const listingOnChainId = extractListingId(receipt.logs, deps.marketAddress);
      return { txHash, listingOnChainId };
    },
  };
}
