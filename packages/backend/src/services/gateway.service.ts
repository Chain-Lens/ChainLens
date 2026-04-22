import { PaymentStatus, ApiMarketEscrowV2Abi } from "@chain-lens/shared";
import { keccak256, stringToBytes } from "viem";
import { env } from "../config/env.js";
import { walletClient, publicClient, enqueueWrite } from "../config/viem.js";
import prisma from "../config/prisma.js";
import * as paymentService from "./payment.service.js";
import { logger } from "../utils/logger.js";
import { AppError, BadRequestError } from "../utils/errors.js";
import { scanResponse } from "./injection-filter.service.js";
import { assertSafeOutboundUrl } from "../utils/network.js";

const EXECUTION_TIMEOUT_MS = 30_000;

export async function execute(requestId: string, agentPayload?: Record<string, unknown>) {
  const request = await prisma.paymentRequest.findUnique({
    where: { id: requestId },
    include: { api: true },
  });

  if (!request) {
    throw new BadRequestError("Request not found");
  }

  if (request.status !== PaymentStatus.PAID) {
    throw new BadRequestError(
      `Request is in ${request.status} state, expected PAID`
    );
  }

  if (request.onChainPaymentId === null) {
    throw new BadRequestError("Missing on-chain payment ID");
  }

  await paymentService.updateStatus(requestId, PaymentStatus.EXECUTING);

  try {
    logger.info(
      { requestId, endpoint: request.api.endpoint },
      "Calling seller API"
    );

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      EXECUTION_TIMEOUT_MS
    );

    let response: Response;
    try {
      // agentPayload가 있으면 그대로, 없으면 exampleRequest 사용
      const body = agentPayload ?? (request.api.exampleRequest as Record<string, unknown> | null) ?? {};
      const hasBody = Object.keys(body).length > 0;
      const safeUrl = await assertSafeOutboundUrl(request.api.endpoint);
      // body가 없으면 GET, 있으면 POST
      response = await fetch(safeUrl, {
        method: hasBody ? "POST" : "GET",
        headers: hasBody ? { "Content-Type": "application/json" } : undefined,
        body: hasBody ? JSON.stringify({ requestId, buyer: request.buyer, ...body }) : undefined,
        signal: controller.signal,
        redirect: "error",
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new AppError(`Seller API returned ${response.status}`, 502, "SELLER_API_ERROR");
    }

    const result = await response.json();

    if (!result || typeof result !== "object") {
      throw new AppError("Invalid response from seller API", 502, "SELLER_API_ERROR");
    }

    const scan = scanResponse(result);
    if (!scan.clean) {
      throw new AppError(
        `Seller API response rejected: ${scan.reason}`,
        502,
        "SELLER_API_ERROR"
      );
    }

    // On-chain complete (V2: jobId, responseHash, evidenceURI)
    // `request.onChainPaymentId` narrowed to non-null at line 30; closure
    // loses that narrowing so capture into a local.
    const onChainPaymentId = request.onChainPaymentId!;
    const responseHash = keccak256(stringToBytes(JSON.stringify(result)));
    const hash = await enqueueWrite(() =>
      walletClient.writeContract({
        address: env.CONTRACT_ADDRESS as `0x${string}`,
        abi: ApiMarketEscrowV2Abi as readonly unknown[],
        functionName: "complete",
        args: [BigInt(onChainPaymentId), responseHash, ""],
      }),
    );

    await publicClient.waitForTransactionReceipt({ hash });

    await paymentService.updateStatus(requestId, PaymentStatus.COMPLETED, {
      result,
      completionTxHash: hash,
    });

    logger.info({ requestId, hash }, "Payment completed, seller paid");

    return { status: "success", result, txHash: hash };
  } catch (error) {
    logger.error({ requestId, error }, "API execution failed, refunding");

    try {
      const hash = await enqueueWrite(() =>
        walletClient.writeContract({
          address: env.CONTRACT_ADDRESS as `0x${string}`,
          abi: ApiMarketEscrowV2Abi as readonly unknown[],
          functionName: "refund",
          args: [BigInt(request.onChainPaymentId!)],
        }),
      );

      await publicClient.waitForTransactionReceipt({ hash });

      await paymentService.updateStatus(requestId, PaymentStatus.REFUNDED, {
        errorMessage:
          error instanceof Error ? error.message : "Unknown error",
        completionTxHash: hash,
      });

      logger.info({ requestId, hash }, "Payment refunded");

      return {
        status: "refunded",
        error: error instanceof Error ? error.message : "Unknown error",
        txHash: hash,
      };
    } catch (refundError) {
      logger.error(
        { requestId, refundError },
        "Refund failed! Manual intervention needed"
      );

      await paymentService.updateStatus(requestId, PaymentStatus.FAILED, {
        errorMessage: "Execution and refund both failed",
      });

      return { status: "failed", error: "Execution and refund both failed" };
    }
  }
}
