import prisma from "../config/prisma.js";
import { PaymentStatus } from "@chain-lens/shared";
import { NotFoundError, BadRequestError } from "../utils/errors.js";
import * as apiService from "./api.service.js";
import { env } from "../config/env.js";

export async function prepare(apiId: string, buyer: string) {
  const api = await apiService.getById(apiId);

  if (api.status !== "APPROVED") {
    throw new BadRequestError("API is not approved for purchase");
  }

  if (api.onChainId === null) {
    throw new BadRequestError("API does not have an on-chain ID");
  }

  const request = await prisma.paymentRequest.create({
    data: {
      apiId: api.id,
      buyer: buyer.toLowerCase(),
      seller: api.sellerAddress.toLowerCase(),
      amount: api.price,
      status: PaymentStatus.PENDING,
    },
  });

  return {
    requestId: request.id,
    apiId: api.id,
    onChainApiId: api.onChainId,
    seller: api.sellerAddress,
    amount: api.price,
    contractAddress: env.CONTRACT_ADDRESS,
    taskType: api.category,
  };
}

export async function markPaid(
  requestId: string,
  txHash: string,
  onChainPaymentId: number
) {
  return prisma.paymentRequest.update({
    where: { id: requestId },
    data: {
      status: PaymentStatus.PAID,
      txHash,
      onChainPaymentId,
    },
  });
}

export async function findPendingByPaymentEvent(
  buyer: string,
  apiOnChainId: number,
  amount: string
) {
  // v2 legacy — contractVersion is null for pre-v3 rows. findFirst avoids
  // the composite unique key since v2 code never knows about contractVersion.
  const api = await prisma.apiListing.findFirst({
    where: { onChainId: apiOnChainId, contractVersion: null },
  });

  if (!api) return null;

  return prisma.paymentRequest.findFirst({
    where: {
      apiId: api.id,
      buyer: buyer.toLowerCase(),
      amount,
      status: PaymentStatus.PENDING,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getRequest(requestId: string) {
  const request = await prisma.paymentRequest.findUnique({
    where: { id: requestId },
    include: { api: { select: { name: true, description: true } } },
  });

  if (!request) throw new NotFoundError("Request not found");
  return request;
}

export async function updateStatus(
  requestId: string,
  status: PaymentStatus,
  data?: {
    result?: unknown;
    errorMessage?: string;
    completionTxHash?: string;
  }
) {
  return prisma.paymentRequest.update({
    where: { id: requestId },
    data: {
      status,
      ...(data?.result !== undefined ? { result: data.result as never } : {}),
      ...(data?.errorMessage !== undefined
        ? { errorMessage: data.errorMessage }
        : {}),
      ...(data?.completionTxHash !== undefined
        ? { completionTxHash: data.completionTxHash }
        : {}),
    },
  });
}
