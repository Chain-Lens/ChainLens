"use client";

import { useState, useEffect } from "react";
import { apiClient } from "@/lib/api-client";

export interface AdminApi {
  id: string;
  contractVersion?: string | null;
  onChainId?: number | null;
  name: string;
  category: string;
  status: string;
  price: string;
  sellerAddress: string;
  createdAt: string;
  _count?: { payments?: number };
}

export function useAdminAllApis(isAuthenticated: boolean) {
  const [apis, setApis] = useState<AdminApi[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = () => setTick((t) => t + 1);

  useEffect(() => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    apiClient
      .get<AdminApi[]>("/admin/apis")
      .then((rows) =>
        setApis(
          rows.map((api) => ({
            ...api,
            _count: {
              payments: api._count?.payments ?? 0,
            },
          })),
        ),
      )
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load APIs");
      })
      .finally(() => setLoading(false));
  }, [isAuthenticated, tick]);

  return { apis, loading, error, refetch };
}
