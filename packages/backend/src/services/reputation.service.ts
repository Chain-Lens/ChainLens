import type {
  OnChainSellerInfo,
  OnChainSellerStats,
} from "./on-chain.service.js";

export interface SellerReputation {
  address: `0x${string}`;
  active: boolean;
  name: string;
  capabilities: `0x${string}`[];
  metadataURI: string;
  registeredAt: string;
  reputationBps: string;
  jobsCompleted: string;
  jobsFailed: string;
  totalEarnings: string;
}

export interface ReputationDeps {
  getSellerInfo: (addr: `0x${string}`) => Promise<OnChainSellerInfo | null>;
  getSellerReputationBps: (addr: `0x${string}`) => Promise<bigint>;
  getSellerStats: (addr: `0x${string}`) => Promise<OnChainSellerStats>;
}

export async function getSellerReputation(
  address: `0x${string}`,
  deps: ReputationDeps,
): Promise<SellerReputation | null> {
  const info = await deps.getSellerInfo(address);
  if (!info) return null;
  const [bps, stats] = await Promise.all([
    deps.getSellerReputationBps(address),
    deps.getSellerStats(address),
  ]);
  return {
    address,
    active: info.active,
    name: info.name,
    capabilities: [...info.capabilities],
    metadataURI: info.metadataURI,
    registeredAt: info.registeredAt.toString(),
    reputationBps: bps.toString(),
    jobsCompleted: stats.completed.toString(),
    jobsFailed: stats.failed.toString(),
    totalEarnings: stats.earnings.toString(),
  };
}

export async function defaultReputationDeps(): Promise<ReputationDeps> {
  const mod = await import("./on-chain.service.js");
  return {
    getSellerInfo: mod.getSellerInfo,
    getSellerReputationBps: mod.getSellerReputationBps,
    getSellerStats: mod.getSellerStats,
  };
}
