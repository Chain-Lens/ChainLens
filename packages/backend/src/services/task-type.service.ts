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
