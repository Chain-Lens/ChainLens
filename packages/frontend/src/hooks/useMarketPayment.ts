"use client";

import { useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { parseSignature, toHex } from "viem";
import { apiClient } from "@/lib/api-client";
import { CHAIN_LENS_MARKET_ADDRESS, USDC_ADDRESS } from "@/config/contracts";
import type { MarketCallResponse } from "@/types/market";

const receiveWithAuthorizationTypes = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

const TARGET_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || "84532");
const AUTH_WINDOW_SECS = 60 * 60;

export type MarketPaymentStep = "idle" | "signing" | "submitting" | "success";

function randomNonce(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

type ExecutePaymentArgs = {
  listingId: string;
  amount: string;
  inputs: unknown;
};

export function useMarketPayment() {
  const { address, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();

  const [step, setStep] = useState<MarketPaymentStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MarketCallResponse | null>(null);

  async function executePayment({
    listingId,
    amount,
    inputs,
  }: ExecutePaymentArgs): Promise<MarketCallResponse> {
    if (!address) throw new Error("Connect your wallet first");
    if (!walletClient) throw new Error("Wallet client unavailable");
    if (chainId !== TARGET_CHAIN_ID) {
      throw new Error(`Switch wallet network to chain ${TARGET_CHAIN_ID}`);
    }
    if (!/^\d+$/.test(amount)) {
      throw new Error("Listing price is missing or invalid");
    }

    setError(null);
    setResult(null);
    setStep("signing");

    try {
      const validAfter = BigInt(0);
      const validBefore = BigInt(Math.floor(Date.now() / 1000) + AUTH_WINDOW_SECS);
      const nonce = randomNonce();

      const signature = await walletClient.signTypedData({
        account: address,
        domain: {
          name: "USDC",
          version: "2",
          chainId,
          verifyingContract: USDC_ADDRESS,
        },
        types: receiveWithAuthorizationTypes,
        primaryType: "ReceiveWithAuthorization",
        message: {
          from: address,
          to: CHAIN_LENS_MARKET_ADDRESS,
          value: BigInt(amount),
          validAfter,
          validBefore,
          nonce,
        },
      });

      const parsed = parseSignature(signature);

      setStep("submitting");

      const nextResult = await apiClient.post<MarketCallResponse>(`/market/call/${listingId}`, {
        inputs,
        payment: {
          buyer: address,
          amount,
          validAfter: validAfter.toString(),
          validBefore: validBefore.toString(),
          nonce,
          v: Number(parsed.v),
          r: parsed.r,
          s: parsed.s,
        },
      });

      setResult(nextResult);
      setStep("success");
      return nextResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Payment flow failed";
      setError(message);
      setStep("idle");
      throw err;
    }
  }

  return {
    executePayment,
    step,
    error,
    result,
    isLoading: step === "signing" || step === "submitting",
  };
}
