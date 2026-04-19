"use client";

import { useState, useEffect } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { apiClient } from "@/lib/api-client";
import { ESCROW_ADDRESS, USDC_ADDRESS } from "@/config/contracts";
import type { PreparePaymentResponse } from "@apimarket/shared";

const approveAbi = [
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const payAbi = [
  {
    inputs: [
      { name: "apiId", type: "uint256" },
      { name: "seller", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "taskType", type: "bytes32" },
      { name: "inputsHash", type: "bytes32" },
    ],
    name: "pay",
    outputs: [{ name: "jobId", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

export type PaymentStep = "idle" | "approving" | "paying" | "confirmed";

export function usePayment() {
  const [prepareData, setPrepareData] = useState<PreparePaymentResponse | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [step, setStep] = useState<PaymentStep>("idle");

  const {
    data: approveTxHash,
    writeContract: writeApprove,
    isPending: isApprovePending,
    error: approveError,
  } = useWriteContract();

  const {
    data: payTxHash,
    writeContract: writePay,
    isPending: isPayPending,
    error: payError,
  } = useWriteContract();

  const { isLoading: isApproveConfirming, isSuccess: isApproveConfirmed } =
    useWaitForTransactionReceipt({ hash: approveTxHash });

  const { isLoading: isPayConfirming, isSuccess: isPayConfirmed } =
    useWaitForTransactionReceipt({ hash: payTxHash });

  useEffect(() => {
    if (isApproveConfirmed && prepareData && step === "approving") {
      setStep("paying");
      writePay({
        address: ESCROW_ADDRESS,
        abi: payAbi,
        functionName: "pay",
        args: [
          BigInt(prepareData.onChainApiId),
          prepareData.seller as `0x${string}`,
          BigInt(prepareData.amount),
          ZERO_BYTES32,
          ZERO_BYTES32,
        ],
      });
    }
  }, [isApproveConfirmed, prepareData, step, writePay]);

  useEffect(() => {
    if (isPayConfirmed) {
      setStep("confirmed");
    }
  }, [isPayConfirmed]);

  async function prepare(apiId: string, buyer: string) {
    setIsPreparing(true);
    setPrepareError(null);
    try {
      const data = await apiClient.post<PreparePaymentResponse>("/prepare", { apiId, buyer });
      setPrepareData(data);
      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to prepare payment";
      setPrepareError(msg);
      throw err;
    } finally {
      setIsPreparing(false);
    }
  }

  function pay(_onChainApiId: number, _seller: string, amountUsdc: string) {
    setStep("approving");
    writeApprove({
      address: USDC_ADDRESS,
      abi: approveAbi,
      functionName: "approve",
      args: [ESCROW_ADDRESS, BigInt(amountUsdc)],
    });
  }

  const isWriting = isApprovePending || isPayPending;
  const isConfirming = isApproveConfirming || isPayConfirming;
  const isConfirmed = isPayConfirmed;
  const writeError = approveError || payError;
  const txHash = payTxHash;

  return {
    prepare,
    pay,
    prepareData,
    isPreparing,
    prepareError,
    txHash,
    isWriting,
    writeError,
    isConfirming,
    isConfirmed,
    step,
  };
}
