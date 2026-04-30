function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[8px] border border-[var(--border)] bg-[var(--bg2)] p-4">
      <div className="text-xs text-[var(--text3)]">{label}</div>
      <div className="mt-1 text-xl font-semibold text-[var(--text)]">{value}</div>
    </div>
  );
}

export default function AdminStatRow({
  total,
  pending,
  approved,
  rejected,
}: {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}) {
  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-4">
      <StatCard label="Total APIs" value={total} />
      <StatCard label="Pending" value={pending} />
      <StatCard label="Approved" value={approved} />
      <StatCard label="Rejected" value={rejected} />
    </div>
  );
}
