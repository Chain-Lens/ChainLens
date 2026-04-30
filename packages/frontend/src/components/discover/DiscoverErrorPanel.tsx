import type { DiscoverLoadError } from "@/lib/discover-api";
import { DISCOVER_BACKEND_URL } from "@/lib/discover-api";

export default function DiscoverErrorPanel({ error }: { error: DiscoverLoadError }) {
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
          <span className="font-mono text-xs text-[var(--text3)]">HTTP {error.status}</span>
        )}
      </div>
      <h2 className="text-base font-semibold text-[var(--text)]">{error.title}</h2>
      <p className="mt-1 text-sm text-[var(--text2)]">{error.message}</p>
      <dl className="mt-4 grid gap-2 text-left text-xs sm:grid-cols-[160px_1fr]">
        <dt className="text-[var(--text3)]">Backend URL</dt>
        <dd className="break-all font-mono text-[var(--text2)]">{DISCOVER_BACKEND_URL}</dd>
        {error.detail && (
          <>
            <dt className="text-[var(--text3)]">Detail</dt>
            <dd className="break-words font-mono text-[var(--text2)]">{error.detail}</dd>
          </>
        )}
      </dl>
    </div>
  );
}
