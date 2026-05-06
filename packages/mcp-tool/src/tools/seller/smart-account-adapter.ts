// Phase C.2 smart account session key adapter.
//
// Execution model:
//   The adapter's writeContract dep must be built with buildSmartAccountWriteFn (below).
//   That function encodes the desired inner call and routes it through the smart account's
//   execute(address,uint256,bytes) method. The session key signs the outer execute tx;
//   the smart account becomes msg.sender for the inner ChainLensMarket.register call.
//
// Policy model:
//   - Only submits ChainLensMarket.register(payout, metadataURI) — hardcoded.
//   - Validates payout address format before submission.
//   - Validates metadata URI scheme (https/ipfs/data:application/json).
//   - Optional payout allowlist: if configured, rejects any address not in the list.
//   - Fails closed: missing or invalid config throws at construction time.
//
// The adapter does NOT submit arbitrary calls. It cannot be configured to call
// anything other than register on the configured marketAddress.

import { encodeFunctionData, type Abi } from "viem";
import type { SigningProvider } from "./signing-adapter.js";
import {
  extractListingId,
  type ContractWriteFn,
  type WaitForReceiptFn,
} from "./signing-adapter.js";

/**
 * ABI for the standard ERC-4337 / Solady / Kernel smart account execute method.
 * Most ERC-4337 compatible smart accounts implement this interface.
 * The smart account must grant the session key permission to call this function.
 */
export const SMART_ACCOUNT_EXECUTE_ABI = [
  {
    type: "function",
    name: "execute",
    stateMutability: "nonpayable",
    inputs: [
      { name: "dest", type: "address" },
      { name: "value", type: "uint256" },
      { name: "func", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

/**
 * Build a ContractWriteFn that routes calls through a smart account's execute method.
 *
 * When the adapter calls writeContract({ address: marketAddress, functionName: "register", ... }),
 * this function:
 *   1. Encodes the inner call (register(payout, metadataURI) at marketAddress).
 *   2. Submits smartAccountAddress.execute(marketAddress, 0, encodedCalldata) signed by
 *      the session key.
 *
 * Result: msg.sender for the inner call is smartAccountAddress, not the session key EOA.
 *
 * @param sessionKeyWriteContract - walletClient.writeContract bound to the session key account.
 * @param smartAccountAddress     - The smart account that will be msg.sender.
 */
export function buildSmartAccountWriteFn(opts: {
  sessionKeyWriteContract: ContractWriteFn;
  smartAccountAddress: `0x${string}`;
}): ContractWriteFn {
  return async (args) => {
    const innerCalldata = encodeFunctionData({
      abi: args.abi,
      functionName: args.functionName,
      args: [...args.args],
    });
    return opts.sessionKeyWriteContract({
      address: opts.smartAccountAddress,
      abi: SMART_ACCOUNT_EXECUTE_ABI as Abi,
      functionName: "execute",
      args: [args.address, 0n, innerCalldata],
    });
  };
}

const ALLOWED_URI_SCHEMES = ["https://", "ipfs://", "data:application/json"] as const;
const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export interface SmartAccountAdapterDeps {
  writeContract: ContractWriteFn;
  waitForTransactionReceipt: WaitForReceiptFn;
  /** ChainLensMarket contract address — only contract the adapter may call. */
  marketAddress: `0x${string}`;
  marketAbi: Abi;
  /** Smart account address acting as the transaction sender. Validated at construction. */
  smartAccountAddress: `0x${string}`;
  /**
   * Optional allowlist of permitted payout addresses (lowercase-compared).
   * When non-empty, any payoutAddress not in the list is rejected before signing.
   */
  payoutAllowlist?: ReadonlyArray<`0x${string}`>;
}

export function createSmartAccountSessionAdapter(deps: SmartAccountAdapterDeps): SigningProvider {
  // Fail closed at construction — bad config must not reach signAndSubmit.
  if (!EVM_ADDRESS_RE.test(deps.smartAccountAddress)) {
    throw new Error(
      `smart_account: smartAccountAddress "${deps.smartAccountAddress}" is not a valid EVM address.`,
    );
  }
  if (!EVM_ADDRESS_RE.test(deps.marketAddress)) {
    throw new Error(
      `smart_account: marketAddress "${deps.marketAddress}" is not a valid EVM address.`,
    );
  }

  const allowlistLower: string[] =
    deps.payoutAllowlist?.map((a) => a.toLowerCase()) ?? [];

  return {
    kind: "smart_account",

    async signAndSubmit({ payoutAddress, metadataURI }) {
      // Policy: payout address format
      if (!EVM_ADDRESS_RE.test(payoutAddress)) {
        throw new Error(
          `smart_account policy: payoutAddress "${payoutAddress}" is not a valid EVM address.`,
        );
      }

      // Policy: payout allowlist
      if (allowlistLower.length > 0 && !allowlistLower.includes(payoutAddress.toLowerCase())) {
        throw new Error(
          `smart_account policy: payoutAddress "${payoutAddress}" is not in the configured payout allowlist.`,
        );
      }

      // Policy: metadata URI scheme
      if (!ALLOWED_URI_SCHEMES.some((s) => metadataURI.startsWith(s))) {
        throw new Error(
          `smart_account policy: metadataURI scheme not allowed. ` +
            `Got "${metadataURI.slice(0, 60)}". ` +
            `Must start with https://, ipfs://, or data:application/json.`,
        );
      }

      // Submit — hardcoded to register only, on the configured marketAddress.
      const hash = await deps.writeContract({
        address: deps.marketAddress,
        abi: deps.marketAbi,
        functionName: "register",
        args: [payoutAddress, metadataURI],
      });

      const receipt = await deps.waitForTransactionReceipt({ hash });

      if (receipt.status === "reverted") {
        throw new Error(
          `smart_account register transaction reverted (tx: ${hash}). ` +
            "Check payout address and metadata URI. The contract may have rejected the call.",
        );
      }

      const listingOnChainId = extractListingId(receipt.logs, deps.marketAddress);
      return { txHash: hash, listingOnChainId };
    },
  };
}
