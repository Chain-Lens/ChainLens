import { randomBytes } from "node:crypto";
import type { WalletAdapter, TypedData } from "./types.js";

/** Chain-specific USDC contract addresses. */
export const USDC_ADDRESSES: Record<number, `0x${string}`> = {
  84532: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",  // Base Mainnet
};

/** ChainLensMarket addresses per chain. */
export const CHAIN_LENS_MARKET_ADDRESSES: Record<number, `0x${string}`> = {
  84532: "0x45bB56fDB0E6bb14d178E417b67Ed7B3323ffFf7", // Base Sepolia
  8453: "0x0000000000000000000000000000000000000000",  // placeholder — not deployed yet
};

export const RECEIVE_WITH_AUTHORIZATION_TYPES = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export interface Eip3009Auth {
  from: `0x${string}`;
  to: `0x${string}`;
  amount: string;
  validAfter: string;
  validBefore: string;
  nonce: `0x${string}`;
  v: number;
  r: `0x${string}`;
  s: `0x${string}`;
}

export async function signReceiveWithAuthorization(opts: {
  wallet: WalletAdapter;
  chainId: number;
  amount: bigint;
  to: `0x${string}`;
  signal?: AbortSignal;
}): Promise<Eip3009Auth> {
  const { wallet, chainId, amount, to } = opts;

  const usdcAddress = USDC_ADDRESSES[chainId];
  if (!usdcAddress) throw new Error(`No USDC address for chainId=${chainId}`);

  const from = await wallet.address();
  const now = Math.floor(Date.now() / 1000);
  const validAfter = BigInt(now - 60);
  const validBefore = BigInt(now + 300);
  const nonce = ("0x" + randomBytes(32).toString("hex")) as `0x${string}`;

  const typedData: TypedData = {
    domain: {
      name: "USD Coin",
      version: "2",
      chainId,
      verifyingContract: usdcAddress,
    },
    types: RECEIVE_WITH_AUTHORIZATION_TYPES as unknown as Record<string, Array<{ name: string; type: string }>>,
    primaryType: "ReceiveWithAuthorization",
    message: {
      from,
      to,
      value: amount,
      validAfter,
      validBefore,
      nonce,
    },
  };

  const sig = await wallet.signTypedData(typedData);

  return {
    from,
    to,
    amount: amount.toString(),
    validAfter: validAfter.toString(),
    validBefore: validBefore.toString(),
    nonce,
    v: sig.v,
    r: sig.r,
    s: sig.s,
  };
}

/** Convert USDC display units (e.g. 0.05) to atomic units (50000). */
export function usdcToAtomic(usdc: number): bigint {
  return BigInt(Math.round(usdc * 1_000_000));
}

/** Convert atomic USDC units to display units. */
export function atomicToUsdc(atomic: bigint | string): number {
  return Number(BigInt(atomic)) / 1_000_000;
}
