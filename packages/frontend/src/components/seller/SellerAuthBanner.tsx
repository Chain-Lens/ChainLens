"use client";

import { useSellerAuth } from "@/hooks/useSellerAuth";

type SellerAuthState = ReturnType<typeof useSellerAuth>;

export default function SellerAuthBanner({ auth }: { auth: SellerAuthState }) {
  if (auth.isAuthenticated) {
    return (
      <div className="card mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[var(--text2)]">
          Signed in as seller — endpoint URLs and edit controls unlocked.
        </p>
        <button
          onClick={auth.signOut}
          className="whitespace-nowrap text-xs font-medium text-[var(--text3)] transition-colors hover:text-[var(--text)]"
        >
          Sign out
        </button>
      </div>
    );
  }
  return (
    <div className="card mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium text-[var(--text)]">Sign in as seller</p>
        <p className="mt-1 text-xs text-[var(--text2)]">
          Sign a message with this wallet to reveal your registered endpoint URLs and edit listings.
        </p>
        {auth.error && <p className="mt-1 text-xs text-[var(--red)]">{auth.error}</p>}
      </div>
      <button onClick={auth.signIn} disabled={auth.loading} className="btn-primary px-4 py-2 text-sm">
        {auth.loading ? "Signing..." : "Sign in"}
      </button>
    </div>
  );
}
