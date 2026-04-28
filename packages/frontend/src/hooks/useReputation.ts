"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";

export interface SellerReputation {
  address: `0x${string}`;
  active: boolean;
  name: string;
  capabilities: `0x${string}`[];
  metadataURI: string;
  registeredAt: string;
  reputationBps: string;
  jobsCompleted: string;
  jobsFailed: string;
  totalEarnings: string;
}

export function useReputation(sellerAddress: `0x${string}` | undefined) {
  const [reputation, setReputation] = useState<SellerReputation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sellerAddress) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const data = await apiClient.get<SellerReputation>(`/reputation/${sellerAddress}`);
        if (!cancelled) setReputation(data);
      } catch (e) {
        if (!cancelled) {
          setReputation(null);
          setError(e instanceof Error ? e.message : "Failed to load reputation");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [sellerAddress]);

  return { reputation, loading, error };
}
