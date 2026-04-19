import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, baseMainnet } from "@chain-lens/shared";
import { env } from "./env.js";

const chain = env.RPC_URL.includes("sepolia") ? baseSepolia : baseMainnet;

export const publicClient = createPublicClient({
  chain,
  transport: http(env.RPC_URL),
});

export const gatewayAccount = privateKeyToAccount(
  env.PRIVATE_KEY as `0x${string}`
);

export const walletClient = createWalletClient({
  account: gatewayAccount,
  chain,
  transport: http(env.RPC_URL),
});
