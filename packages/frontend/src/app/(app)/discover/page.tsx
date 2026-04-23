import Link from "next/link";
import type { Metadata } from "next";
import { formatUnits } from "viem";
import type { ListingMetadata, ListingStats } from "@/types/market";

export const metadata: Metadata = {
  title: "Discover APIs — ChainLens",
  description: "Browse ranked v3 APIs powered by Thompson sampling",
};

// ──────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────

interface DiscoverItem {
  listingId: string;
  metadata: ListingMetadata | null;
  metadataError?: string;
  stats: ListingStats;
  score: number;
}

interface DiscoverResponse {
  items: DiscoverItem[];
  total: number;
  totalBeforeFilter: number;
}

type DiscoverLoadErrorKind =
  | "api_missing"
  | "backend_unreachable"
  | "backend_error";

interface DiscoverLoadError {
  kind: DiscoverLoadErrorKind;
  title: string;
  message: string;
  detail?: string;
  status?: number;
}

type DiscoverLoadResult =
  | { ok: true; data: DiscoverResponse }
  | { ok: false; error: DiscoverLoadError };

// ──────────────────────────────────────────────────────────────────────
// Data fetching
// ──────────────────────────────────────────────────────────────────────

const BACKEND =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001/api";

async function fetchListings(params: {
  q?: string;
  tag?: string;
  sort?: string;
}): Promise<DiscoverLoadResult> {
  const qs = new URLSearchParams();
  if (params.q)    qs.set("q",    params.q);
  if (params.tag)  qs.set("tag",  params.tag);
  if (params.sort) qs.set("sort", params.sort);
  qs.set("limit", "50");

  const url = `${BACKEND}/market/listings?${qs}`;

  let res: Response;
  try {
    res = await fetch(url, {
      cache: "no-store",
    });
  } catch (error) {
    return {
      ok: false,
      error: {
        kind: "backend_unreachable",
        title: "Backend connection failed",
        message:
          "The Discovery page could not connect to the configured backend.",
        detail: error instanceof Error ? error.message : String(error),
      },
    };
  }

  if (res.status === 404) {
    return {
      ok: false,
      error: {
        kind: "api_missing",
        title: "Discovery API is missing",
        message:
          "The backend is reachable, but /api/market/listings was not found.",
        status: res.status,
      },
    };
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return {
      ok: false,
      error: {
        kind: "backend_error",
        title: "Backend returned an error",
        message:
          "The Discovery API exists, but the backend failed while loading listings.",
        detail: detail.slice(0, 500),
        status: res.status,
      },
    };
  }

  try {
    return { ok: true, data: (await res.json()) as DiscoverResponse };
  } catch (error) {
    return {
      ok: false,
      error: {
        kind: "backend_error",
        title: "Backend returned invalid JSON",
        message:
          "The Discovery API responded, but the response could not be parsed.",
        detail: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

// ──────────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────────

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

      {/* Title + price */}
      <div className="pointer-events-none flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-[var(--text)]">
            {name}
          </h2>
          {m?.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-[var(--text2)]">
              {m.description}
            </p>
          )}
        </div>
        {price && (
          <span className="shrink-0 rounded-md bg-[var(--bg3)] px-2 py-1 text-xs font-semibold text-[var(--text)]">
            {price}
          </span>
        )}
      </div>

      {/* Endpoint */}
      {m?.endpoint && (
        <p className="pointer-events-none truncate font-mono text-xs text-[var(--text3)]">
          {m.endpoint}
        </p>
      )}

      {/* Stats row */}
      <div className="pointer-events-none flex flex-wrap items-center gap-2">
        <SuccessRateBadge rate={item.stats.successRate} />
        {item.stats.totalCalls > 0 && (
          <span className="text-xs text-[var(--text3)]">
            {item.stats.totalCalls} call{item.stats.totalCalls !== 1 ? "s" : ""}
          </span>
        )}
        {item.stats.avgLatencyMs > 0 && (
          <span className="text-xs text-[var(--text3)]">
            {item.stats.avgLatencyMs} ms
          </span>
        )}
        <span
          className="ml-auto text-xs text-[var(--text3)]"
          title="Thompson sampling score — stochastic, refreshes each page load"
        >
          ★ {item.score.toFixed(3)}
        </span>
      </div>

      {/* Tags */}
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
        <p className="pointer-events-none text-xs text-[#f85149]">
          metadata unavailable
        </p>
      )}

      <div className="pointer-events-none mt-auto pt-2">
        <span className="inline-flex items-center text-sm font-medium text-[var(--accent)] transition-transform group-hover:translate-x-0.5">
          View details →
        </span>
      </div>
    </article>
  );
}

