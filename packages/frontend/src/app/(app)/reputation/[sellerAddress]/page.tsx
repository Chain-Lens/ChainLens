"use client";

import { useParams } from "next/navigation";
import { useReputation } from "@/hooks/useReputation";
import LoadingSpinner from "@/components/shared/LoadingSpinner";

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

export default function ReputationPage() {
  const params = useParams();
  const raw = params.sellerAddress as string;
  const addr = ADDR_RE.test(raw) ? (raw as `0x${string}`) : undefined;
  const { reputation, loading, error } = useReputation(addr);

  if (!addr) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <p className="text-[var(--red)]">Invalid seller address</p>
      </div>
    );
  }

  if (loading)
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner />
      </div>
    );

  if (error || !reputation) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <p className="text-[var(--red)]">
          {error ?? "Seller not registered"}
        </p>
      </div>
    );
  }

  const completed = Number(reputation.jobsCompleted);
  const failed = Number(reputation.jobsFailed);
  const total = completed + failed;
  const reputationBps = Number(reputation.reputationBps);
  const successPct = total > 0 ? (completed / total) * 100 : 0;
  const earningsUsdc = formatUsdc(reputation.totalEarnings);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div>
        <h1 className="mb-1 text-2xl font-bold text-[var(--text)]">{reputation.name || "Unnamed Seller"}</h1>
        <p className="font-mono text-xs text-[var(--text3)]">
          {reputation.address}
        </p>
        <div className="mt-2 flex items-center gap-2 text-sm">
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              reputation.active
                ? "bg-[rgba(35,134,54,0.15)] text-[#3fb950]"
                : "bg-[rgba(139,148,158,0.15)] text-[#8b949e]"
            }`}
          >
            {reputation.active ? "Active" : "Inactive"}
          </span>
          <span className="text-[var(--text2)]">
            Registered{" "}
            {new Date(Number(reputation.registeredAt) * 1000).toLocaleDateString()}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat
          label="Reputation"
          value={`${(reputationBps / 100).toFixed(2)}%`}
          hint={`${reputationBps} bps`}
        />
        <Stat label="Success Rate" value={`${successPct.toFixed(1)}%`} />
        <Stat label="Completed" value={completed.toString()} />
        <Stat label="Failed" value={failed.toString()} />
      </div>

      <div className="card space-y-3">
        <h2 className="text-lg font-semibold text-[var(--text)]">
          Earnings
        </h2>
        <div className="font-mono text-3xl text-[var(--text)]">
          {earningsUsdc} USDC
        </div>
      </div>

      <div className="card space-y-3">
        <h2 className="text-lg font-semibold text-[var(--text)]">
          Capabilities
        </h2>
        {reputation.capabilities.length === 0 ? (
          <p className="text-sm text-[var(--text2)]">
            No capabilities registered on-chain.
          </p>
        ) : (
          <ul className="space-y-1 font-mono text-xs text-[var(--text)]">
            {reputation.capabilities.map((c) => (
              <li key={c} className="break-all">
                {c}
              </li>
            ))}
          </ul>
        )}
      </div>

      {reputation.metadataURI && (
        <div className="card space-y-2">
          <h2 className="text-lg font-semibold text-[var(--text)]">
            Metadata
          </h2>
          <a
            href={resolveUri(reputation.metadataURI)}
            target="_blank"
            rel="noreferrer"
            className="break-all font-mono text-sm text-[var(--cyan)] hover:underline"
          >
            {reputation.metadataURI}
          </a>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="card">
      <div className="mb-1 text-xs text-[var(--text2)]">
        {label}
      </div>
      <div className="text-xl font-semibold text-[var(--text)]">
        {value}
      </div>
      {hint && (
        <div className="mt-1 text-xs text-[var(--text3)]">
          {hint}
        </div>
      )}
    </div>
  );
}

// USDC has 6 decimals. The backend returns the raw base-unit bigint as a
// string; dividing as bigint avoids floating-point loss on large values.
const USDC_UNIT = BigInt(1_000_000);
function formatUsdc(raw: string): string {
  try {
    const base = BigInt(raw);
    const whole = base / USDC_UNIT;
    const frac = base % USDC_UNIT;
    return `${whole.toString()}.${frac.toString().padStart(6, "0")}`;
  } catch {
    return raw;
  }
}

function resolveUri(uri: string): string {
  if (uri.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${uri.slice("ipfs://".length)}`;
  }
  return uri;
}
