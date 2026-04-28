"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import StatusBadge from "@/components/shared/StatusBadge";
import { fetchRequestStatus, refundRequest, type RequestWithApi } from "@/lib/requests";

const STEPS = ["PENDING", "PAID", "EXECUTING", "COMPLETED"];

type RequestStatusContentProps = {
  initialError: string | null;
  initialRequest: RequestWithApi | null;
  requestId: string;
};

export default function RequestStatusContent({
  initialError,
  initialRequest,
  requestId,
}: RequestStatusContentProps) {
  const { address } = useAccount();
  const [request, setRequest] = useState<RequestWithApi | null>(initialRequest);
  const [error, setError] = useState<string | null>(initialError);
  const [refreshing, setRefreshing] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);

    try {
      const nextRequest = await fetchRequestStatus(requestId);
      setRequest(nextRequest);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load request");
    } finally {
      setRefreshing(false);
    }
  };

  const handleRefund = async () => {
    if (!address) return;

    setRefunding(true);
    setRefundError(null);

    try {
      await refundRequest(requestId, address);
      const nextRequest = await fetchRequestStatus(requestId);
      setRequest(nextRequest);
      setError(null);
    } catch (err) {
      setRefundError(err instanceof Error ? err.message : "Refund failed");
    } finally {
      setRefunding(false);
    }
  };

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <p className="text-[var(--red)]">{error}</p>
      </div>
    );
  }

  if (!request) return null;

  const currentStepIndex = STEPS.indexOf(request.status);
  const isTerminal = ["COMPLETED", "REFUNDED", "FAILED"].includes(request.status);
  const isStuck = ["PAID", "EXECUTING"].includes(request.status);
  const isBuyer = address && request.buyer.toLowerCase() === address.toLowerCase();
  const isFailed = request.status === "REFUNDED" || request.status === "FAILED";
  const completedStepClass = isFailed
    ? "bg-[var(--red)] text-white"
    : "bg-[var(--accent)] text-white";
  const pendingStepClass = "border border-[var(--border2)] bg-[var(--bg3)] text-[var(--text3)]";

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="mb-2 text-2xl font-bold text-[var(--text)]">Request Status</h1>
          <p className="font-mono text-sm text-[var(--text3)]">{requestId}</p>
        </div>
        {!isTerminal && (
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="btn-secondary px-4 py-2 text-sm"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        )}
      </div>

      <div className="card mb-6">
        <div className="mb-6 flex justify-between">
          {STEPS.map((step, i) => (
            <div key={step} className="flex flex-1 flex-col items-center">
              <div
                className={`mb-2 flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                  i <= currentStepIndex ? completedStepClass : pendingStepClass
                }`}
              >
                {i + 1}
              </div>
              <span className="text-xs text-[var(--text2)]">{step}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-center gap-2">
          <span className="text-sm text-[var(--text2)]">Current:</span>
          <StatusBadge status={request.status} />
        </div>
      </div>

      <div className="card space-y-4">
        <h2 className="text-lg font-semibold text-[var(--text)]">Details</h2>

        {request.api && (
          <div>
            <span className="text-sm text-[var(--text2)]">API: </span>
            <span className="font-medium text-[var(--text)]">{request.api.name}</span>
          </div>
        )}

        <div>
          <span className="text-sm text-[var(--text2)]">Amount: </span>
          <span className="font-mono text-[var(--text)]">
            {(Number(request.amount) / 1_000_000).toFixed(2)} USDC
          </span>
        </div>

        {request.txHash && (
          <div>
            <span className="text-sm text-[var(--text2)]">Payment TX: </span>
            <span className="font-mono text-xs break-all text-[var(--cyan)]">{request.txHash}</span>
          </div>
        )}

        {request.completionTxHash && (
          <div>
            <span className="text-sm text-[var(--text2)]">Settlement TX: </span>
            <span className="font-mono text-xs break-all text-[var(--cyan)]">
              {request.completionTxHash}
            </span>
          </div>
        )}

        {request.errorMessage && (
          <div className="rounded-lg border border-[rgba(248,81,73,0.3)] bg-[rgba(248,81,73,0.1)] p-4">
            <span className="text-sm font-medium text-[var(--red)]">Error: </span>
            <span className="text-sm text-[var(--red)]">{request.errorMessage}</span>
          </div>
        )}

        {request.result != null && (
          <div>
            <h3 className="mb-2 text-sm font-medium text-[var(--text2)]">API Response</h3>
            <pre className="overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 font-mono text-sm text-[var(--text)]">
              {JSON.stringify(request.result, null, 2)}
            </pre>
          </div>
        )}

        {!isTerminal && (
          <p className="text-center text-sm text-[var(--text3)]">
            Use refresh to check the latest settlement status.
          </p>
        )}

        {isStuck && isBuyer && (
          <div className="mt-2 border-t border-[var(--border)] pt-4">
            <p className="mb-3 text-xs text-[var(--text2)]">
              If settlement doesn't complete within 5 minutes after payment, you can request a
              refund.
            </p>
            {refundError && <p className="mb-2 text-xs text-[var(--red)]">{refundError}</p>}
            <button
              type="button"
              onClick={handleRefund}
              disabled={refunding || refreshing}
              className="w-full rounded-lg bg-[var(--red)] px-4 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {refunding ? "Processing refund..." : "Request Refund"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
