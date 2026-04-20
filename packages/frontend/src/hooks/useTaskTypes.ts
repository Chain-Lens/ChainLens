"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";

export interface TaskTypeItem {
  id: string;
  name: string;
  schemaURI: string;
  maxResponseTime: number;
  minBudget: string;
  enabled: boolean;
  registeredAt: number;
}

/**
 * Fetches enabled task types from the backend (/api/task-types), which in
 * turn reads TaskTypeRegistry on-chain. Admin can register/toggle task
 * types without a code change — the dropdown updates on next backend
 * cache miss (30s TTL).
 */
export function useTaskTypes() {
  const [taskTypes, setTaskTypes] = useState<TaskTypeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiClient
      .get<{ items: TaskTypeItem[] }>("/task-types")
      .then((res) => {
        if (!cancelled) setTaskTypes(res.items);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load task types");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { taskTypes, loading, error };
}
