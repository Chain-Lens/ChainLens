import Link from "next/link";

export default function DiscoverEmptyState({
  title,
  detail,
  showReset,
}: {
  title: string;
  detail: string | null;
  showReset: boolean;
}) {
  return (
    <div className="mt-8 rounded-lg border border-[var(--border)] bg-[var(--bg2)] px-6 py-14 text-center">
      <p className="text-[var(--text2)]">{title}</p>
      {detail && <p className="mx-auto mt-2 max-w-xl text-sm text-[var(--text3)]">{detail}</p>}
      {showReset && (
        <Link
          href="/discover"
          className="mt-3 inline-block text-sm text-[var(--text3)] underline underline-offset-2"
        >
          Clear filters
        </Link>
      )}
    </div>
  );
}
