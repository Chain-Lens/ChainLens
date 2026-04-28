import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, baseMainnet } from "@chain-lens/shared";
import { env } from "./env.js";

const chain = env.RPC_URL.includes("sepolia") ? baseSepolia : baseMainnet;

export const publicClient = createPublicClient({
  chain,
  transport: http(env.RPC_URL),
});

export const gatewayAccount = privateKeyToAccount(env.PRIVATE_KEY as `0x${string}`);

export const walletClient = createWalletClient({
  account: gatewayAccount,
  chain,
  transport: http(env.RPC_URL),
});

/**
 * Serializes every gateway write through a single promise chain so that
 * viem's `eth_getTransactionCount(address, "pending")` always sees the
 * prior tx committed before picking a nonce for the next one. Without
 * this, two concurrent writeContract calls can both read the same
 * pending-nonce, submit with identical nonces, and one ends up
 * "replacement transaction underpriced" at the RPC. Observed in prod
 * on finalizeJob's refund + recordSellerResult pair.
 *
 * Each call still awaits its tx submission (not confirmation); viem's
 * `writeContract` returns as soon as the tx is accepted to the mempool,
 * which is enough for nonce sequencing. Errors don't break the chain —
 * the next caller proceeds regardless.
 */
let writeChain: Promise<unknown> = Promise.resolve();

export async function enqueueWrite<T>(op: () => Promise<T>): Promise<T> {
  const previous = writeChain;
  let release: () => void = () => {};
  writeChain = new Promise<void>((r) => {
    release = r;
  });
  try {
    await previous;
  } catch {
    // Intentional: a prior caller's failure shouldn't block the queue.
  }
  try {
    return await op();
  } finally {
    release();
  }
}
