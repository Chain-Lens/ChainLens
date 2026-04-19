import { ApiMarketEscrowAbi } from "@chainlens/shared";
import { env } from "../config/env.js";
import { publicClient } from "../config/viem.js";
import * as paymentService from "./payment.service.js";
import * as gatewayService from "./gateway.service.js";
import { logger } from "../utils/logger.js";
import { formatUnits } from "viem";

export async function startEventListener() {
  logger.info("Starting payment event listener...");

  const contractAddress = env.CONTRACT_ADDRESS as `0x${string}`;

  publicClient.watchContractEvent({
    address: contractAddress,
    abi: ApiMarketEscrowAbi as readonly unknown[],
    eventName: "PaymentReceived",
    onLogs: async (logs: unknown[]) => {
      for (const log of logs) {
        try {
          const logEntry = log as {
            args: Record<string, unknown>;
            transactionHash: string;
          };
          const args = logEntry.args as {
            paymentId: bigint;
            buyer: string;
            apiId: bigint;
            seller: string;
            amount: bigint;
          };

          logger.info(
            {
              paymentId: args.paymentId.toString(),
              buyer: args.buyer,
              apiId: args.apiId.toString(),
              amount: formatUnits(args.amount, 6),
            },
            "PaymentReceived event detected"
          );

          const request = await paymentService.findPendingByPaymentEvent(
            args.buyer,
            Number(args.apiId),
            args.amount.toString()
          );

          if (!request) {
            logger.warn(
              { paymentId: args.paymentId.toString() },
              "No matching pending request found for payment event"
            );
            continue;
          }

          await paymentService.markPaid(
            request.id,
            logEntry.transactionHash,
            Number(args.paymentId)
          );

          logger.info(
            { requestId: request.id, paymentId: args.paymentId.toString() },
            "Request marked as PAID, triggering execution"
          );

          // Execute asynchronously
          gatewayService.execute(request.id).catch((err) => {
            logger.error(
              { requestId: request.id, error: err },
              "Auto-execution failed"
            );
          });
        } catch (error) {
          logger.error({ error, log }, "Error processing payment event");
        }
      }
    },
    onError: (error) => {
      logger.error({ error }, "Event listener error");
    },
  });

  logger.info(
    { contractAddress },
    "Payment event listener started"
  );
}
