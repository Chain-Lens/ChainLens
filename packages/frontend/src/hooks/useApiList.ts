"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { mockApis } from "@/lib/mock-data";
import type { ApiListingPublic } from "@chainlens/shared";

export function useApiList(filters?: { category?: string; search?: string }) {
  const [apis, setApis] = useState<ApiListingPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMock, setIsMock] = useState(false);

  useEffect(() => {
    async function fetchApis() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (filters?.category) params.set("category", filters.category);
        if (filters?.search) params.set("search", filters.search);

        const query = params.toString() ? `?${params.toString()}` : "";
        const data = await apiClient.get<ApiListingPublic[]>(
          `/apis${query}`
        );
        setApis(data);
        setIsMock(false);
      } catch {
        // Fallback to mock data when backend is unavailable
        let filtered = mockApis;
        if (filters?.category) {
          filtered = filtered.filter((a) => a.category === filters.category);
        }
        if (filters?.search) {
          const q = filters.search.toLowerCase();
          filtered = filtered.filter(
            (a) =>
              a.name.toLowerCase().includes(q) ||
              a.description.toLowerCase().includes(q)
          );
        }
        setApis(filtered);
        setIsMock(true);
      } finally {
        setLoading(false);
      }
    }
    fetchApis();
  }, [filters?.category, filters?.search]);

  return { apis, loading, error, isMock };
}
