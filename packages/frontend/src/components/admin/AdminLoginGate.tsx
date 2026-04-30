"use client";

import { useAccount } from "wagmi";
import ConnectButton from "@/components/shared/ConnectButton";

export default function AdminLoginGate({
  loading,
  error,
  onSignIn,
}: {
  loading: boolean;
  error: string | null;
  onSignIn: () => void;
}) {
  const { isConnected } = useAccount();
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <section className="card p-6">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--text3)]">Admin</p>
        <h1 className="mt-2 text-2xl font-bold text-[var(--text)]">ChainLens Admin</h1>
        <p className="mt-2 text-sm text-[var(--text2)]">
          Connect an authorized admin wallet and sign in to approve listings, inspect sellers, and
          manage operational queues.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <ConnectButton />
          <button
            type="button"
            onClick={onSignIn}
            disabled={!isConnected || loading}
            className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
          >
            {loading ? "Signing..." : "Sign in as admin"}
          </button>
        </div>

        {!isConnected && (
          <p className="mt-3 text-xs text-[var(--text3)]">
            Wallet connection is required before SIWE admin login.
          </p>
        )}
        {error && <p className="mt-3 text-sm text-[var(--red)]">{error}</p>}
      </section>
    </main>
  );
}
