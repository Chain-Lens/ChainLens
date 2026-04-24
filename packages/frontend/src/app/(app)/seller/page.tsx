"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import Link from "next/link";
import { formatUnits } from "viem";
import StatusBadge from "@/components/shared/StatusBadge";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { useSellerApis, type SellerApi } from "@/hooks/useSellerApis";
import { useSellerAuth } from "@/hooks/useSellerAuth";
import { useClaim } from "@/hooks/useClaim";
import { apiClient } from "@/lib/api-client";

export default function SellerPage() {
  const { address, isConnected } = useAccount();
  const sellerAuth = useSellerAuth();
  const { apis, loading, error, refetch } = useSellerApis(address, {
    authenticated: sellerAuth.isAuthenticated,
  });
  const { pendingAmount, claim, isPending, isConfirming, isConfirmed, refetch: refetchClaim } =
    useClaim(address);

  useEffect(() => {
    if (isConfirmed) refetchClaim();
  }, [isConfirmed, refetchClaim]);

  if (!isConnected) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <h1 className="mb-4 text-3xl font-bold text-[var(--text)]">My APIs</h1>
        <p className="text-[var(--text2)]">
          Connect your wallet to view your registered APIs.
        </p>
      </div>
    );
  }

  const summary = {
    total: apis.length,
    approved: apis.filter((a) => a.status === "APPROVED").length,
    pending:  apis.filter((a) => a.status === "PENDING").length,
    rejected: apis.filter((a) => a.status === "REJECTED").length,
    totalSales: apis.reduce((sum, a) => sum + a._count.payments, 0),
  };

  const hasPending = pendingAmount > BigInt(0);

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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-[var(--text)]">My APIs</h1>
          <p className="mt-1 font-mono text-sm text-[var(--text3)]">{address}</p>
        </div>
        <Link href="/register" className="btn-primary px-4 py-2 text-sm">
          + Register New API
        </Link>
      </div>

      {/* Seller sign-in — reveals endpoint + unlocks editing. Stays a
          thin banner so sellers can still browse status without signing. */}
      <SellerAuthBanner auth={sellerAuth} />

      {/* Claim earnings */}
      <div
        className={`card mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center ${
          hasPending
            ? "border-[rgba(63,185,80,0.4)] bg-[rgba(63,185,80,0.05)]"
            : ""
        }`}
      >
        <div>
          <p className="text-sm font-medium text-[var(--text2)]">Claimable Earnings</p>
          <p className={`mt-1 text-2xl font-bold ${hasPending ? "text-[var(--green)]" : "text-[var(--text3)]"}`}>
            {formatUnits(pendingAmount, 6)} USDC
          </p>
          {isConfirmed && (
            <p className="mt-1 text-xs text-[var(--green)]">Successfully claimed!</p>
          )}
        </div>
        <button
          onClick={claim}
          disabled={!hasPending || isPending || isConfirming}
          className="btn-primary px-6 py-2"
        >
          {isPending || isConfirming ? "Claiming..." : "Claim"}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-8">
        <StatCard label="Total APIs"  value={summary.total} />
        <StatCard label="Approved"    value={summary.approved}   color="var(--green)" />
        <StatCard label="Pending"     value={summary.pending}    color="#e3b341" />
        <StatCard label="Rejected"    value={summary.rejected}   color="var(--red)" />
        <StatCard label="Total Sales" value={summary.totalSales} />
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      )}

      {error && (
        <div className="card py-8 text-center text-[var(--red)]">{error}</div>
      )}

      {!loading && !error && apis.length === 0 && (
        <div className="card text-center py-12">
          <p className="mb-4 text-[var(--text2)]">You haven't registered any APIs yet.</p>
          <Link href="/register" className="btn-primary px-4 py-2 text-sm">
            Register Your First API
          </Link>
        </div>
      )}

      {!loading && apis.length > 0 && (
        <div className="space-y-4">
          {apis.map((api) => (
            <ApiRow
              key={api.id}
              api={api}
              editable={sellerAuth.isAuthenticated}
              onDelete={handleDelete}
              onEdit={handleEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  const valueClass =
    color === "var(--green)"
      ? "text-[var(--green)]"
      : color === "var(--red)"
        ? "text-[var(--red)]"
        : color === "#e3b341"
          ? "text-[#e3b341]"
          : "text-[var(--text)]";

  return (
    <div className="card text-center py-4">
      <p className={`text-2xl font-bold ${valueClass}`}>{value}</p>
      <p className="mt-1 text-xs text-[var(--text2)]">{label}</p>
    </div>
  );
}

type SellerAuthState = ReturnType<typeof useSellerAuth>;

function SellerAuthBanner({ auth }: { auth: SellerAuthState }) {
  if (auth.isAuthenticated) {
    return (
      <div className="card mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[var(--text2)]">
          Signed in as seller — endpoint URLs and edit controls unlocked.
        </p>
        <button
          onClick={auth.signOut}
          className="whitespace-nowrap text-xs font-medium text-[var(--text3)] transition-colors hover:text-[var(--text)]"
        >
          Sign out
        </button>
      </div>
    );
  }
  return (
    <div className="card mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium text-[var(--text)]">Sign in as seller</p>
        <p className="mt-1 text-xs text-[var(--text2)]">
          Sign a message with this wallet to reveal your registered endpoint URLs and edit listings.
        </p>
        {auth.error && (
          <p className="mt-1 text-xs text-[var(--red)]">{auth.error}</p>
        )}
      </div>
      <button
        onClick={auth.signIn}
        disabled={auth.loading}
        className="btn-primary px-4 py-2 text-sm"
      >
        {auth.loading ? "Signing..." : "Sign in"}
      </button>
    </div>
  );
}

type SellerPatch = {
  name?: string;
  description?: string;
  endpoint?: string;
};

function ApiRow({
  api,
  editable,
  onDelete,
  onEdit,
}: {
  api: SellerApi;
  editable: boolean;
  onDelete: (id: string) => void;
  onEdit: (id: string, patch: SellerPatch) => Promise<void>;
}) {
  const priceInUsdc = formatUnits(BigInt(api.price), 6);
  const [editing, setEditing] = useState(false);

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <h3 className="truncate font-semibold text-[var(--text)]">{api.name}</h3>
          <StatusBadge status={api.status} />
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {api.status === "APPROVED" && typeof api.onChainId === "number" && (
            <Link
              href={`/discover/${api.onChainId}`}
              className="whitespace-nowrap text-xs font-medium text-[var(--cyan)] hover:underline"
            >
              View →
            </Link>
          )}
          {editable && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="whitespace-nowrap text-xs font-medium text-[var(--text3)] transition-colors hover:text-[var(--cyan)]"
            >
              Edit
            </button>
          )}
          <button
            onClick={() => onDelete(api.id)}
            className="whitespace-nowrap text-xs font-medium text-[var(--text3)] transition-colors hover:text-[var(--red)]"
          >
            Delete
          </button>
        </div>
      </div>

      <p className="line-clamp-2 text-sm text-[var(--text2)]">{api.description}</p>

      {api.endpoint && !editing && (
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 text-xs text-[var(--text3)]">Endpoint</span>
          <code className="truncate font-mono text-xs text-[var(--text2)]">{api.endpoint}</code>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="rounded border border-[var(--border2)] bg-[var(--bg3)] px-2 py-0.5 text-xs font-medium capitalize text-[var(--text2)]">
          {api.category}
        </span>
        <span className="text-sm font-semibold text-[var(--green)]">{priceInUsdc} USDC</span>
        <span className="text-xs text-[var(--text3)]">{api._count.payments} sales</span>
        <span className="text-xs text-[var(--text3)]">
          {new Date(api.createdAt).toLocaleDateString()}
        </span>
        {api.status === "PENDING" && (
          <span className="text-xs font-medium text-[#e3b341]">Awaiting review</span>
        )}
      </div>

      {api.status === "REJECTED" && (
        <div className="rounded border border-[rgba(248,81,73,0.3)] bg-[rgba(248,81,73,0.1)] px-3 py-2 text-xs text-[var(--red)]">
          <span className="font-medium">Rejection reason: </span>
          {api.rejectionReason ?? "No reason provided"}
        </div>
      )}

      {editing && (
        <SellerEditForm
          api={api}
          onCancel={() => setEditing(false)}
          onSubmit={async (patch) => {
            await onEdit(api.id, patch);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

function SellerEditForm({
  api,
  onCancel,
  onSubmit,
}: {
  api: SellerApi;
  onCancel: () => void;
  onSubmit: (patch: SellerPatch) => Promise<void>;
}) {
  const [name, setName] = useState(api.name);
  const [description, setDescription] = useState(api.description);
  const [endpoint, setEndpoint] = useState(api.endpoint ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const patch: SellerPatch = {};
      if (name !== api.name) patch.name = name;
      if (description !== api.description) patch.description = description;
      if (endpoint !== (api.endpoint ?? "")) patch.endpoint = endpoint;
      if (Object.keys(patch).length === 0) {
        onCancel();
        return;
      }
      await onSubmit(patch);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-[var(--border2)] bg-[var(--bg2)] p-3">
      <label className="flex flex-col gap-1 text-xs text-[var(--text2)]">
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded border border-[var(--border2)] bg-[var(--bg3)] px-2 py-1 text-sm text-[var(--text)]"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-[var(--text2)]">
        Description
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="rounded border border-[var(--border2)] bg-[var(--bg3)] px-2 py-1 text-sm text-[var(--text)]"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-[var(--text2)]">
        Endpoint
        <input
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder="https://..."
          className="rounded border border-[var(--border2)] bg-[var(--bg3)] px-2 py-1 font-mono text-xs text-[var(--text)]"
        />
      </label>
      {err && <p className="text-xs text-[var(--red)]">{err}</p>}
      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={onCancel}
          disabled={saving}
          className="text-xs font-medium text-[var(--text3)] hover:text-[var(--text)]"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="btn-primary px-3 py-1 text-xs"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
