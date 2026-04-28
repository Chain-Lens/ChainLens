"use client";

import { useEffect, useState, useCallback } from "react";
import { apiClient } from "@/lib/api-client";
import type { ApiListing, ApiStatus } from "@chain-lens/shared";

export function useAdmin() {
  const [pendingApis, setPendingApis] = useState<ApiListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPending = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<ApiListing[]>("/admin/apis");
      setPendingApis(data.filter((api) => api.status === ("PENDING" as ApiStatus)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pending APIs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  async function approve(apiId: string, reason?: string) {
    const data = await apiClient.post<{ onChainId: number; txHash: string }>(
      `/admin/apis/${apiId}/approve`,
      { reason },
    );
    await fetchPending();
    return data;
  }

  async function reject(apiId: string, reason?: string) {
    await apiClient.post(`/admin/apis/${apiId}/reject`, { reason });
    await fetchPending();
  }

  async function testApi(apiId: string, payload?: unknown, method?: string) {
    const data = await apiClient.post<{
      status: number | null;
      body: unknown;
      error: string | null;
      injectionFree: boolean;
      latencyMs: number;
    }>(`/admin/apis/${apiId}/test`, { payload, method });

    return data as {
      status: number | null;
      body: unknown;
      error: string | null;
      injectionFree: boolean;
      latencyMs: number;
    };
  }

  return { pendingApis, loading, error, approve, reject, testApi, refetch: fetchPending };
}
