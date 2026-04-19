"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";

export interface JobEvidence {
  onchainJobId: string;
  buyer: string;
  seller: string;
  apiId: string;
  taskType: string | null;
  amount: string;
  inputs: unknown;
  inputsHash: string;
  response: unknown;
  responseHash: string | null;
  evidenceURI: string | null;
  status: "PENDING" | "PAID" | "COMPLETED" | "REFUNDED" | "FAILED";
  errorReason: string | null;
  createdAt: string;
  completedAt: string | null;
}

export function useJob(jobId: string | bigint | undefined) {
  const [job, setJob] = useState<JobEvidence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (jobId === undefined) {
      setLoading(false);
      return;
    }
    const id = jobId.toString();
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const data = await apiClient.get<JobEvidence>(`/evidence/${id}`);
        if (!cancelled) setJob(data);
      } catch (e) {
        if (!cancelled) {
          setJob(null);
          setError(e instanceof Error ? e.message : "Failed to load job");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  return { job, loading, error };
}
