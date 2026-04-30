"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";

/**
 * Bridges the old `/apis/:id` (UUID or numeric) route to the canonical
 * `/discover/:onChainId`. Numeric ids redirect immediately; UUIDs need
 * the seller-listings lookup to resolve their onChainId. Returns an
 * error message only when the lookup fails to find a match.
 */
export function useLegacyApiRedirect(id: string): { error: string | null } {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      if (/^\d+$/.test(id)) {
        router.replace(`/discover/${id}`);
        return;
      }

      try {
        const apis =
          await apiClient.get<Array<{ id: string; onChainId: number | null }>>("/seller/listings");
        const match = apis.find((api) => api.id === id && typeof api.onChainId === "number");
        if (match) {
          router.replace(`/discover/${match.onChainId}`);
          return;
        }
      } catch {
        // Best-effort bridge for legacy UUID routes from the seller dashboard.
      }

      if (!cancelled) {
        setError("API not found");
      }
    }

    void resolve();

    return () => {
      cancelled = true;
    };
  }, [id, router]);

  return { error };
}
