"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { mockApis } from "@/lib/mock-data";
import type { ApiListingPublic } from "@chain-lens/shared";

export function useApiDetail(id: string) {
  const [api, setApi] = useState<ApiListingPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMock, setIsMock] = useState(false);

  useEffect(() => {
    async function fetchApi() {
      setLoading(true);
      setError(null);
      try {
        const data = await apiClient.get<ApiListingPublic>(`/apis/${id}`);
        setApi(data);
        setIsMock(false);
      } catch {
        // Fallback to mock data when backend is unavailable
        const mockApi = mockApis.find((a) => a.id === id);
        if (mockApi) {
          setApi(mockApi);
          setIsMock(true);
        } else {
          setError("API not found");
        }
      } finally {
        setLoading(false);
      }
    }
    fetchApi();
  }, [id]);

  return { api, loading, error, isMock };
}
