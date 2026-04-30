import Link from "next/link";

export default function ListingDetailTags({ tags }: { tags: readonly string[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="mt-5 flex flex-wrap gap-2">
      {tags.map((tag) => (
        <Link
          key={tag}
          href={`/discover?tag=${encodeURIComponent(tag)}`}
          className="rounded-full border border-[var(--border2)] px-2 py-0.5 text-xs text-[var(--text2)] transition-colors hover:bg-[var(--bg3)] hover:text-[var(--text)]"
        >
          #{tag}
        </Link>
      ))}
    </div>
  );
}
