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

export default function SellerStatRow({
  total,
  approved,
  pending,
  rejected,
  totalSales,
}: {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  totalSales: number;
}) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-8">
      <StatCard label="Total APIs" value={total} />
      <StatCard label="Approved" value={approved} color="var(--green)" />
      <StatCard label="Pending" value={pending} color="#e3b341" />
      <StatCard label="Rejected" value={rejected} color="var(--red)" />
      <StatCard label="Total Sales" value={totalSales} />
    </div>
  );
}
