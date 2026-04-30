export default function AdminConsoleHeader({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--text3)]">Admin</p>
        <h1 className="mt-2 text-3xl font-bold text-[var(--text)]">Operations Console</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text2)]">
          Review pending APIs, monitor seller health, and handle operational exceptions from one
          place.
        </p>
      </div>
      <button type="button" onClick={onSignOut} className="btn-secondary px-4 py-2 text-sm">
        Sign out
      </button>
    </div>
  );
}
