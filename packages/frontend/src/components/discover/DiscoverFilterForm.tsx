import Link from "next/link";

/**
 * q/tag filter inputs go through a server roundtrip (Apply). Sort lives in
 * <DiscoverItems> and is handled client-side; that component keeps the
 * hidden `sort` field here in sync via the `data-discover-filter` attr,
 * so a sort preference set after page load survives the next Apply.
 */
export default function DiscoverFilterForm({
  q,
  tag,
  sort,
  showReset,
}: {
  q: string;
  tag: string;
  sort: string;
  showReset: boolean;
}) {
  return (
    <form data-discover-filter className="mb-6 flex flex-wrap gap-3">
      <input
        name="q"
        type="text"
        placeholder="Search by name or description…"
        defaultValue={q}
        className="input max-w-xs"
      />
      <input
        name="tag"
        type="text"
        placeholder="Tag filter"
        defaultValue={tag}
        className="input w-36"
      />
      {sort !== "score" && <input type="hidden" name="sort" value={sort} />}
      <button type="submit" className="btn-primary px-4 py-2 text-sm">
        Apply
      </button>
      {showReset && (
        <Link href="/discover" className="btn-secondary px-4 py-2 text-sm">
          Reset
        </Link>
      )}
    </form>
  );
}
