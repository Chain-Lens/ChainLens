import {
  ApiMarketEscrowV2Abi,
  SellerRegistryAbi,
  CONTRACT_ADDRESSES_V2,
  SELLER_REGISTRY_ADDRESSES,
} from "@chain-lens/shared";
import { publicClient, walletClient } from "../config/viem.js";

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
