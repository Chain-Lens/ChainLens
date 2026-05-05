import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";
import { ViemWallet } from "@chain-lens/sdk";

const ENV_KEY_WARNING = `
WARNING: Private key in env is fine for local development.
Never use this mode in production. See README for safer wallet options.
`.trim();

export function resolveWallet(chainId: 84532 | 8453): ViemWallet {
  const raw = process.env["WALLET_PRIVATE_KEY"];
  if (!raw) {
    throw new Error(
      "WALLET_PRIVATE_KEY env var is not set. Run `chainlens init` for setup instructions.",
    );
  }
  process.stderr.write(ENV_KEY_WARNING + "\n");

  const privateKey = (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
  const account = privateKeyToAccount(privateKey);
  const chain = chainId === 8453 ? base : baseSepolia;

  const client = createWalletClient({
    account,
    chain,
    transport: http(),
  });

  return new ViemWallet(client);
}

export function resolveChainId(): 84532 | 8453 {
  const raw = process.env["CHAIN_ID"] ?? process.env["CHAINLENS_CHAIN_ID"];
  if (raw === "8453") return 8453;
  return 84532; // default to Base Sepolia
}
