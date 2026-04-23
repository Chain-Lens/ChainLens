"use client";

import { useMemo, useState } from "react";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import ApprovalCard from "@/components/admin/ApprovalCard";
import JobsTab from "@/components/admin/JobsTab";
import SellersTab from "@/components/admin/SellersTab";
import TasksTab from "@/components/admin/TasksTab";
import ConnectButton from "@/components/shared/ConnectButton";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import StatusBadge from "@/components/shared/StatusBadge";
import { useAdmin } from "@/hooks/useAdmin";
import { useAdminAllApis } from "@/hooks/useAdminAllApis";
import { useAdminAuth } from "@/hooks/useAdminAuth";

type AdminTab = "pending" | "apis" | "sellers" | "jobs" | "tasks";

const TABS: Array<{ id: AdminTab; label: string }> = [
  { id: "pending", label: "Pending" },
  { id: "apis", label: "All APIs" },
  { id: "sellers", label: "Sellers" },
  { id: "jobs", label: "Jobs" },
  { id: "tasks", label: "Tasks" },
];

export default function AdminPage() {
  const { isConnected } = useAccount();
  const auth = useAdminAuth();
  const admin = useAdmin();
  const allApis = useAdminAllApis(auth.isAuthenticated);
  const [activeTab, setActiveTab] = useState<AdminTab>("pending");

  const apiSummary = useMemo(() => {
    const rows = allApis.apis;
    return {
      total: rows.length,
      pending: rows.filter((api) => api.status === "PENDING").length,
      approved: rows.filter((api) => api.status === "APPROVED").length,
      rejected: rows.filter((api) => api.status === "REJECTED").length,
    };
  }, [allApis.apis]);

  if (!auth.isAuthenticated) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <section className="card p-6">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--text3)]">
            Admin
          </p>
          <h1 className="mt-2 text-2xl font-bold text-[var(--text)]">
            ChainLens Admin
          </h1>
          <p className="mt-2 text-sm text-[var(--text2)]">
            Connect an authorized admin wallet and sign in to approve listings,
            inspect sellers, and manage operational queues.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <ConnectButton />
            <button
              type="button"
              onClick={auth.signIn}
              disabled={!isConnected || auth.loading}
              className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
            >
              {auth.loading ? "Signing..." : "Sign in as admin"}
            </button>
          </div>

          {!isConnected && (
            <p className="mt-3 text-xs text-[var(--text3)]">
              Wallet connection is required before SIWE admin login.
            </p>
          )}
          {auth.error && (
            <p className="mt-3 text-sm text-[var(--red)]">{auth.error}</p>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--text3)]">
            Admin
          </p>
          <h1 className="mt-2 text-3xl font-bold text-[var(--text)]">
            Operations Console
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--text2)]">
            Review pending APIs, monitor seller health, and handle operational
            exceptions from one place.
          </p>
        </div>
        <button
          type="button"
          onClick={auth.signOut}
          className="btn-secondary px-4 py-2 text-sm"
        >
          Sign out
        </button>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <StatCard label="Total APIs" value={apiSummary.total} />
        <StatCard label="Pending" value={apiSummary.pending} />
        <StatCard label="Approved" value={apiSummary.approved} />
        <StatCard label="Rejected" value={apiSummary.rejected} />
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-[8px] border px-3 py-1.5 text-sm transition-colors ${
              activeTab === tab.id
                ? "border-[var(--accent)] bg-[var(--bg3)] text-[var(--text)]"
                : "border-[var(--border)] text-[var(--text3)] hover:bg-[var(--bg3)] hover:text-[var(--text)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "pending" && (
        <PendingTab
          loading={admin.loading}
          error={admin.error}
          pendingCount={admin.pendingApis.length}
        >
          {admin.pendingApis.map((api) => (
            <ApprovalCard
              key={api.id}
              api={api}
              onApprove={async (id, reason) => {
                await admin.approve(id, reason);
                allApis.refetch();
              }}
              onReject={async (id, reason) => {
                await admin.reject(id, reason);
                allApis.refetch();
              }}
              onRunTest={admin.testApi}
            />
          ))}
        </PendingTab>
      )}

      {activeTab === "apis" && (
        <AllApisTab
          loading={allApis.loading}
          error={allApis.error}
          apis={allApis.apis}
        />
      )}
      {activeTab === "sellers" && <SellersTab enabled={activeTab === "sellers"} />}
      {activeTab === "jobs" && <JobsTab enabled={activeTab === "jobs"} />}
      {activeTab === "tasks" && <TasksTab enabled={activeTab === "tasks"} />}
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[8px] border border-[var(--border)] bg-[var(--bg2)] p-4">
      <div className="text-xs text-[var(--text3)]">{label}</div>
      <div className="mt-1 text-xl font-semibold text-[var(--text)]">{value}</div>
    </div>
  );
}

function PendingTab({
  loading,
  error,
  pendingCount,
  children,
}: {
  loading: boolean;
  error: string | null;
  pendingCount: number;
  children: React.ReactNode;
}) {
  if (loading) return <LoadingSpinner />;
  if (error) return <p className="text-[var(--red)]">{error}</p>;
  if (pendingCount === 0) {
    return (
      <div className="rounded-[8px] border border-[var(--border)] bg-[var(--bg2)] px-6 py-12 text-center">
        <p className="text-[var(--text2)]">No pending listings.</p>
      </div>
    );
  }
  return <div className="grid gap-4 lg:grid-cols-2">{children}</div>;
}

function AllApisTab({
  loading,
  error,
  apis,
}: {
  loading: boolean;
  error: string | null;
  apis: Array<{
    id: string;
    name: string;
    category: string;
    status: string;
    price: string;
    sellerAddress: string;
    createdAt: string;
    _count: { payments: number };
  }>;
}) {
  if (loading) return <LoadingSpinner />;
  if (error) return <p className="text-[var(--red)]">{error}</p>;

  return (
    <div className="card overflow-hidden border-[var(--border)] p-0">
      <table className="w-full text-sm">
        <thead className="border-b border-[var(--border)] bg-[var(--bg3)]">
          <tr>
            {["API", "Status", "Seller", "Price", "Calls", "Created"].map((h) => (
              <th
                key={h}
                className={`px-4 py-3 text-left font-medium text-[var(--text2)] ${
                  h === "Price" || h === "Calls" ? "text-right" : ""
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {apis.map((api, i) => (
            <tr
              key={api.id}
              className={`${i > 0 ? "border-t border-[var(--border)]" : ""} hover:bg-[var(--bg3)]`}
            >
              <td className="px-4 py-3">
                <div className="font-medium text-[var(--text)]">{api.name}</div>
                <div className="text-xs text-[var(--text3)]">{api.category}</div>
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={api.status} />
              </td>
              <td className="px-4 py-3 font-mono text-xs text-[var(--text3)]">
                {shortAddress(api.sellerAddress)}
              </td>
              <td className="px-4 py-3 text-right text-[var(--text2)]">
                {formatUnits(BigInt(api.price), 6)} USDC
              </td>
              <td className="px-4 py-3 text-right text-[var(--text2)]">
                {api._count.payments}
              </td>
              <td className="px-4 py-3 text-xs text-[var(--text3)]">
                {new Date(api.createdAt).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {apis.length === 0 && (
        <p className="py-8 text-center text-[var(--text2)]">No APIs found.</p>
      )}
    </div>
  );
}

function shortAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
