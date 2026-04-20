import {
  ApiMarketEscrowV2Abi,
  SellerRegistryAbi,
  TaskTypeRegistryAbi,
  CONTRACT_ADDRESSES_V2,
  SELLER_REGISTRY_ADDRESSES,
  TASK_TYPE_REGISTRY_ADDRESSES,
} from "@chain-lens/shared";
import { publicClient, walletClient } from "../config/viem.js";

// Manual gas pins for every write path targeting the Phase-3.5 escrow +
// SellerRegistry. viem's gas estimation over public sepolia.base.org
// intermittently returns the block gas limit (~30M) instead of a real
// estimate, and the L2 then rejects the tx with "intrinsic gas too high"
// at admission time. eth_call simulations against identical calldata
// succeed, confirming the calls are valid; it's an estimation wart, not
// a revert. Pins leave ~2-3× headroom over observed on-chain consumption
// without being wasteful.
const GAS_SUBMIT = 250_000n;
const GAS_REFUND = 150_000n;
const GAS_REGISTER_SELLER = 350_000n;
const GAS_RECORD_JOB_RESULT = 150_000n;
const GAS_SET_ENABLED = 100_000n;

function addressFor(
  map: Record<number, `0x${string}`>,
  contract: string,
): `0x${string}` {
  const chainId = publicClient.chain?.id;
  if (chainId === undefined) throw new Error("publicClient.chain not configured");
  const addr = map[chainId];
  if (!addr || addr === "0x0000000000000000000000000000000000000000") {
    throw new Error(`no ${contract} deployed for chainId=${chainId}`);
  }
  return addr;
}

export async function submitJob(args: {
  jobId: bigint;
  responseHash: `0x${string}`;
  evidenceURI: string;
}): Promise<`0x${string}`> {
  const hash = await walletClient.writeContract({
    address: addressFor(CONTRACT_ADDRESSES_V2, "ApiMarketEscrowV2"),
    abi: ApiMarketEscrowV2Abi,
    functionName: "submit",
    args: [args.jobId, args.responseHash, args.evidenceURI],
    gas: GAS_SUBMIT,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function refundJob(args: {
  jobId: bigint;
}): Promise<`0x${string}`> {
  const hash = await walletClient.writeContract({
    address: addressFor(CONTRACT_ADDRESSES_V2, "ApiMarketEscrowV2"),
    abi: ApiMarketEscrowV2Abi,
    functionName: "refund",
    args: [args.jobId],
    gas: GAS_REFUND,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function registerSellerOnChain(args: {
  seller: `0x${string}`;
  name: string;
  capabilities: readonly `0x${string}`[];
  metadataURI?: string;
}): Promise<`0x${string}`> {
  const hash = await walletClient.writeContract({
    address: addressFor(SELLER_REGISTRY_ADDRESSES, "SellerRegistry"),
    abi: SellerRegistryAbi,
    functionName: "registerSeller",
    args: [args.seller, args.name, args.capabilities, args.metadataURI ?? ""],
    gas: GAS_REGISTER_SELLER,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function isSellerRegisteredOnChain(
  seller: `0x${string}`,
): Promise<boolean> {
  return (await publicClient.readContract({
    address: addressFor(SELLER_REGISTRY_ADDRESSES, "SellerRegistry"),
    abi: SellerRegistryAbi,
    functionName: "isRegistered",
    args: [seller],
  })) as boolean;
}

export async function setTaskTypeEnabled(args: {
  taskTypeId: `0x${string}`;
  enabled: boolean;
}): Promise<`0x${string}`> {
  const hash = await walletClient.writeContract({
    address: addressFor(TASK_TYPE_REGISTRY_ADDRESSES, "TaskTypeRegistry"),
    abi: TaskTypeRegistryAbi,
    functionName: "setEnabled",
    args: [args.taskTypeId, args.enabled],
    gas: GAS_SET_ENABLED,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function recordSellerResult(args: {
  seller: `0x${string}`;
  success: boolean;
  earningsUsdc: bigint;
}): Promise<`0x${string}`> {
  const hash = await walletClient.writeContract({
    address: addressFor(SELLER_REGISTRY_ADDRESSES, "SellerRegistry"),
    abi: SellerRegistryAbi,
    functionName: "recordJobResult",
    args: [args.seller, args.success, args.earningsUsdc],
    gas: GAS_RECORD_JOB_RESULT,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export interface OnChainSellerInfo {
  sellerAddress: `0x${string}`;
  name: string;
  capabilities: readonly `0x${string}`[];
  metadataURI: string;
  registeredAt: bigint;
  active: boolean;
}

export interface OnChainSellerStats {
  completed: bigint;
  failed: bigint;
  earnings: bigint;
}

export async function getSellerInfo(
  seller: `0x${string}`,
): Promise<OnChainSellerInfo | null> {
  const info = (await publicClient.readContract({
    address: addressFor(SELLER_REGISTRY_ADDRESSES, "SellerRegistry"),
    abi: SellerRegistryAbi,
    functionName: "getSellerInfo",
    args: [seller],
  })) as OnChainSellerInfo;
  if (info.registeredAt === 0n) return null;
  return info;
}

export async function getSellerReputationBps(
  seller: `0x${string}`,
): Promise<bigint> {
  return (await publicClient.readContract({
    address: addressFor(SELLER_REGISTRY_ADDRESSES, "SellerRegistry"),
    abi: SellerRegistryAbi,
    functionName: "getReputation",
    args: [seller],
  })) as bigint;
}

export async function getSellerStats(
  seller: `0x${string}`,
): Promise<OnChainSellerStats> {
  const addr = addressFor(SELLER_REGISTRY_ADDRESSES, "SellerRegistry");
  const [completed, failed, earnings] = await Promise.all([
    publicClient.readContract({
      address: addr,
      abi: SellerRegistryAbi,
      functionName: "jobsCompleted",
      args: [seller],
    }),
    publicClient.readContract({
      address: addr,
      abi: SellerRegistryAbi,
      functionName: "jobsFailed",
      args: [seller],
    }),
    publicClient.readContract({
      address: addr,
      abi: SellerRegistryAbi,
      functionName: "totalEarnings",
      args: [seller],
    }),
  ]);
  return {
    completed: completed as bigint,
    failed: failed as bigint,
    earnings: earnings as bigint,
  };
}
