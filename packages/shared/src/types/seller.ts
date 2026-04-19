export interface Seller {
  address: string;
  name: string;
  website?: string;
  createdAt: string;
}

/**
 * Mirror of `SellerRegistryTypes.Seller` — returned by
 * `SellerRegistry.getSellerInfo(seller)`.
 */
export interface OnChainSeller {
  sellerAddress: `0x${string}`;
  name: string;
  capabilities: `0x${string}`[];
  metadataURI: string;
  registeredAt: bigint;
  active: boolean;
}

/** Reputation returned in basis points (0..10000). Neutral when no jobs recorded. */
export const REPUTATION_NEUTRAL_BPS = 5_000n;
export const REPUTATION_MAX_BPS = 10_000n;
