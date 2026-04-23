"use client";

import { useState, useEffect } from "react";
import { apiClient } from "@/lib/api-client";

export interface SellerApi {
  id: string;
  onChainId: number | null;
  name: string;
  description: string;
  // Only populated from the authenticated /seller/listings endpoint.
  // Public /apis/seller/:address omits it.
  endpoint?: string;
  price: string;
  category: string;
  sellerAddress: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "REVOKED";
  exampleRequest?: unknown;
  exampleResponse?: unknown;
  createdAt: string;
  updatedAt: string;
  _count: { payments: number };
  rejectionReason: string | null;
}

// When `authenticated` flips true, we re-fetch from the owner-scoped
// endpoint so `endpoint` becomes visible. Going false (sign-out) drops
// back to the public endpoint so the page still renders.
export function useSellerApis(
  address: string | undefined,
  options?: { authenticated?: boolean },
) {
  const authenticated = !!options?.authenticated;
  const [apis, setApis] = useState<SellerApi[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    setError(null);
    if (!authenticated) {
      setApis([]);
      setLoading(false);
      return;
    }
    apiClient
      .get<SellerApi[]>(`/seller/listings`)
      .then(setApis)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load APIs"),
      )
      .finally(() => setLoading(false));
  }, [address, authenticated, tick]);

  const refetch = () => setTick((t) => t + 1);

  return { apis, loading, error, refetch };
}