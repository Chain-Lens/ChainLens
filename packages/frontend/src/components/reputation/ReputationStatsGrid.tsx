function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card">
      <div className="mb-1 text-xs text-[var(--text2)]">{label}</div>
      <div className="text-xl font-semibold text-[var(--text)]">{value}</div>
      {hint && <div className="mt-1 text-xs text-[var(--text3)]">{hint}</div>}
    </div>
  );
}

export function ReputationStatsGrid({
  reputationBps,
  jobsCompleted,
  jobsFailed,
}: {
  reputationBps: string;
  jobsCompleted: string;
  jobsFailed: string;
}) {
  const completed = Number(jobsCompleted);
  const failed = Number(jobsFailed);
  const total = completed + failed;
  const reputationBpsNum = Number(reputationBps);
  const successPct = total > 0 ? (completed / total) * 100 : 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Stat
        label="Reputation"
        value={`${(reputationBpsNum / 100).toFixed(2)}%`}
        hint={`${reputationBpsNum} bps`}
      />
      <Stat label="Success Rate" value={`${successPct.toFixed(1)}%`} />
      <Stat label="Completed" value={completed.toString()} />
      <Stat label="Failed" value={failed.toString()} />
    </div>
  );
}
