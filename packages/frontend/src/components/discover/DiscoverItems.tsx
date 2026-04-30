"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { formatUnits } from "viem";
import type { ListingMetadata, ListingStats } from "@/types/market";

export interface DiscoverItem {
  listingId: string;
  metadata: ListingMetadata | null;
  metadataError?: string;
  stats: ListingStats;
  score: number;
}

export type SortKey = "score" | "score_strict" | "latest";

export function isSortKey(v: string | null | undefined): v is SortKey {
  return v === "score" || v === "score_strict" || v === "latest";
}

// Mirrors the legacy server-side ranking. Re-runs each time sort changes,
// so "Recommended" still reshuffles on a fresh page load (server seeds the
// initial paint, client takes over on first user-driven sort change).
function weightedShuffle<T>(items: readonly T[], weights: readonly number[]): T[] {
  const keyed = items.map((item, i) => {
    const u = Math.random() || Number.EPSILON;
    const w = Math.max(weights[i] ?? 0, 1e-9);
    return { item, key: -Math.log(u) / w };
  });
  keyed.sort((a, b) => a.key - b.key);
  return keyed.map((k) => k.item);
}

function applySort(items: readonly DiscoverItem[], sort: SortKey): DiscoverItem[] {
  if (sort === "latest") {
    return [...items].sort((a, b) => Number(BigInt(b.listingId) - BigInt(a.listingId)));
  }
  if (sort === "score_strict") {
    return [...items].sort((a, b) => b.score - a.score);
  }
  return weightedShuffle(items, items.map((i) => i.score));
}

function SuccessRateBadge({ rate }: { rate: number }) {
  const pct = (rate * 100).toFixed(0);
  const color =
    rate >= 0.8
      ? "text-[#3fb950] bg-[rgba(63,185,80,0.12)]"
      : rate >= 0.5
        ? "text-[#e3b341] bg-[rgba(227,179,65,0.12)]"
        : "text-[#f85149] bg-[rgba(248,81,73,0.12)]";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color}`}
    >
      {pct}% success
    </span>
  );
}

function ListingCard({ item }: { item: DiscoverItem }) {
  const m = item.metadata;
  const name = m?.name ?? `Listing #${item.listingId}`;
  const tags = Array.isArray(m?.tags) ? m.tags : [];
  const price =
    m?.pricing?.amount && /^\d+$/.test(m.pricing.amount)
      ? `${formatUnits(BigInt(m.pricing.amount), 6)} USDC`
      : null;

  return (
    <article className="card group relative flex flex-col gap-3 p-4 transition-colors hover:border-[var(--accent)] hover:bg-[var(--bg3)]">
      <Link
        href={`/discover/${item.listingId}`}
        aria-label={`Open ${name}`}
        className="absolute inset-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      />

      <div className="pointer-events-none flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-[var(--text)]">{name}</h2>
          {m?.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-[var(--text2)]">{m.description}</p>
          )}
        </div>
        {price && (
          <span className="shrink-0 rounded-md bg-[var(--bg3)] px-2 py-1 text-xs font-semibold text-[var(--text)]">
            {price}
          </span>
        )}
      </div>

      {m?.endpoint && (
        <p className="pointer-events-none truncate font-mono text-xs text-[var(--text3)]">
          {m.endpoint}
        </p>
      )}

      <div className="pointer-events-none flex flex-wrap items-center gap-2">
        <SuccessRateBadge rate={item.stats.successRate} />
        {item.stats.totalCalls > 0 && (
          <span className="text-xs text-[var(--text3)]">
            {item.stats.totalCalls} call{item.stats.totalCalls !== 1 ? "s" : ""}
          </span>
        )}
        {item.stats.avgLatencyMs > 0 && (
          <span className="text-xs text-[var(--text3)]">{item.stats.avgLatencyMs} ms</span>
        )}
        <span
          className="ml-auto text-xs text-[var(--text3)]"
          title="Thompson sampling score — stochastic, refreshes each page load"
        >
          ★ {item.score.toFixed(3)}
        </span>
      </div>

      {tags.length > 0 && (
        <div className="relative z-10 flex flex-wrap gap-1">
          {tags.map((t) => (
            <Link
              key={t}
              href={`/discover?tag=${encodeURIComponent(String(t))}`}
              className="rounded-full border border-[var(--border2)] px-2 py-0.5 text-xs text-[var(--text2)] transition-colors hover:bg-[var(--bg3)] hover:text-[var(--text)]"
            >
              #{t}
            </Link>
          ))}
        </div>
      )}

      {item.metadataError && (
        <p className="pointer-events-none text-xs text-[#f85149]">metadata unavailable</p>
      )}

      <div className="pointer-events-none mt-auto pt-2">
        <span className="inline-flex items-center text-sm font-medium text-[var(--accent)] transition-transform group-hover:translate-x-0.5">
          View details →
        </span>
      </div>
    </article>
  );
}

export function DiscoverItems({
  items,
  initialSort,
}: {
  items: DiscoverItem[];
  initialSort: SortKey;
}) {
  const [sort, setSort] = useState<SortKey>(initialSort);
  // Skip client-side sort until the user actually changes it. The initial
  // server render has already applied `initialSort` (deterministic for
  // latest/score_strict, Thompson-sampled for score). Re-running on mount
  // would either no-op or reshuffle Recommended on every page load — the
  // latter causes a visible flash + hydration mismatch for the random case.
  const userTouched = useRef(false);

  const displayItems = useMemo(() => {
    if (!userTouched.current) return items;
    return applySort(items, sort);
  }, [items, sort]);

  function syncFilterFormSort(next: SortKey) {
    if (typeof document === "undefined") return;
    const form = document.querySelector<HTMLFormElement>("form[data-discover-filter]");
    if (!form) return;
    let hidden = form.querySelector<HTMLInputElement>('input[type="hidden"][name="sort"]');
    if (next === "score") {
      hidden?.remove();
      return;
    }
    if (!hidden) {
      hidden = document.createElement("input");
      hidden.type = "hidden";
      hidden.name = "sort";
      form.appendChild(hidden);
    }
    hidden.value = next;
  }

  function handleSortChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = isSortKey(e.target.value) ? e.target.value : "score";
    userTouched.current = true;
    setSort(next);
    // History API instead of router.replace — we don't want to re-trigger
    // the server component (which would re-fetch listings); we only want
    // the URL to reflect current sort for share/refresh.
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (next === "score") url.searchParams.delete("sort");
      else url.searchParams.set("sort", next);
      window.history.replaceState(null, "", url.toString());
    }
    // Keep the q/tag form's hidden sort field in sync so a subsequent
    // Apply preserves the live sort instead of resetting to default.
    syncFilterFormSort(next);
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <label className="flex items-center gap-2 text-xs text-[var(--text3)]">
          <span>Sort</span>
          <select value={sort} onChange={handleSortChange} className="input w-44 text-sm">
            <option value="score">Recommended</option>
            <option value="score_strict">Top rated</option>
            <option value="latest">Newest first</option>
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {displayItems.map((item) => (
          <ListingCard key={item.listingId} item={item} />
        ))}
      </div>
    </>
  );
}
