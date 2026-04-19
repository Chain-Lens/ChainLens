"use client";

import { useEffect } from "react";
import { useAccount } from "wagmi";
import { usePayment } from "@/hooks/usePayment";
import type { ApiListingPublic } from "@chainlens/shared";

type Props = {
  api: ApiListingPublic;
  onPurchaseSuccess: (requestId: string) => void;
};

export default function PurchaseButton({ api, onPurchaseSuccess }: Props) {
  const { address, isConnected } = useAccount();
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
      onPurchaseSuccess(prepareData.requestId);
    }
  }, [isConfirmed, onPurchaseSuccess, prepareData]);

  if (!isConnected) {
    return (
      <p className="py-4 text-center text-[var(--text2)]">
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
        <p className="text-center text-sm text-[var(--red)]">{prepareError}</p>
      )}
    </div>
  );
}
