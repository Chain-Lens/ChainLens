import Link from "next/link";
import { formatUnits } from "viem";
import type { Metadata } from "next";
import MarketPurchaseCard from "@/components/discover/MarketPurchaseCard";
import type { ListingDetail } from "@/types/market";

type PageProps = {
  params: Promise<{ id: string }>;
};

const BACKEND =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001/api";

function formatUsdcLabel(amount: string | undefined): string {
  if (!amount || !/^\d+$/.test(amount)) return "Unavailable";
  const formatted = formatUnits(BigInt(amount), 6).replace(/\.?0+$/, "");
  return `${formatted} USDC`;
}

async function fetchListing(id: string): Promise<ListingDetail | null> {
  try {
    const res = await fetch(`${BACKEND}/market/listings/${id}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as ListingDetail;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const listing = await fetchListing(id);
  return {
    title: listing?.metadata?.name
      ? `${listing.metadata.name} — ChainLens`
      : `Listing #${id} — ChainLens`,
  };
}

export default async function DiscoverDetailPage({ params }: PageProps) {
  const { id } = await params;
  const listing = await fetchListing(id);

  if (!listing) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <p className="text-[var(--red)]">Listing not found.</p>
        <Link
          href="/discover"
          className="mt-4 inline-block text-sm text-[var(--text3)] underline underline-offset-2"
        >
          Back to Discover
        </Link>
      </div>
    );
  }

  const meta = listing.metadata;
  const price = formatUsdcLabel(meta?.pricing?.amount);
  const errorBreakdown = listing.recentErrors?.breakdown ?? {};
  const schemaRejects = errorBreakdown.response_rejected_schema ?? 0;
  const injectionRejects = errorBreakdown.response_rejected_injection ?? 0;
  const policyRejects =
    schemaRejects +
    injectionRejects +
    (errorBreakdown.response_rejected_too_large ?? 0) +
    (errorBreakdown.response_rejected_unserializable ?? 0);
  const visibleErrors = Object.entries(errorBreakdown)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Link
        href="/discover"
        className="mb-6 inline-block text-sm text-[var(--text3)] underline underline-offset-2"
      >
        Back to Discover
      </Link>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section className="card p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--text3)]">
                Listing #{listing.listingId}
              </p>
              <h1 className="mt-2 text-3xl font-bold text-[var(--text)]">
                {meta?.name ?? `Listing #${listing.listingId}`}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-[var(--text2)]">
                {meta?.description ?? "No description provided."}
              </p>
            </div>
            <div className="max-w-full rounded-lg border border-[var(--border)] bg-[var(--bg3)] px-4 py-3 sm:min-w-[11rem]">
              <div className="text-xs text-[var(--text3)]">Price</div>
              <div className="mt-1 break-all text-lg font-semibold leading-tight text-[var(--accent)] sm:text-right">
                {price}
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg3)] p-4">
              <div className="text-xs text-[var(--text3)]">Endpoint</div>
              <div className="mt-1 break-all font-mono text-xs text-[var(--text)]">
                {meta?.endpoint ?? "Unavailable"}
              </div>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg3)] p-4">
              <div className="text-xs text-[var(--text3)]">Method</div>
              <div className="mt-1 text-sm text-[var(--text)]">
                {meta?.method ?? "GET"}
              </div>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg3)] p-4">
              <div className="text-xs text-[var(--text3)]">Success Rate</div>
              <div className="mt-1 text-sm text-[var(--text)]">
                {(listing.stats.successRate * 100).toFixed(0)}%
              </div>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg3)] p-4">
              <div className="text-xs text-[var(--text3)]">Avg Latency</div>
              <div className="mt-1 text-sm text-[var(--text)]">
                {listing.stats.avgLatencyMs} ms
              </div>
            </div>
          </div>

          {meta?.tags && meta.tags.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {meta.tags.map((tag) => (
                <Link
                  key={tag}
                  href={`/discover?tag=${encodeURIComponent(tag)}`}
                  className="rounded-full border border-[var(--border2)] px-2 py-0.5 text-xs text-[var(--text2)] transition-colors hover:bg-[var(--bg3)] hover:text-[var(--text)]"
                >
                  #{tag}
                </Link>
              ))}
            </div>
          )}

          <div className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--bg3)] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-sm font-medium text-[var(--text2)]">
                  Inspect: Recent Policy Signals
                </h2>
                <p className="mt-1 text-xs text-[var(--text3)]">
                  Last {listing.recentErrors?.windowDays ?? 7} days. Schema
                  rejects block settlement; untrusted responses are surfaced for
                  inspection instead of silently accepted.
                </p>
              </div>
              <div
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  schemaRejects > 0
                    ? "border-[var(--red)] text-[var(--red)]"
                    : "border-[var(--green)] text-[var(--green)]"
                }`}
              >
                response_rejected_schema: {schemaRejects}
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded border border-[var(--border)] bg-[var(--bg)] p-3">
                <div className="text-xs text-[var(--text3)]">Policy rejects</div>
                <div className="mt-1 text-sm text-[var(--text)]">
                  {policyRejects}
                </div>
              </div>
              <div className="rounded border border-[var(--border)] bg-[var(--bg)] p-3">
                <div className="text-xs text-[var(--text3)]">Schema rejects</div>
                <div className="mt-1 text-sm text-[var(--text)]">
                  {schemaRejects}
                </div>
              </div>
              <div className="rounded border border-[var(--border)] bg-[var(--bg)] p-3">
                <div className="text-xs text-[var(--text3)]">
                  Injection rejects
                </div>
                <div className="mt-1 text-sm text-[var(--text)]">
                  {injectionRejects}
                </div>
              </div>
            </div>

            {visibleErrors.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {visibleErrors.map(([reason, count]) => (
                  <span
                    key={reason}
                    className={`rounded-full border px-2 py-0.5 font-mono text-xs ${
                      reason === "response_rejected_schema"
                        ? "border-[var(--red)] text-[var(--red)]"
                        : "border-[var(--border2)] text-[var(--text2)]"
                    }`}
                  >
                    {reason}: {count}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-xs text-[var(--text3)]">
                No recent seller or policy failures recorded.
              </p>
            )}
          </div>

          {meta?.example_response != null && (
            <div className="mt-6">
              <h2 className="mb-2 text-sm font-medium text-[var(--text2)]">
                Example Response
              </h2>
              <pre className="overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 font-mono text-xs text-[var(--text)]">
                {JSON.stringify(meta.example_response, null, 2)}
              </pre>
            </div>
          )}
        </section>

        <MarketPurchaseCard listing={listing} />
      </div>
    </div>
  );
}
