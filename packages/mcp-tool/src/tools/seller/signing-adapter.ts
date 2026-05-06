import { keccak256, toHex } from "viem";
import type { Abi } from "viem";

export type SigningProviderKind = "local_signer" | "smart_account" | "waiaas";

export interface RegisterTxParams {
  payoutAddress: `0x${string}`;
  metadataURI: string;
}

export interface RegisterTxResult {
  txHash: `0x${string}`;
  listingOnChainId: number;
}

/**
 * Signing abstraction for seller.register_paid_listing.
 *
 * local_signer: Phase C MVP — existing WALLET_PRIVATE_KEY / SIGN_SOCKET path.
 * smart_account: Phase C.2 — session key + smart account execute() routing.
 * waiaas: Phase C.3 — provider-neutral WAIAAS boundary; real SDK wiring in index.ts.
 */
export interface SigningProvider {
  kind: SigningProviderKind;
  signAndSubmit(params: RegisterTxParams): Promise<RegisterTxResult>;
}

// Structural interfaces for walletClient/publicClient so tests can mock without viem boilerplate.
// Exported so smart-account-adapter can reuse the same types without coupling to viem.
export type ContractWriteFn = (args: {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
}) => Promise<`0x${string}`>;

export type TransactionLog = {
  address: `0x${string}`;
  topics: ReadonlyArray<`0x${string}`>;
  data: `0x${string}`;
};

export type WaitForReceiptFn = (args: { hash: `0x${string}` }) => Promise<{
  status: "success" | "reverted";
  logs: ReadonlyArray<TransactionLog>;
}>;

export interface LocalSignerAdapterDeps {
  writeContract: ContractWriteFn;
  waitForTransactionReceipt: WaitForReceiptFn;
  marketAddress: `0x${string}`;
  marketAbi: Abi;
}

/** Shared type for adapter deps that interact with the market contract. */
export interface MarketAdapterDeps {
  writeContract: ContractWriteFn;
  waitForTransactionReceipt: WaitForReceiptFn;
  marketAddress: `0x${string}`;
  marketAbi: Abi;
}

// ListingRegistered(uint256 indexed listingId, address indexed owner, address indexed payout, string metadataURI, uint256 feePaid)
const LISTING_REGISTERED_TOPIC = keccak256(
  toHex("ListingRegistered(uint256,address,address,string,uint256)"),
);

export function createLocalSignerAdapter(deps: LocalSignerAdapterDeps): SigningProvider {
  return {
    kind: "local_signer",
    async signAndSubmit({ payoutAddress, metadataURI }) {
      const hash = await deps.writeContract({
        address: deps.marketAddress,
        abi: deps.marketAbi,
        functionName: "register",
        args: [payoutAddress, metadataURI],
      });

      const receipt = await deps.waitForTransactionReceipt({ hash });

      if (receipt.status === "reverted") {
        throw new Error(
          `register transaction reverted (tx: ${hash}). ` +
            "Check payout address and metadata URI. The contract may have rejected the call.",
        );
      }

      const listingOnChainId = extractListingId(receipt.logs, deps.marketAddress);
      return { txHash: hash, listingOnChainId };
    },
  };
}

export function extractListingId(
  logs: ReadonlyArray<TransactionLog>,
  marketAddress: `0x${string}`,
): number {
  for (const log of logs) {
    if (log.address.toLowerCase() !== marketAddress.toLowerCase()) continue;
    if (log.topics[0] !== LISTING_REGISTERED_TOPIC) continue;
    const listingIdTopic = log.topics[1];
    if (!listingIdTopic) continue;
    return Number(BigInt(listingIdTopic));
  }
  throw new Error(
    "ListingRegistered event not found in transaction receipt. " +
      "The registration may have succeeded on-chain but the listing ID could not be extracted.",
  );
}
