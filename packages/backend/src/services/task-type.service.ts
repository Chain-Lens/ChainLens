import { keccak256, stringToBytes } from "viem";
import {
  TaskTypeRegistryAbi,
  TASK_TYPE_REGISTRY_ADDRESSES,
  type OnChainTaskTypeConfig,
} from "@chain-lens/shared";
import { publicClient } from "../config/viem.js";

export function taskTypeId(name: string): `0x${string}` {
  return keccak256(stringToBytes(name));
}

function registryAddress(): `0x${string}` {
  const chainId = publicClient.chain?.id;
  if (chainId === undefined) throw new Error("publicClient.chain not configured");
  const addr = TASK_TYPE_REGISTRY_ADDRESSES[chainId];
  if (!addr || addr === "0x0000000000000000000000000000000000000000") {
    throw new Error(`no TaskTypeRegistry deployed for chainId=${chainId}`);
  }
  return addr;
}

export async function getTaskTypeConfig(
  name: string,
): Promise<OnChainTaskTypeConfig | null> {
  return getTaskTypeConfigById(taskTypeId(name));
}

export async function getTaskTypeConfigById(
  id: `0x${string}`,
): Promise<OnChainTaskTypeConfig | null> {
  try {
    const cfg = (await publicClient.readContract({
      address: registryAddress(),
      abi: TaskTypeRegistryAbi,
      functionName: "getConfig",
      args: [id],
    })) as OnChainTaskTypeConfig;
    return cfg;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/not found/i.test(msg)) return null;
    throw e;
  }
}

export async function isTaskTypeEnabled(name: string): Promise<boolean> {
  const enabled = (await publicClient.readContract({
    address: registryAddress(),
    abi: TaskTypeRegistryAbi,
    functionName: "isEnabled",
    args: [taskTypeId(name)],
  })) as boolean;
  return enabled;
}

export interface TaskTypeListItem {
  id: `0x${string}`;
  name: string;
  schemaURI: string;
  maxResponseTime: number;
  minBudget: string;
  enabled: boolean;
  registeredAt: number;
}

export interface OnChainConfigRaw {
  name: string;
  schemaURI: string;
  maxResponseTime: bigint;
  minBudget: bigint;
  enabled: boolean;
  registeredAt: bigint;
}

export interface TaskTypeReader {
  getAllIds(): Promise<`0x${string}`[]>;
  getConfig(id: `0x${string}`): Promise<OnChainConfigRaw>;
  chainId(): number;
}

export const TASK_TYPE_LIST_TTL_MS = 30_000;

interface CacheEntry {
  expiresAt: number;
  value: TaskTypeListItem[];
}

const listCache = new Map<number, CacheEntry>();

export const defaultTaskTypeReader: TaskTypeReader = {
  async getAllIds() {
    return (await publicClient.readContract({
      address: registryAddress(),
      abi: TaskTypeRegistryAbi,
      functionName: "getAllTaskTypes",
    })) as `0x${string}`[];
  },
  async getConfig(id) {
    return (await publicClient.readContract({
      address: registryAddress(),
      abi: TaskTypeRegistryAbi,
      functionName: "getConfig",
      args: [id],
    })) as OnChainConfigRaw;
  },
  chainId() {
    const id = publicClient.chain?.id;
    if (id === undefined) throw new Error("publicClient.chain not configured");
    return id;
  },
};

/**
 * Read every TaskTypeConfig currently registered on-chain. Used by the
 * /api/task-types endpoint so the frontend can render a dropdown sourced
 * from the registry rather than hardcoded strings.
 *
 * The contract only exposes ids via getAllTaskTypes(); names live in the
 * per-id config. We fan out one getConfig call per id (5-20 ids is the
 * expected range), then cache the projection for TASK_TYPE_LIST_TTL_MS.
 */
export async function getAllTaskTypesWithConfig(
  options: {
    skipCache?: boolean;
    reader?: TaskTypeReader;
    now?: () => number;
  } = {},
): Promise<TaskTypeListItem[]> {
  const reader = options.reader ?? defaultTaskTypeReader;
  const now = options.now ?? Date.now;
  const chainId = reader.chainId();

  if (!options.skipCache) {
    const cached = listCache.get(chainId);
    if (cached && cached.expiresAt > now()) return cached.value;
  }

  const ids = await reader.getAllIds();
  const configs = await Promise.all(
    ids.map(async (id) => {
      const cfg = await reader.getConfig(id);
      return {
        id,
        name: cfg.name,
        schemaURI: cfg.schemaURI,
        maxResponseTime: Number(cfg.maxResponseTime),
        minBudget: cfg.minBudget.toString(),
        enabled: cfg.enabled,
        registeredAt: Number(cfg.registeredAt),
      } satisfies TaskTypeListItem;
    }),
  );

  listCache.set(chainId, {
    value: configs,
    expiresAt: now() + TASK_TYPE_LIST_TTL_MS,
  });
  return configs;
}

export function clearTaskTypeListCache(): void {
  listCache.clear();
}
