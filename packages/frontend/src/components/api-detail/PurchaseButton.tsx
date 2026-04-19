"use client";

import { useAccount } from "wagmi";
import { useRouter } from "next/navigation";
import { usePayment } from "@/hooks/usePayment";
import { useEffect } from "react";
import type { ApiListingPublic } from "@chainlens/shared";

export default function PurchaseButton({ api }: { api: ApiListingPublic }) {
  const { address, isConnected } = useAccount();
  const router = useRouter();
  const {
    prepare,
    pay,
    prepareData,
    isPreparing,
    prepareError,
    isWriting,
    isConfirming,
    isConfirmed,
    step,
  } = usePayment();

  useEffect(() => {
    if (isConfirmed && prepareData) {
      router.push(`/requests/${prepareData.requestId}`);
    }
  }, [isConfirmed, prepareData, router]);

  if (!isConnected) {
    return (
      <p className="text-center py-4" style={{ color: "var(--text2)" }}>
        Connect your wallet to purchase this API
      </p>
    );
  }

  async function handlePurchase() {
    if (!address || !api.onChainId) return;

    try {
      const data = await prepare(api.id, address);
      pay(data.onChainApiId, data.seller, data.amount);
    } catch {
      // Error handled in hook state
    }
  }

  const isLoading = isPreparing || isWriting || isConfirming;

  return (
    <div className="space-y-3">
      <button
        onClick={handlePurchase}
        disabled={isLoading}
        className="w-full btn-primary py-3 text-lg"
      >
        {isPreparing
          ? "Preparing..."
          : step === "approving" && (isWriting || isConfirming)
            ? isWriting ? "Approve USDC in wallet..." : "Approving USDC..."
            : step === "paying" && (isWriting || isConfirming)
              ? isWriting ? "Confirm payment in wallet..." : "Confirming payment..."
              : "Purchase API"}
      </button>

      {prepareError && (
        <p className="text-sm text-center" style={{ color: "var(--red)" }}>{prepareError}</p>
      )}
    </div>
  );
}
