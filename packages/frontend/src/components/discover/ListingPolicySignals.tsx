import type { ListingDetail } from "@/types/market";

function SignalCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-[var(--border)] bg-[var(--bg)] p-3">
      <div className="text-xs text-[var(--text3)]">{label}</div>
      <div className="mt-1 text-sm text-[var(--text)]">{value}</div>
    </div>
  );
}

export default function ListingPolicySignals({
  recentErrors,
}: {
  recentErrors: ListingDetail["recentErrors"];
}) {
  const errorBreakdown = recentErrors?.breakdown ?? {};
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
    <div className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--bg3)] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-medium text-[var(--text2)]">Inspect: Recent Policy Signals</h2>
          <p className="mt-1 text-xs text-[var(--text3)]">
            Last {recentErrors?.windowDays ?? 7} days. Schema rejects block settlement; untrusted
            responses are surfaced for inspection instead of silently accepted.
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
        <SignalCell label="Policy rejects" value={policyRejects} />
        <SignalCell label="Schema rejects" value={schemaRejects} />
        <SignalCell label="Injection rejects" value={injectionRejects} />
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
  );
}
