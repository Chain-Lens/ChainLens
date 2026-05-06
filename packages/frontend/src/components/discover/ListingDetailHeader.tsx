import type { ListingDetail } from "@/types/market";

export default function ListingDetailHeader({
  listing,
  price,
}: {
  listing: ListingDetail;
  price: string;
}) {
  const meta = listing.metadata;
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--text3)]">
          Listing #{listing.listingId}
        </p>
        {listing.directory?.verified && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[#3fb95055] bg-[rgba(63,185,80,0.12)] px-2 py-0.5 text-xs font-semibold text-[#3fb950]">
              GitHub directory verified
            </span>
            {listing.directory.sourcePrUrl && (
              <a
                href={listing.directory.sourcePrUrl}
                target="_blank"
                rel="noreferrer"
                className="relative z-10 text-xs text-[var(--accent)] underline-offset-4 hover:underline"
              >
                Review trail
              </a>
            )}
          </div>
        )}
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
  );
}
