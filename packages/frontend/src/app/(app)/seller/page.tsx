"use client";

import { useEffect } from "react";
import { useAccount } from "wagmi";
import { useSellerApis } from "@/hooks/useSellerApis";
import { useSellerAuth } from "@/hooks/useSellerAuth";
import { useClaim } from "@/hooks/useClaim";
import { apiClient } from "@/lib/api-client";
import SellerNotConnected from "@/components/seller/SellerNotConnected";
import SellerPageHeader from "@/components/seller/SellerPageHeader";
import SellerAuthBanner from "@/components/seller/SellerAuthBanner";
import SellerClaimCard from "@/components/seller/SellerClaimCard";
import SellerStatRow from "@/components/seller/SellerStatRow";
import SellerApiList from "@/components/seller/SellerApiList";
import type { SellerPatch } from "@/components/seller/SellerEditForm";

export default function SellerPage() {
  const { address, isConnected } = useAccount();
  const sellerAuth = useSellerAuth();
  const { apis, loading, error, refetch } = useSellerApis(address, {
    authenticated: sellerAuth.isAuthenticated,
  });
  const {
    pendingAmount,
    claim,
    isPending,
    isConfirming,
    isConfirmed,
    refetch: refetchClaim,
  } = useClaim(address);

  useEffect(() => {
    if (isConfirmed) refetchClaim();
  }, [isConfirmed, refetchClaim]);

  if (!isConnected) return <SellerNotConnected />;

  const summary = {
    total: apis.length,
    approved: apis.filter((a) => a.status === "APPROVED").length,
    pending: apis.filter((a) => a.status === "PENDING").length,
    rejected: apis.filter((a) => a.status === "REJECTED").length,
    totalSales: apis.reduce((sum, a) => sum + a._count.payments, 0),
  };

  async function handleDelete(apiId: string) {
    if (!confirm("Are you sure you want to delete?")) return;
    await apiClient.delete(`/seller/listings/${apiId}`);
    refetch();
  }

  async function handleEdit(apiId: string, patch: SellerPatch) {
    await apiClient.patch(`/seller/listings/${apiId}`, patch);
    refetch();
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <SellerPageHeader address={address ?? ""} />
      <SellerAuthBanner auth={sellerAuth} />
      <SellerClaimCard
        pendingAmount={pendingAmount}
        isPending={isPending}
        isConfirming={isConfirming}
        isConfirmed={isConfirmed}
        onClaim={claim}
      />
      <SellerStatRow {...summary} />
      <SellerApiList
        loading={loading}
        error={error}
        apis={apis}
        editable={sellerAuth.isAuthenticated}
        onDelete={handleDelete}
        onEdit={handleEdit}
      />
    </div>
  );
}
