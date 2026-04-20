"use client";

import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/api-client";
import type { TaskTypeItem } from "@/hooks/useTaskTypes";

export function useAdminTaskTypes(enabled: boolean) {
  const [taskTypes, setTaskTypes] = useState<TaskTypeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [togglingName, setTogglingName] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    // enabled_only=false so admin can see and re-enable disabled types.
    apiClient
      .get<{ items: TaskTypeItem[] }>("/task-types?enabled_only=false")
      .then((res) => setTaskTypes(res.items))
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load task types");
      })
      .finally(() => setLoading(false));
  }, [enabled, tick]);

  async function toggle(name: string, newEnabled: boolean): Promise<string> {
    setTogglingName(name);
    try {
      const result = await apiClient.post<{ taskType: string; enabled: boolean; txHash: string }>(
        `/admin/task-types/${name}/toggle`,
        { enabled: newEnabled },
      );
      refetch();
      return result.txHash;
    } finally {
      setTogglingName(null);
    }
  }

  return { taskTypes, loading, error, refetch, toggle, togglingName };
}
