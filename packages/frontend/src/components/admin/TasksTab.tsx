"use client";

import { formatUnits } from "viem";
import { useAdminTaskTypes } from "@/hooks/useAdminTaskTypes";
import LoadingSpinner from "@/components/shared/LoadingSpinner";

export default function TasksTab({ enabled }: { enabled: boolean }) {
  const { taskTypes, loading, error, toggle, togglingName } =
    useAdminTaskTypes(enabled);

  async function handleToggle(name: string, currentEnabled: boolean) {
    const action = currentEnabled ? "disable" : "enable";
    if (!confirm(`${action} task type "${name}"? This is an on-chain tx.`)) return;
    try {
      const txHash = await toggle(name, !currentEnabled);
      alert(`${action} tx submitted: ${txHash}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : `${action} failed`);
    }
  }

  if (loading) return <LoadingSpinner />;
  if (error) return <p className="text-[var(--red)]">{error}</p>;

  return (
    <div className="card overflow-hidden border-[var(--border)] p-0">
      <table className="w-full text-sm">
        <thead className="border-b border-[var(--border)] bg-[var(--bg3)]">
          <tr>
            {["Name", "Enabled", "Max response", "Min budget", "Registered", ""].map(
              (h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left font-medium text-[var(--text2)]"
                >
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {taskTypes.map((t, i) => (
            <tr
              key={t.id}
              className={`${i > 0 ? "border-t border-[var(--border)]" : ""} hover:bg-[var(--bg3)]`}
            >
              <td className="px-4 py-3 font-medium text-[var(--text)]">{t.name}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    t.enabled
                      ? "bg-[rgba(86,211,100,0.15)] text-[var(--green)]"
                      : "bg-[var(--bg3)] text-[var(--text3)]"
                  }`}
                >
                  {t.enabled ? "enabled" : "disabled"}
                </span>
              </td>
              <td className="px-4 py-3 text-[var(--text2)]">{t.maxResponseTime}s</td>
              <td className="px-4 py-3 text-[var(--text2)]">
                {formatUnits(BigInt(t.minBudget), 6)} USDC
              </td>
              <td className="px-4 py-3 text-xs text-[var(--text3)]">
                {new Date(t.registeredAt * 1000).toLocaleDateString()}
              </td>
              <td className="px-4 py-3">
                <button
                  onClick={() => handleToggle(t.name, t.enabled)}
                  disabled={togglingName === t.name}
                  className="text-xs text-[var(--text3)] transition-colors hover:text-[var(--cyan)] disabled:opacity-40"
                >
                  {togglingName === t.name
                    ? "…"
                    : t.enabled
                      ? "Disable"
                      : "Enable"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {taskTypes.length === 0 && (
        <p className="py-8 text-center text-[var(--text2)]">
          No task types registered on-chain yet.
        </p>
      )}
    </div>
  );
}
