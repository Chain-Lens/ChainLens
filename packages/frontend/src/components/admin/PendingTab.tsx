"use client";

import type { ApiListing } from "@chain-lens/shared";
import ApprovalCard from "./ApprovalCard";
import LoadingSpinner from "@/components/shared/LoadingSpinner";

type ApproveFn = (id: string, reason?: string) => Promise<void>;
type TestFn = (
  apiId: string,
  payload?: unknown,
  method?: string,
) => Promise<Awaited<ReturnType<React.ComponentProps<typeof ApprovalCard>["onRunTest"]>>>;

export default function PendingTab({
  loading,
  error,
  apis,
  onApprove,
  onReject,
  onRunTest,
}: {
  loading: boolean;
  error: string | null;
  apis: ApiListing[];
  onApprove: ApproveFn;
  onReject: ApproveFn;
  onRunTest: TestFn;
}) {
  if (loading) return <LoadingSpinner />;
  if (error) return <p className="text-[var(--red)]">{error}</p>;
  if (apis.length === 0) {
    return (
      <div className="rounded-[8px] border border-[var(--border)] bg-[var(--bg2)] px-6 py-12 text-center">
        <p className="text-[var(--text2)]">No pending listings.</p>
      </div>
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {apis.map((api) => (
        <ApprovalCard
          key={api.id}
          api={api}
          onApprove={onApprove}
          onReject={onReject}
          onRunTest={onRunTest}
        />
      ))}
    </div>
  );
}
