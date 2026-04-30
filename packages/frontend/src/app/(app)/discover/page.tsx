import type { Metadata } from "next";
import { type SortKey } from "@/components/discover/DiscoverItems";
import { DiscoverItems } from "@/components/discover/DiscoverItems";
import DiscoverPageHeader from "@/components/discover/DiscoverPageHeader";
import DiscoverFilterForm from "@/components/discover/DiscoverFilterForm";
import DiscoverErrorPanel from "@/components/discover/DiscoverErrorPanel";
import DiscoverCountLine from "@/components/discover/DiscoverCountLine";
import DiscoverEmptyState from "@/components/discover/DiscoverEmptyState";
import { fetchListings } from "@/lib/discover-api";

export const metadata: Metadata = {
  title: "Discover APIs — ChainLens",
  description: "Browse ranked v3 APIs powered by Thompson sampling",
};

type PageProps = {
  searchParams?: Promise<Record<string, string | undefined>>;
};

export default async function DiscoverPage({ searchParams }: PageProps) {
  const sp = searchParams ? await searchParams : {};
  const q = typeof sp["q"] === "string" ? sp["q"].trim() : "";
  const tag = typeof sp["tag"] === "string" ? sp["tag"].trim() : "";
  const rawSort = typeof sp["sort"] === "string" ? sp["sort"] : "score";
  // Type-only import of SortKey is fine across the server/client boundary,
  // but isSortKey would be a runtime value — inline the check here instead.
  const initialSort: SortKey =
    rawSort === "latest" || rawSort === "score_strict" ? rawSort : "score";

  const result = await fetchListings({
    q: q || undefined,
    tag: tag || undefined,
    sort: initialSort !== "score" ? initialSort : undefined,
  });

  const data = result.ok ? result.data : { items: [], total: 0, totalBeforeFilter: 0 };
  const showReset = !!q || !!tag || initialSort !== "score";
  const emptyTitle = showReset
    ? "No listings match your search."
    : data.totalBeforeFilter > 0
      ? "Backend connected. No listings are public yet."
      : "Backend connected. No on-chain listings found.";
  const emptyDetail = showReset
    ? null
    : data.totalBeforeFilter > 0
      ? `${data.totalBeforeFilter} on-chain listing${data.totalBeforeFilter === 1 ? "" : "s"} found, but none are active and approved for Discovery.`
      : "The Discovery API responded, but the configured market contract has no listings to show.";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <DiscoverPageHeader />
      <DiscoverFilterForm q={q} tag={tag} sort={initialSort} showReset={showReset} />

      {!result.ok ? (
        <DiscoverErrorPanel error={result.error} />
      ) : (
        <>
          <DiscoverCountLine
            visible={data.items.length}
            total={data.total}
            totalBeforeFilter={data.totalBeforeFilter}
          />
          {data.items.length > 0 ? (
            <DiscoverItems items={data.items} initialSort={initialSort} />
          ) : (
            <DiscoverEmptyState title={emptyTitle} detail={emptyDetail} showReset={showReset} />
          )}
        </>
      )}
    </div>
  );
}
