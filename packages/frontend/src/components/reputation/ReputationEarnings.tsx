import { formatUsdc } from "@/lib/format";

export function ReputationEarnings({ totalEarnings }: { totalEarnings: string }) {
  return (
    <div className="card space-y-3">
      <h2 className="text-lg font-semibold text-[var(--text)]">Earnings</h2>
      <div className="font-mono text-3xl text-[var(--text)]">{formatUsdc(totalEarnings)} USDC</div>
    </div>
  );
}
