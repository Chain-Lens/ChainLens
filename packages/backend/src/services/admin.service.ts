import { ApiStatus, ApiMarketEscrowAbi } from "@chain-lens/shared";
import { env } from "../config/env.js";
import { walletClient, publicClient } from "../config/viem.js";
import prisma from "../config/prisma.js";
import * as apiService from "./api.service.js";
import { isTaskTypeEnabled, taskTypeId } from "./task-type.service.js";
import {
  isSellerRegisteredOnChain,
  registerSellerOnChain,
} from "./on-chain.service.js";
import { logger } from "../utils/logger.js";
import { BadRequestError } from "../utils/errors.js";

export async function approve(apiId: string, adminAddress: string, reason?: string) {
  const api = await apiService.getById(apiId);

  if (api.status !== "PENDING") {
    throw new BadRequestError(`API is ${api.status}, cannot approve`);
  }

  // Every approved listing's category IS the on-chain task type name. If
  // the registry has the type disabled (or never registered it), approving
  // creates a listing no buyer can use — the escrow auto-refunds any job
  // pointed at it. Reject up front with a clear message rather than letting
  // it through and surfacing later as silent refunds.
  const taskTypeName = api.category;
  const enabled = await isTaskTypeEnabled(taskTypeName).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    throw new BadRequestError(
      `Failed to verify task type '${taskTypeName}' against TaskTypeRegistry: ${msg}`,
    );
  });
  if (!enabled) {
    throw new BadRequestError(
      `Task type '${taskTypeName}' is not enabled in TaskTypeRegistry. ` +
        `Register/enable it on-chain before approving this listing.`,
    );
  }

  // Make sure the seller is on SellerRegistry before the listing goes live.
  // Without this, buyers can createJob against the listing but the gateway's
  // reputation/earnings accounting (recordJobResult) reverts with "not found"
  // because SellerRegistry only exposes onlyGateway writers. We register the
  // first time through; subsequent approvals for the same seller skip
  // because registerSeller reverts with "already registered".
  //
  // Known MVP limitation: if the same seller has listings for different task
  // types, only the first registration's capabilities get indexed in
  // sellersByCapability. Contract doesn't expose an addCapability helper —
  // tracked as future contract work.
  const sellerAddress = api.sellerAddress as `0x${string}`;
  const alreadyRegistered = await isSellerRegisteredOnChain(sellerAddress);
  let sellerRegistrationTx: `0x${string}` | null = null;
  if (!alreadyRegistered) {
    sellerRegistrationTx = await registerSellerOnChain({
      seller: sellerAddress,
      name: api.name,
      capabilities: [taskTypeId(taskTypeName)],
      metadataURI: "",
    });
    logger.info(
      { apiId, seller: sellerAddress, hash: sellerRegistrationTx },
      "Seller registered on-chain",
    );
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

  return {
    onChainId,
    txHash: hash,
    sellerRegistrationTxHash: sellerRegistrationTx,
  };
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
