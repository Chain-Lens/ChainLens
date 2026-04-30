import type { ListingDetail, ListingMetadata } from "@/types/market";

function MetaCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg3)] p-4">
      <div className="text-xs text-[var(--text3)]">{label}</div>
      <div className="mt-1 text-sm text-[var(--text)]">{children}</div>
    </div>
  );
}

export default function ListingDetailMetaGrid({
  meta,
  stats,
}: {
  meta: ListingMetadata | null;
  stats: ListingDetail["stats"];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <MetaCell label="Endpoint">
        <span className="break-all font-mono text-xs">{meta?.endpoint ?? "Unavailable"}</span>
      </MetaCell>
      <MetaCell label="Method">{meta?.method ?? "GET"}</MetaCell>
      <MetaCell label="Success Rate">{(stats.successRate * 100).toFixed(0)}%</MetaCell>
      <MetaCell label="Avg Latency">{stats.avgLatencyMs} ms</MetaCell>
    </div>
  );
}
