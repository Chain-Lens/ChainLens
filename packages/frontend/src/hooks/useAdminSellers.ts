"use client";

import { useState, useEffect } from "react";
import { apiClient } from "@/lib/api-client";

export interface AdminSeller {
  address: string;
  listingCount: number;
  registered: boolean;
  active: boolean;
  name: string | null;
  jobsCompleted: number;
  jobsFailed: number;
  earningsUsdcAtomic: string;
}

export function useAdminSellers(enabled: boolean) {
  const [sellers, setSellers] = useState<AdminSeller[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    apiClient
      .get<{ items: AdminSeller[] }>("/admin/sellers")
      .then((res) =>
        setSellers(
          res.items.map((seller) => ({
            ...seller,
            registered: seller.registered ?? false,
            active: seller.active ?? false,
            name: seller.name ?? null,
            jobsCompleted: seller.jobsCompleted ?? 0,
            jobsFailed: seller.jobsFailed ?? 0,
            earningsUsdcAtomic: seller.earningsUsdcAtomic ?? "0",
          })),
        ),
      )
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load sellers");
      })
      .finally(() => setLoading(false));
  }, [enabled]);

  return { sellers, loading, error };
}
