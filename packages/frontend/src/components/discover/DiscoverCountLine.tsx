export default function DiscoverCountLine({
  visible,
  totalBeforeFilter,
  total,
}: {
  visible: number;
  totalBeforeFilter: number;
  total: number;
}) {
  const hidden = totalBeforeFilter > total && visible > 0 ? totalBeforeFilter - total : 0;
  return (
    <p className="mb-4 text-xs text-[var(--text3)]">
      {visible === 0
        ? "No approved listings found."
        : `${visible} listing${visible === 1 ? "" : "s"} shown`}
      {hidden > 0 ? ` · ${hidden} hidden by filters` : ""}
    </p>
  );
}
