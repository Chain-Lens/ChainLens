import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as paymentService from "../services/payment.service.js";
import * as gatewayService from "../services/gateway.service.js";
import { validate } from "../middleware/validate.js";
import { PaymentStatus } from "@chain-lens/shared";
import { walletClient, publicClient, enqueueWrite } from "../config/viem.js";
import { ApiMarketEscrowAbi } from "@chain-lens/shared";
import { env } from "../config/env.js";
import { BadRequestError, UnauthorizedError } from "../utils/errors.js";

const router = Router();

const prepareSchema = z.object({
  apiId: z.string().uuid(),
  buyer: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

// POST /prepare - Prepare payment
router.post(
  "/prepare",
  validate(prepareSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await paymentService.prepare(req.body.apiId, req.body.buyer);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

const executeSchema = z.object({
  requestId: z.string().uuid(),
});

const refundSchema = z.object({
  buyer: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

// POST /execute - Trigger execution (manual fallback)
router.post(
  "/execute",
  validate(executeSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await gatewayService.execute(req.body.requestId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// GET /requests/:requestId - Get request status
router.get(
  "/requests/:requestId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const request = await paymentService.getRequest(req.params.requestId as string);
      res.json(request);
    } catch (err) {
      next(err);
    }
  }
);

// POST /requests/:requestId/refund - Buyer manually requests refund
// 허용 조건: PAID 또는 EXECUTING 상태이고 5분 이상 경과, buyer 본인만 가능
router.post(
  "/requests/:requestId/refund",
  validate(refundSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const requestId = req.params["requestId"] as string;
      const { buyer } = req.body as z.infer<typeof refundSchema>;

      const request = await paymentService.getRequest(requestId);

      // buyer 본인 확인
      if (request.buyer.toLowerCase() !== buyer.toLowerCase()) {
        return next(new UnauthorizedError("Not the buyer of this request"));
      }

      // 환불 가능한 상태 확인
      const refundableStatuses = [PaymentStatus.PAID, PaymentStatus.EXECUTING];
      if (!refundableStatuses.includes(request.status as PaymentStatus)) {
        return next(new BadRequestError(`Cannot refund request in ${request.status} status`));
      }

      // 5분 경과 확인 (PAID/EXECUTING인데 5분 넘으면 stuck으로 간주)
      const TIMEOUT_MS = 5 * 60 * 1000;
      const elapsed = Date.now() - new Date(request.updatedAt).getTime();
      if (elapsed < TIMEOUT_MS) {
        const remainSec = Math.ceil((TIMEOUT_MS - elapsed) / 1000);
        return next(new BadRequestError(`Please wait ${remainSec}s before requesting refund`));
      }

      if (request.onChainPaymentId === null) {
        return next(new BadRequestError("No on-chain payment ID"));
      }

      // 온체인 refund 호출
      // `request.onChainPaymentId` is `number | null` on the Prisma type
      // but we already narrowed to non-null just above. The closure here
      // loses control-flow narrowing, so assert with `!`.
      const onChainPaymentId = request.onChainPaymentId!;
      const hash = await enqueueWrite(() =>
        walletClient.writeContract({
          address: env.CONTRACT_ADDRESS as `0x${string}`,
          abi: ApiMarketEscrowAbi as readonly unknown[],
          functionName: "refund",
          args: [BigInt(onChainPaymentId)],
        }),
      );

      await publicClient.waitForTransactionReceipt({ hash });

      await paymentService.updateStatus(requestId, PaymentStatus.REFUNDED, {
        errorMessage: "Manual refund requested by buyer",
        completionTxHash: hash,
      });

      res.json({ success: true, txHash: hash });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
