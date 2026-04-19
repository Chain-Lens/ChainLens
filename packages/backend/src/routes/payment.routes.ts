import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as paymentService from "../services/payment.service.js";
import * as gatewayService from "../services/gateway.service.js";
import { validate } from "../middleware/validate.js";
import { PaymentStatus } from "@chainlens/shared";
import { walletClient, publicClient } from "../config/viem.js";
import { ApiMarketEscrowAbi } from "@chainlens/shared";
import { env } from "../config/env.js";

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
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const requestId = req.params["requestId"] as string;
      const { buyer } = req.body as { buyer: string };

      if (!buyer) {
        res.status(400).json({ error: { message: "buyer address required" } });
        return;
      }

      const request = await paymentService.getRequest(requestId);

      // buyer 본인 확인
      if (request.buyer.toLowerCase() !== buyer.toLowerCase()) {
        res.status(403).json({ error: { message: "Not the buyer of this request" } });
        return;
      }

      // 환불 가능한 상태 확인
      const refundableStatuses = [PaymentStatus.PAID, PaymentStatus.EXECUTING];
      if (!refundableStatuses.includes(request.status as PaymentStatus)) {
        res.status(400).json({
          error: { message: `Cannot refund request in ${request.status} status` },
        });
        return;
      }

      // 5분 경과 확인 (PAID/EXECUTING인데 5분 넘으면 stuck으로 간주)
      const TIMEOUT_MS = 5 * 60 * 1000;
      const elapsed = Date.now() - new Date(request.updatedAt).getTime();
      if (elapsed < TIMEOUT_MS) {
        const remainSec = Math.ceil((TIMEOUT_MS - elapsed) / 1000);
        res.status(400).json({
          error: { message: `Please wait ${remainSec}s before requesting refund` },
        });
        return;
      }

      if (request.onChainPaymentId === null) {
        res.status(400).json({ error: { message: "No on-chain payment ID" } });
        return;
      }

      // 온체인 refund 호출
      const hash = await walletClient.writeContract({
        address: env.CONTRACT_ADDRESS as `0x${string}`,
        abi: ApiMarketEscrowAbi as readonly unknown[],
        functionName: "refund",
        args: [BigInt(request.onChainPaymentId)],
      });

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
