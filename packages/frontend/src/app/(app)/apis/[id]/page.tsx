"use client";

import { useParams, useRouter } from "next/navigation";
import { useApiDetail } from "@/hooks/useApiDetail";
import ApiInfo from "@/components/api-detail/ApiInfo";
import PurchaseButton from "@/components/api-detail/PurchaseButton";
import LoadingSpinner from "@/components/shared/LoadingSpinner";

export default function ApiDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { api, loading, error, isMock } = useApiDetail(id);

  if (loading) return <LoadingSpinner />;
  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <p className="text-[var(--red)]">{error}</p>
      </div>
    );
  }
  if (!api) return null;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {isMock && (
        <div
          className="mb-6 rounded-lg border border-[rgba(210,153,34,0.3)] bg-[rgba(210,153,34,0.1)] px-4 py-3 text-sm text-[#e3b341]"
        >
          Showing demo data — backend is not connected
        </div>
      )}
      <ApiInfo api={api} />
      <div className="mt-6">
        <PurchaseButton
          api={api}
          onPurchaseSuccess={(requestId) => router.push(`/requests/${requestId}`)}
        />
      </div>
    </div>
  );
}
