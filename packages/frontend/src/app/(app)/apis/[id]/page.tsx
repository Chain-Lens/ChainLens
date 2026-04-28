"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import LoadingSpinner from "@/components/shared/LoadingSpinner";

export default function ApiDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function resolveLegacyRoute() {
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

    void resolveLegacyRoute();

    return () => {
      cancelled = true;
    };
  }, [id, router]);

  if (!error) return <LoadingSpinner />;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <p className="text-[var(--red)]">{error}</p>
    </div>
  );
}
