import { Router, Request, Response, NextFunction } from "express";
import { parseEventLogs } from "viem";
import { ApiMarketEscrowAbi } from "@chain-lens/shared";
import { publicClient } from "../config/viem.js";
import { env } from "../config/env.js";
import prisma from "../config/prisma.js";
import * as gatewayService from "../services/gateway.service.js";
import { PaymentStatus } from "@chain-lens/shared";
import { logger } from "../utils/logger.js";

const router = Router();

// GET /x402/:apiId
// - 헤더 없음  → 402 Payment Required
// - X-Payment-Tx 헤더 있음 → tx 검증 후 seller API 호출 → 결과 반환
router.get("/:apiId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiId = req.params["apiId"] as string;

    // API 조회
    const api = await prisma.apiListing.findUnique({ where: { id: apiId } });
    if (!api || api.status !== "APPROVED") {
      res.status(404).json({ error: "API not found or not approved" });
      return;
    }

    const txHashRaw = req.headers["x-payment-tx"];
    const txHash = Array.isArray(txHashRaw) ? txHashRaw[0] : txHashRaw;

    // ── 1단계: 결제 정보 반환 (402) ──────────────────────────────
    if (!txHash) {
      res.status(402).json({
        error: "Payment Required",
        x402: {
          amount: api.price,           // wei 단위
          amountMon: (Number(api.price) / 1e18).toString(),
          contractAddress: env.CONTRACT_ADDRESS,
          onChainApiId: api.onChainId,
          seller: api.sellerAddress,
          chainId: 84532,
          instructions: [
            "1. Call pay(apiId, seller) on the contract with value = amount",
            "2. Retry this request with header: X-Payment-Tx: <txHash>",
          ],
        },
      });
      return;
    }

    // ── 2단계: tx 검증 ────────────────────────────────────────────
    let receipt;
    try {
      receipt = await publicClient.getTransactionReceipt({
        hash: txHash as `0x${string}`,
      });
    } catch {
      res.status(400).json({ error: "Transaction not found or not confirmed" });
      return;
    }

    if (receipt.status !== "success") {
      res.status(400).json({ error: "Transaction failed on-chain" });
      return;
    }

    // PaymentReceived 이벤트 파싱
    const logs = parseEventLogs({
      abi: ApiMarketEscrowAbi as never,
      logs: receipt.logs,
      eventName: "PaymentReceived",
    });

    if (logs.length === 0) {
      res.status(400).json({ error: "No PaymentReceived event found in tx" });
      return;
    }

    const event = (logs[0] as unknown as { args: {
      paymentId: bigint;
      buyer: string;
      apiId: bigint;
      seller: string;
      amount: bigint;
    } }).args;

    // onChainId 일치 확인
    if (api.onChainId === null || Number(event.apiId) !== api.onChainId) {
      res.status(400).json({ error: "Payment is for a different API" });
      return;
    }

    // 금액 확인
    if (event.amount < BigInt(api.price)) {
      res.status(400).json({ error: "Insufficient payment amount" });
      return;
    }

    // tx 중복 사용 방지
    const existing = await prisma.paymentRequest.findFirst({
      where: { txHash: txHash! },
    });
    if (existing) {
      res.status(400).json({ error: "Transaction already used" });
      return;
    }

    // ── 3단계: PaymentRequest 생성 및 execute ─────────────────────
    const paymentRequest = await prisma.paymentRequest.create({
      data: {
        apiId: api.id,
        buyer: event.buyer.toLowerCase(),
        seller: api.sellerAddress.toLowerCase(),
        amount: api.price,
        status: PaymentStatus.PAID,
        txHash: txHash!,
        onChainPaymentId: Number(event.paymentId),
      },
    });

    logger.info({ requestId: paymentRequest.id, txHash }, "x402 payment verified");

    // seller API 호출 + 온체인 complete
    const result = await gatewayService.execute(paymentRequest.id);

    res.json({
      requestId: paymentRequest.id,
      status: result.status,
      result: result.result ?? null,
      txHash: result.txHash ?? null,
      error: result.error ?? null,
    });

  } catch (err) {
    next(err);
  }
});

export default router;
