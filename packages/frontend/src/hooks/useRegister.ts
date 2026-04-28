"use client";

import { useState } from "react";
import { apiClient } from "@/lib/api-client";

interface RegisterData {
  name: string;
  description: string;
  endpoint: string;
  price: string;
  sellerAddress: string;
  category?: string;
}

export function useRegister() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string } | null>(null);

  async function register(data: RegisterData) {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.post<{ id: string }>("/apis/register", data);
      setResult(res);
      return res;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to register API";
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  return { register, loading, error, result };
}
