"use client";

import { useParams } from "next/navigation";
import { useReputation } from "@/hooks/useReputation";
import { ReputationOverview } from "@/components/reputation/ReputationOverview";
import { ReputationStatsGrid } from "@/components/reputation/ReputationStatsGrid";
import { ReputationEarnings } from "@/components/reputation/ReputationEarnings";
import { ReputationCapabilities } from "@/components/reputation/ReputationCapabilities";
import { ReputationMetadata } from "@/components/reputation/ReputationMetadata";
import { ReputationLoading } from "@/components/reputation/ReputationLoading";
import ErrorMessage from "@/components/shared/ErrorMessage";

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

export default function ReputationPage() {
  const params = useParams();
  const raw = params.sellerAddress as string;
  const addr = ADDR_RE.test(raw) ? (raw as `0x${string}`) : undefined;
  const { reputation, loading, error } = useReputation(addr);

  if (!addr) return <ErrorMessage message="Invalid seller address" />;
  if (loading) return <ReputationLoading />;
  if (error || !reputation) return <ErrorMessage message={error ?? "Seller not registered"} />;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <ReputationOverview
        name={reputation.name}
        address={reputation.address}
        active={reputation.active}
        registeredAt={reputation.registeredAt}
      />
      <ReputationStatsGrid
        reputationBps={reputation.reputationBps}
        jobsCompleted={reputation.jobsCompleted}
        jobsFailed={reputation.jobsFailed}
      />
      <ReputationEarnings totalEarnings={reputation.totalEarnings} />
      <ReputationCapabilities capabilities={reputation.capabilities} />
      {reputation.metadataURI && <ReputationMetadata metadataURI={reputation.metadataURI} />}
    </div>
  );
}
