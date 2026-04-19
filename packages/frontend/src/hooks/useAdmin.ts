"use client";

import { useEffect, useState, useCallback } from "react";
import { apiClient } from "@/lib/api-client";
import type { ApiListing } from "@chain-lens/shared";

export function useAdmin() {
  const [pendingApis, setPendingApis] = useState<ApiListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPending = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<ApiListing[]>(
        "/apis?status=PENDING"
      );
      setPendingApis(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load pending APIs"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  async function approve(apiId: string, reason?: string) {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001/api"}/admin/apis/${apiId}/approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason }),
      }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error?.message || "Failed to approve");
    }
    await fetchPending();
    return res.json();
  }

  async function reject(apiId: string, reason?: string) {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001/api"}/admin/apis/${apiId}/reject`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason }),
      }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error?.message || "Failed to reject");
    }
    await fetchPending();
  }

  async function testApi(apiId: string, payload?: unknown, method?: string) {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001/api"}/admin/apis/${apiId}/test`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ payload, method }),
      }
    );
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error?.message || "Failed to test API");
    }
    return data as {
      status: number | null;
      body: unknown;
      error: string | null;
      latencyMs: number;
    };
  }

  return { pendingApis, loading, error, approve, reject, testApi, refetch: fetchPending };
}
