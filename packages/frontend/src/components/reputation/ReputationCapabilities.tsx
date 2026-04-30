export function ReputationCapabilities({ capabilities }: { capabilities: readonly string[] }) {
  return (
    <div className="card space-y-3">
      <h2 className="text-lg font-semibold text-[var(--text)]">Capabilities</h2>
      {capabilities.length === 0 ? (
        <p className="text-sm text-[var(--text2)]">No capabilities registered on-chain.</p>
      ) : (
        <ul className="space-y-1 font-mono text-xs text-[var(--text)]">
          {capabilities.map((c) => (
            <li key={c} className="break-all">
              {c}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
