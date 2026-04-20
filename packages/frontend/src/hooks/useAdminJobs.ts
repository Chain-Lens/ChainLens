"use client";

import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/api-client";

export interface AdminJob {
  onchainJobId: string;
  buyer: string;
  seller: string;
  apiId: string;
  taskType: string;
  amount: string;
  inputs: unknown;
  inputsHash: string;
  response: unknown;
  responseHash: string | null;
  evidenceURI: string | null;
  status: string;
  errorReason: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface JobsPage {
  items: AdminJob[];
  total: number;
  limit: number;
  offset: number;
}

export function useAdminJobs(enabled: boolean) {
  const [jobs, setJobs] = useState<AdminJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    apiClient
      .get<JobsPage>("/jobs?limit=100")
      .then((page) => setJobs(page.items))
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load jobs");
      })
      .finally(() => setLoading(false));
  }, [enabled, tick]);

  async function refund(jobId: string): Promise<string> {
    setRefundingId(jobId);
    try {
      const result = await apiClient.post<{ jobId: string; txHash: string }>(
        `/admin/jobs/${jobId}/refund`,
        {},
      );
      refetch();
      return result.txHash;
    } finally {
      setRefundingId(null);
    }
  }

  return { jobs, loading, error, refetch, refund, refundingId };
}
