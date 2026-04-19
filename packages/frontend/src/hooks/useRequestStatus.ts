"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import type { PaymentRequest } from "@chainlens/shared";

type RequestWithApi = PaymentRequest & {
  api?: { name: string; description: string };
};

export function useRequestStatus(requestId: string) {
  const [request, setRequest] = useState<RequestWithApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = () => setTick((t) => t + 1);

  useEffect(() => {
    let active = true;
    let intervalId: ReturnType<typeof setInterval>;

    async function fetch() {
      try {
        const data = await apiClient.get<RequestWithApi>(
          `/requests/${requestId}`
        );
        if (active) {
          setRequest(data);
          setLoading(false);

          // Stop polling if terminal state
          if (
            ["COMPLETED", "REFUNDED", "FAILED"].includes(data.status)
          ) {
            clearInterval(intervalId);
          }
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Failed to load request"
          );
          setLoading(false);
        }
      }
    }

    fetch();
    intervalId = setInterval(fetch, 3000);

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [requestId, tick]);

  return { request, loading, error, refetch };
}
