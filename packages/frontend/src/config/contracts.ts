import { ApiMarketEscrowAbi, ChainLensMarketAbi } from "@chain-lens/shared";

export const ESCROW_ADDRESS =
  (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`) ||
  "0x0000000000000000000000000000000000000000";

export const USDC_ADDRESS =
  (process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`) ||
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

/** v3 ChainLensMarket — see docs/RFC-v3.md. */
export const CHAIN_LENS_MARKET_ADDRESS =
  (process.env.NEXT_PUBLIC_CHAIN_LENS_MARKET_ADDRESS as `0x${string}`) ||
  // Base Sepolia default — deployed 2026-04-22.
  "0x45bB56fDB0E6bb14d178E417b67Ed7B3323ffFf7";

/** v2 legacy. Kept for existing claim/discovery screens until v3 cutover is complete. */
export const escrowConfig = {
  address: ESCROW_ADDRESS,
  abi: ApiMarketEscrowAbi,
} as const;

/** v3 — register listings, claim payouts. */
export const chainLensMarketConfig = {
  address: CHAIN_LENS_MARKET_ADDRESS,
  abi: ChainLensMarketAbi,
} as const;
