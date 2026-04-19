const statusStyles: Record<string, string> = {
  PENDING: "status-badge-pending",
  APPROVED: "status-badge-approved",
  REJECTED: "status-badge-rejected",
  REVOKED: "status-badge-revoked",
  PAID: "status-badge-paid",
  EXECUTING: "status-badge-executing",
  COMPLETED: "status-badge-approved",
  REFUNDED: "status-badge-refunded",
  FAILED: "status-badge-rejected",
};

export default function StatusBadge({ status }: { status: string }) {
  const statusClass = statusStyles[status] ?? "status-badge-default";

  return (
    <span className={`status-badge inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass}`}>
      {status}
    </span>
  );
}
