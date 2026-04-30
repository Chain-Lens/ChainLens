export function ReputationOverview({
  name,
  address,
  active,
  registeredAt,
}: {
  name: string;
  address: string;
  active: boolean;
  registeredAt: string;
}) {
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-[var(--text)]">{name || "Unnamed Seller"}</h1>
      <p className="font-mono text-xs text-[var(--text3)]">{address}</p>
      <div className="mt-2 flex items-center gap-2 text-sm">
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            active
              ? "bg-[rgba(35,134,54,0.15)] text-[#3fb950]"
              : "bg-[rgba(139,148,158,0.15)] text-[#8b949e]"
          }`}
        >
          {active ? "Active" : "Inactive"}
        </span>
        <span className="text-[var(--text2)]">
          Registered {new Date(Number(registeredAt) * 1000).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}