function DiscoveryErrorPanel({ error }: { error: DiscoverLoadError }) {
  const label =
    error.kind === "api_missing"
      ? "API missing"
      : error.kind === "backend_unreachable"
        ? "Backend unreachable"
        : "Backend error";

  return (
    <div className="mt-8 rounded-lg border border-[rgba(248,81,73,0.35)] bg-[rgba(248,81,73,0.08)] px-6 py-8">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded border border-[rgba(248,81,73,0.4)] px-2 py-0.5 text-xs font-semibold text-[var(--red)]">
          {label}
        </span>
        {error.status && (
          <span className="font-mono text-xs text-[var(--text3)]">
            HTTP {error.status}
          </span>
        )}
      </div>
      <h2 className="text-base font-semibold text-[var(--text)]">
        {error.title}
      </h2>
      <p className="mt-1 text-sm text-[var(--text2)]">{error.message}</p>
      <dl className="mt-4 grid gap-2 text-left text-xs sm:grid-cols-[160px_1fr]">
        <dt className="text-[var(--text3)]">Backend URL</dt>
        <dd className="break-all font-mono text-[var(--text2)]">{BACKEND}</dd>
        {error.detail && (
          <>
            <dt className="text-[var(--text3)]">Detail</dt>
            <dd className="break-words font-mono text-[var(--text2)]">
              {error.detail}
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────────────

type PageProps = {
  searchParams?: Promise<Record<string, string | undefined>>;
};

export default async function DiscoverPage({ searchParams }: PageProps) {
  const sp = searchParams ? await searchParams : {};
  const q    = typeof sp["q"]    === "string" ? sp["q"].trim()    : "";
  const tag  = typeof sp["tag"]  === "string" ? sp["tag"].trim()  : "";
  const sort = typeof sp["sort"] === "string" ? sp["sort"]        : "score";

  const result = await fetchListings({
    q:    q    || undefined,
    tag:  tag  || undefined,
    sort: sort !== "score" ? sort : undefined,
  });

  const data = result.ok
    ? result.data
    : { items: [], total: 0, totalBeforeFilter: 0 };
  const showReset = !!q || !!tag || sort !== "score";
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
      {/* Page header */}
      <div className="mb-6">
        <h1 className="mb-1 text-3xl font-bold text-[var(--text)]">
          Discover APIs
        </h1>
        <p className="text-sm text-[var(--text2)]">
          Rankings refresh on each load via Thompson sampling — every approved
          listing has a chance of appearing at the top.
        </p>
      </div>

      {/* Filter form */}
      <form className="mb-6 flex flex-wrap gap-3">
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
        <select name="sort" defaultValue={sort} className="input w-44">
          <option value="score">Recommended</option>
          <option value="score_strict">Top rated</option>
          <option value="latest">Newest first</option>
        </select>
        <button type="submit" className="btn-primary px-4 py-2 text-sm">
          Apply
        </button>
        {showReset && (
          <Link href="/discover" className="btn-secondary px-4 py-2 text-sm">
            Reset
          </Link>
        )}
      </form>

      {!result.ok ? (
        <DiscoveryErrorPanel error={result.error} />
      ) : (
        <>
          {/* Count line */}
          <p className="mb-4 text-xs text-[var(--text3)]">
            {data.items.length === 0
              ? "No approved listings found."
              : `${data.items.length} listing${data.items.length === 1 ? "" : "s"} shown`}
            {data.totalBeforeFilter > data.total && data.items.length > 0
              ? ` · ${data.totalBeforeFilter - data.total} hidden by filters`
              : ""}
          </p>

          {/* Listing grid */}
          {data.items.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.items.map((item) => (
                <ListingCard key={item.listingId} item={item} />
              ))}
            </div>
          ) : (
            <div className="mt-8 rounded-lg border border-[var(--border)] bg-[var(--bg2)] px-6 py-14 text-center">
              <p className="text-[var(--text2)]">
                {emptyTitle}
              </p>
              {emptyDetail && (
                <p className="mx-auto mt-2 max-w-xl text-sm text-[var(--text3)]">
                  {emptyDetail}
                </p>
              )}
              {showReset && (
                <Link
                  href="/discover"
                  className="mt-3 inline-block text-sm text-[var(--text3)] underline underline-offset-2"
                >
                  Clear filters
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
