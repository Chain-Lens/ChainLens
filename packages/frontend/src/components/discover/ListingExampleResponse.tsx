export default function ListingExampleResponse({ example }: { example: unknown }) {
  if (example == null) return null;
  return (
    <div className="mt-6">
      <h2 className="mb-2 text-sm font-medium text-[var(--text2)]">Example Response</h2>
      <pre className="overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 font-mono text-xs text-[var(--text)]">
        {JSON.stringify(example, null, 2)}
      </pre>
    </div>
  );
}
