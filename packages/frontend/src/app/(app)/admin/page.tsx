"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { formatUnits } from "viem";
import { useAdmin } from "@/hooks/useAdmin";
import { apiClient } from "@/lib/api-client";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useAdminAllApis } from "@/hooks/useAdminAllApis";
import ApprovalCard from "@/components/admin/ApprovalCard";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import StatusBadge from "@/components/shared/StatusBadge";

const ADMIN_ADDRESSES = (process.env.NEXT_PUBLIC_ADMIN_ADDRESSES || "")
  .split(",")
  .map((a) => a.trim().toLowerCase())
  .filter(Boolean);

export default function AdminPage() {
  const { address, isConnected } = useAccount();
  const { isAuthenticated, signIn, signOut, loading: authLoading, error: authError } = useAdminAuth();
  const { pendingApis, loading, error, approve, reject, testApi } = useAdmin();
  const { apis: allApis, loading: allLoading, error: allError, refetch: refetchAll } = useAdminAllApis(isAuthenticated);
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isAdminWallet = isConnected && address && ADMIN_ADDRESSES.includes(address.toLowerCase());

  if (!isConnected) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <h1 className="mb-4 text-3xl font-bold text-[var(--text)]">Admin Dashboard</h1>
        <p className="mb-6 text-[var(--text2)]">Connect your admin wallet to continue.</p>
        <div className="flex justify-center">
          <ConnectButton />
        </div>
      </div>
    );
  }

  if (!isAdminWallet) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="text-5xl mb-4">🚫</div>
        <h1 className="mb-2 text-2xl font-bold text-[var(--text)]">Access Denied</h1>
        <p className="mb-1 text-[var(--text2)]">This wallet is not authorized.</p>
        <p className="mt-2 font-mono text-sm text-[var(--text3)]">{address}</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <h1 className="mb-2 text-3xl font-bold text-[var(--text)]">Admin Dashboard</h1>
        <p className="mb-6 text-[var(--text2)]">
          Sign the message with your wallet to verify ownership.
        </p>
        {authError && (
          <p className="mb-4 text-sm text-[var(--red)]">{authError}</p>
        )}
        <button
          onClick={signIn}
          disabled={authLoading}
          className="btn-primary px-6 py-3"
        >
          {authLoading ? "Waiting for signature..." : "Sign in with Wallet"}
        </button>
        <p className="mt-4 font-mono text-xs text-[var(--text3)]">{address}</p>
      </div>
    );
  }

  async function handleApprove(apiId: string, reason?: string) {
    await approve(apiId, reason);
  }

  async function handleReject(apiId: string, reason?: string) {
    await reject(apiId, reason);
  }

  async function handleAdminDelete(apiId: string) {
    if (!confirm("Delete this API? This cannot be undone.")) return;
    setDeletingId(apiId);
    try {
      await apiClient.delete(`/admin/apis/${apiId}`);
      refetchAll();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-[var(--text)]">Admin Dashboard</h1>
        <button
          onClick={signOut}
          className="text-sm text-[var(--text3)] transition-colors hover:text-[var(--text2)]"
        >
          Sign out
        </button>
      </div>

      {/* 탭 */}
      <div className="mb-6 flex gap-1 border-b border-[var(--border)]">
        {(["pending", "all"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? "border-[var(--green)] text-[var(--green)]"
                : "border-transparent text-[var(--text2)]"
            }`}
          >
            {t === "pending" ? "Pending Review" : "All APIs"}
            {t === "pending" && pendingApis.length > 0 && (
              <span className="ml-2 rounded-full bg-[rgba(227,179,65,0.2)] px-1.5 py-0.5 text-xs text-[#e3b341]">
                {pendingApis.length}
              </span>
            )}
            {t === "all" && allApis.length > 0 && (
              <span className="ml-2 rounded-full bg-[var(--bg3)] px-1.5 py-0.5 text-xs text-[var(--text2)]">
                {allApis.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Pending 탭 */}
      {tab === "pending" && (
        <>
          {loading && <LoadingSpinner />}
          {error && <p className="text-[var(--red)]">{error}</p>}
          {!loading && !error && pendingApis.length === 0 && (
            <div className="card py-8 text-center text-[var(--text2)]">
              No pending APIs to review
            </div>
          )}
          <div className="space-y-4">
            {pendingApis.map((api) => (
              <ApprovalCard
                key={api.id}
                api={api}
                onApprove={handleApprove}
                onReject={handleReject}
                onRunTest={testApi}
              />
            ))}
          </div>
        </>
      )}

      {/* All APIs 탭 */}
      {tab === "all" && (
        <>
          {allLoading && <LoadingSpinner />}
          {allError && <p className="mb-4 text-[var(--red)]">{allError}</p>}
          {!allLoading && (
            <div className="card overflow-hidden border-[var(--border)] p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--border)] bg-[var(--bg3)]">
                  <tr>
                    {["Name", "Category", "Status", "Price", "Calls", "Seller", ""].map((h) => (
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
                  {allApis.map((api, i) => (
                    <tr
                      key={api.id}
                      className={`${i > 0 ? "border-t border-[var(--border)]" : ""} hover:bg-[var(--bg3)]`}
                    >
                      <td className="px-4 py-3 font-medium text-[var(--text)]">{api.name}</td>
                      <td className="px-4 py-3 capitalize text-[var(--text2)]">{api.category}</td>
                      <td className="px-4 py-3"><StatusBadge status={api.status} /></td>
                      <td className="px-4 py-3 text-right text-[var(--text2)]">
                        {formatUnits(BigInt(api.price), 6)} USDC
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-[var(--green)]">
                        {api._count.payments}
                      </td>
                      <td className="max-w-[160px] truncate px-4 py-3 font-mono text-xs text-[var(--text3)]">
                        {api.sellerAddress}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleAdminDelete(api.id)}
                          disabled={deletingId === api.id}
                          className="text-xs text-[var(--text3)] transition-colors hover:text-[var(--red)] disabled:opacity-40"
                        >
                          {deletingId === api.id ? "..." : "Delete"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {allApis.length === 0 && (
                <p className="py-8 text-center text-[var(--text2)]">No APIs registered yet.</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
