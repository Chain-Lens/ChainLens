import { ApiMarketEscrowAbi } from "@chainlens/shared";

export const ESCROW_ADDRESS =
  (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`) ||
  "0x0000000000000000000000000000000000000000";

export const USDC_ADDRESS =
  (process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`) ||
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

export const escrowConfig = {
  address: ESCROW_ADDRESS,
  abi: ApiMarketEscrowAbi,
} as const;
