export type AdminTab = "pending" | "apis" | "sellers";

const TABS: Array<{ id: AdminTab; label: string }> = [
  { id: "pending", label: "Pending" },
  { id: "apis", label: "All APIs" },
  { id: "sellers", label: "Sellers" },
];

export default function AdminTabs({
  active,
  onChange,
}: {
  active: AdminTab;
  onChange: (tab: AdminTab) => void;
}) {
  return (
    <div className="mb-5 flex flex-wrap gap-2">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`rounded-[8px] border px-3 py-1.5 text-sm transition-colors ${
            active === tab.id
              ? "border-[var(--accent)] bg-[var(--bg3)] text-[var(--text)]"
              : "border-[var(--border)] text-[var(--text3)] hover:bg-[var(--bg3)] hover:text-[var(--text)]"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
