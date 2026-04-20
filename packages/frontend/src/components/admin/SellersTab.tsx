"use client";

import { formatUnits } from "viem";
import { useAdminSellers } from "@/hooks/useAdminSellers";
import LoadingSpinner from "@/components/shared/LoadingSpinner";

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function SellersTab({ enabled }: { enabled: boolean }) {
  const { sellers, loading, error } = useAdminSellers(enabled);

  if (loading) return <LoadingSpinner />;
  if (error) return <p className="text-[var(--red)]">{error}</p>;

  return (
    <div className="card overflow-hidden border-[var(--border)] p-0">
      <table className="w-full text-sm">
        <thead className="border-b border-[var(--border)] bg-[var(--bg3)]">
          <tr>
            {[
              "Seller",
              "Registry status",
              "Listings",
              "Jobs (ok/fail)",
              "Earnings",
            ].map((h) => (
              <th
                key={h}
                className={`px-4 py-3 text-left font-medium text-[var(--text2)] ${
                  h === "Earnings" ? "text-right" : ""
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sellers.map((s, i) => (
            <tr
              key={s.address}
              className={`${i > 0 ? "border-t border-[var(--border)]" : ""} hover:bg-[var(--bg3)]`}
            >
              <td className="px-4 py-3">
                <div className="font-medium text-[var(--text)]">
                  {s.name ?? <span className="text-[var(--text3)]">(unnamed)</span>}
                </div>
                <div className="font-mono text-xs text-[var(--text3)]">
                  {shortAddr(s.address)}
                </div>
              </td>
              <td className="px-4 py-3">
                {!s.registered ? (
                  <span className="inline-flex rounded-full bg-[var(--bg3)] px-2 py-0.5 text-xs text-[var(--text3)]">
                    not registered
                  </span>
                ) : s.active ? (
                  <span className="inline-flex rounded-full bg-[rgba(86,211,100,0.15)] px-2 py-0.5 text-xs text-[var(--green)]">
                    active
                  </span>
                ) : (
                  <span className="inline-flex rounded-full bg-[rgba(227,86,86,0.15)] px-2 py-0.5 text-xs text-[var(--red)]">
                    deactivated
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-[var(--text2)]">{s.listingCount}</td>
              <td className="px-4 py-3 text-[var(--text2)]">
                <span className="text-[var(--green)]">{s.jobsCompleted}</span>
                {" / "}
                <span className="text-[var(--red)]">{s.jobsFailed}</span>
              </td>
              <td className="px-4 py-3 text-right text-[var(--text2)]">
                {formatUnits(BigInt(s.earningsUsdcAtomic), 6)} USDC
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {sellers.length === 0 && (
        <p className="py-8 text-center text-[var(--text2)]">No sellers yet.</p>
      )}
    </div>
  );
}
