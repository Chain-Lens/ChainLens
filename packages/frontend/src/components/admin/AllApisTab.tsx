"use client";

import LoadingSpinner from "@/components/shared/LoadingSpinner";
import StatusBadge from "@/components/shared/StatusBadge";
import { shortAddress } from "@/lib/address";
import { formatUsdcLabel } from "@/lib/format";

export interface AdminApiRow {
  id: string;
  contractVersion?: string | null;
  onChainId?: number | null;
  name: string;
  category: string;
  status: string;
  price: string;
  sellerAddress: string;
  createdAt: string;
  _count?: { payments?: number };
}

const HEADERS: Array<{ key: string; align?: "right" }> = [
  { key: "API" },
  { key: "Status" },
  { key: "Seller" },
  { key: "Price", align: "right" },
  { key: "Calls", align: "right" },
  { key: "Created" },
];

export default function AllApisTab({
  loading,
  error,
  apis,
}: {
  loading: boolean;
  error: string | null;
  apis: AdminApiRow[];
}) {
  if (loading) return <LoadingSpinner />;
  if (error) return <p className="text-[var(--red)]">{error}</p>;

  return (
    <div className="card overflow-hidden border-[var(--border)] p-0">
      <table className="w-full text-sm">
        <thead className="border-b border-[var(--border)] bg-[var(--bg3)]">
          <tr>
            {HEADERS.map(({ key, align }) => (
              <th
                key={key}
                className={`px-4 py-3 text-left font-medium text-[var(--text2)] ${
                  align === "right" ? "text-right" : ""
                }`}
              >
                {key}
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
                <div className="text-xs text-[var(--text3)]">
                  {api.category}
                  {api.contractVersion === "V3" && typeof api.onChainId === "number"
                    ? ` · v3 #${api.onChainId}`
                    : " · legacy"}
                </div>
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={api.status} />
              </td>
              <td className="px-4 py-3 font-mono text-xs text-[var(--text3)]">
                {shortAddress(api.sellerAddress)}
              </td>
              <td className="px-4 py-3 text-right text-[var(--text2)]">
                {formatUsdcLabel(api.price)}
              </td>
              <td className="px-4 py-3 text-right text-[var(--text2)]">
                {api._count?.payments ?? 0}
              </td>
              <td className="px-4 py-3 text-xs text-[var(--text3)]">
                {new Date(api.createdAt).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {apis.length === 0 && <p className="py-8 text-center text-[var(--text2)]">No APIs found.</p>}
    </div>
  );
}
