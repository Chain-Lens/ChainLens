"use client";

import { formatUnits } from "viem";
import { useAdminJobs } from "@/hooks/useAdminJobs";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import StatusBadge from "@/components/shared/StatusBadge";

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function REFUNDABLE(status: string): boolean {
  // Gateway can only refund a job that hasn't already terminated. Matches the
  // escrow contract's `refund()` require(!completed && !refunded) guards.
  return status === "PENDING" || status === "PAID" || status === "FAILED";
}

export default function JobsTab({ enabled }: { enabled: boolean }) {
  const { jobs, loading, error, refund, refundingId } = useAdminJobs(enabled);

  async function handleRefund(jobId: string) {
    if (!confirm(`Refund job ${jobId}? This cannot be undone.`)) return;
    try {
      const txHash = await refund(jobId);
      alert(`Refund submitted: ${txHash}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Refund failed");
    }
  }

  if (loading) return <LoadingSpinner />;
  if (error) return <p className="text-[var(--red)]">{error}</p>;

  return (
    <div className="card overflow-hidden border-[var(--border)] p-0">
      <table className="w-full text-sm">
        <thead className="border-b border-[var(--border)] bg-[var(--bg3)]">
          <tr>
            {["Job", "Status", "Buyer", "Seller", "Amount", "Created", ""].map((h) => (
              <th
                key={h}
                className={`px-4 py-3 text-left font-medium text-[var(--text2)] ${
                  h === "Amount" ? "text-right" : ""
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {jobs.map((job, i) => (
            <tr
              key={job.onchainJobId}
              className={`${i > 0 ? "border-t border-[var(--border)]" : ""} hover:bg-[var(--bg3)]`}
            >
              <td className="px-4 py-3 font-mono text-xs text-[var(--text)]">
                #{job.onchainJobId}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={job.status} />
              </td>
              <td className="px-4 py-3 font-mono text-xs text-[var(--text3)]">
                {shortAddr(job.buyer)}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-[var(--text3)]">
                {shortAddr(job.seller)}
              </td>
              <td className="px-4 py-3 text-right text-[var(--text2)]">
                {formatUnits(BigInt(job.amount), 6)} USDC
              </td>
              <td className="px-4 py-3 text-xs text-[var(--text3)]">
                {new Date(job.createdAt).toLocaleString()}
              </td>
              <td className="px-4 py-3">
                {REFUNDABLE(job.status) && (
                  <button
                    onClick={() => handleRefund(job.onchainJobId)}
                    disabled={refundingId === job.onchainJobId}
                    className="text-xs text-[var(--text3)] transition-colors hover:text-[var(--red)] disabled:opacity-40"
                  >
                    {refundingId === job.onchainJobId ? "refunding…" : "Refund"}
                  </button>
                )}
                {job.evidenceURI && (
                  <a
                    href={job.evidenceURI}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-3 text-xs text-[var(--text3)] hover:text-[var(--cyan)]"
                  >
                    Evidence
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {jobs.length === 0 && (
        <p className="py-8 text-center text-[var(--text2)]">No jobs yet.</p>
      )}
    </div>
  );
}
