import { ApiStatus, ApiMarketEscrowAbi } from "@chainlens/shared";
import { env } from "../config/env.js";
import { walletClient, publicClient } from "../config/viem.js";
import prisma from "../config/prisma.js";
import * as apiService from "./api.service.js";
import { logger } from "../utils/logger.js";
import { BadRequestError } from "../utils/errors.js";

export async function approve(apiId: string, adminAddress: string, reason?: string) {
  const api = await apiService.getById(apiId);

  if (api.status !== "PENDING") {
    throw new BadRequestError(`API is ${api.status}, cannot approve`);
  }

  const onChainId = await apiService.getNextOnChainId();

  // Call approveApi on-chain
  const hash = await walletClient.writeContract({
    address: env.CONTRACT_ADDRESS as `0x${string}`,
    abi: ApiMarketEscrowAbi as readonly unknown[],
    functionName: "approveApi",
    args: [BigInt(onChainId)],
  });

  await publicClient.waitForTransactionReceipt({ hash });

  await apiService.updateStatus(apiId, ApiStatus.APPROVED, onChainId);

  await prisma.adminAction.create({
    data: {
      apiId,
      action: "APPROVE",
      adminAddress: adminAddress.toLowerCase(),
      reason,
    },
  });

  logger.info({ apiId, onChainId, hash }, "API approved on-chain");

  return { onChainId, txHash: hash };
}

export async function reject(apiId: string, adminAddress: string, reason?: string) {
  const api = await apiService.getById(apiId);

  if (api.status !== "PENDING") {
    throw new BadRequestError(`API is ${api.status}, cannot reject`);
  }

  await apiService.updateStatus(apiId, ApiStatus.REJECTED);

  await prisma.adminAction.create({
    data: {
      apiId,
      action: "REJECT",
      adminAddress: adminAddress.toLowerCase(),
      reason,
    },
  });

  logger.info({ apiId }, "API rejected");
}
