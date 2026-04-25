export default function Loading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="mb-1 text-3xl font-bold text-[var(--text)]">
          Discover APIs
        </h1>
        <p className="text-sm text-[var(--text2)]">
          Rankings refresh on each load via Thompson sampling — every approved
          listing has a chance of appearing at the top.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-3">
        <div className="h-9 w-64 max-w-xs animate-pulse rounded bg-[var(--bg3)]" />
        <div className="h-9 w-36 animate-pulse rounded bg-[var(--bg3)]" />
        <div className="h-9 w-44 animate-pulse rounded bg-[var(--bg3)]" />
        <div className="h-9 w-20 animate-pulse rounded bg-[var(--bg3)]" />
      </div>

      <p className="mb-4 text-xs text-[var(--text3)]">Loading listings…</p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="card flex flex-col gap-3 p-4"
            aria-hidden="true"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--bg3)]" />
                <div className="h-3 w-full animate-pulse rounded bg-[var(--bg3)]" />
                <div className="h-3 w-5/6 animate-pulse rounded bg-[var(--bg3)]" />
              </div>
              <div className="h-6 w-20 animate-pulse rounded bg-[var(--bg3)]" />
            </div>
            <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--bg3)]" />
            <div className="flex flex-wrap items-center gap-2">
              <div className="h-5 w-20 animate-pulse rounded-full bg-[var(--bg3)]" />
              <div className="h-3 w-12 animate-pulse rounded bg-[var(--bg3)]" />
              <div className="ml-auto h-3 w-10 animate-pulse rounded bg-[var(--bg3)]" />
            </div>
            <div className="flex flex-wrap gap-1">
              <div className="h-5 w-12 animate-pulse rounded-full bg-[var(--bg3)]" />
              <div className="h-5 w-16 animate-pulse rounded-full bg-[var(--bg3)]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
