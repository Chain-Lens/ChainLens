export default function DiscoverPageHeader() {
  return (
    <div className="mb-6">
      <h1 className="mb-1 text-3xl font-bold text-[var(--text)]">Discover APIs</h1>
      <p className="text-sm text-[var(--text2)]">
        Rankings refresh on each load via Thompson sampling — every approved listing has a chance of
        appearing at the top.
      </p>
    </div>
  );
}
