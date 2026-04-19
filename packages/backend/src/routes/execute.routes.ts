import { Router, Request, Response, NextFunction } from "express";
import { parseEventLogs } from "viem";
import { ApiMarketEscrowAbi } from "@chainlens/shared";
import { publicClient } from "../config/viem.js";
import { env } from "../config/env.js";
import prisma from "../config/prisma.js";
import * as gatewayService from "../services/gateway.service.js";
import { PaymentStatus } from "@chainlens/shared";
import { logger } from "../utils/logger.js";

const router = Router();

// 공통 핸들러: GET + POST 모두 처리
async function handleExecute(req: Request, res: Response, next: NextFunction) {
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

    // ── 1단계: 결제 정보 반환 (402) ───────────────────────────────
    if (!txHash) {
      res.status(402).json({
        error: "Payment Required",
        x402: {
          amount: api.price,
          amountMon: (Number(api.price) / 1e18).toFixed(6),
          contractAddress: env.CONTRACT_ADDRESS,
          onChainApiId: api.onChainId,
          seller: api.sellerAddress,
          chainId: 84532,
          payFunction: "pay(uint256 apiId, address seller) payable",
          instructions: [
            "1. Call pay(onChainApiId, seller) on the contract with msg.value = amount (wei)",
            "2. Retry this request with header: X-Payment-Tx: <txHash>",
          ],
        },
      });
      return;
    }

    // ── 2단계: tx 검증 ─────────────────────────────────────────────
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

    const event = (logs[0] as unknown as {
      args: {
        paymentId: bigint;
        buyer: string;
        apiId: bigint;
        seller: string;
        amount: bigint;
      };
    }).args;

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

    // tx 중복 사용 방지 (replay attack)
    const existing = await prisma.paymentRequest.findFirst({
      where: { txHash },
    });
    if (existing) {
      res.status(400).json({ error: "Transaction already used" });
      return;
    }

    // ── 3단계: PaymentRequest 생성 ────────────────────────────────
    const paymentRequest = await prisma.paymentRequest.create({
      data: {
        apiId: api.id,
        buyer: event.buyer.toLowerCase(),
        seller: api.sellerAddress.toLowerCase(),
        amount: api.price,
        status: PaymentStatus.PAID,
        txHash,
        onChainPaymentId: Number(event.paymentId),
      },
    });

    logger.info({ requestId: paymentRequest.id, txHash }, "x402 payment verified");

    // 에이전트가 넘긴 body (POST일 때)
    const agentPayload =
      req.method === "POST" && req.body && Object.keys(req.body).length > 0
        ? (req.body as Record<string, unknown>)
        : undefined;

    // ── 4단계: seller API 호출 + 온체인 complete ──────────────────
    const result = await gatewayService.execute(paymentRequest.id, agentPayload);

    res.json({
      requestId: paymentRequest.id,
      status: result.status,
      result: result.result ?? null,
      settlementTxHash: result.txHash ?? null,
      error: result.error ?? null,
    });
  } catch (err) {
    next(err);
  }
}

// GET /execute/:apiId  — 결제 없이 조회하거나 결제 후 데이터 받기
router.get("/:apiId", handleExecute);

// POST /execute/:apiId — 에이전트가 body(파라미터)를 seller API에 전달할 때
router.post("/:apiId", handleExecute);

export default router;
