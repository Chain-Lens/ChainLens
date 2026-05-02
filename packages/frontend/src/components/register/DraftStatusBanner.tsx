"use client";

import type { ProviderDraft, DraftStatus } from "@/lib/provider-draft";

interface DraftStatusBannerProps {
  draft: ProviderDraft | null;
  loading: boolean;
  error: string | null;
}

export default function DraftStatusBanner({ draft, loading, error }: DraftStatusBannerProps) {
  if (loading) {
    return (
      <div className="mb-6 rounded-lg border border-[var(--border)] bg-[var(--bg2)] px-4 py-3">
        <p className="text-sm text-[var(--text2)]">Checking directory draft status…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mb-6 rounded-lg border border-[var(--border)] bg-[var(--bg2)] px-4 py-3">
        <p className="text-sm text-[var(--text2)]">Could not load draft status: {error}</p>
      </div>
    );
  }

  if (!draft) return null;

  return <BannerByStatus draft={draft} />;
}

function BannerByStatus({ draft }: { draft: ProviderDraft }) {
  const status = draft.status as DraftStatus;

  if (status === "LISTED") {
    return (
      <div className="mb-6 rounded-lg border border-green-600/30 bg-green-950/20 px-4 py-3">
        <p className="text-sm font-medium text-green-400">
          Listed on ChainLens
          {draft.listingOnChainId != null && ` · Listing #${draft.listingOnChainId}`}
        </p>
        {draft.listingUrl && (
          <a
            href={draft.listingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 block text-sm text-green-300 hover:underline"
          >
            View live listing →
          </a>
        )}
      </div>
    );
  }

  if (status === "ARCHIVED") {
    return (
      <div className="mb-6 rounded-lg border border-yellow-600/30 bg-yellow-950/20 px-4 py-3">
        <p className="text-sm font-medium text-yellow-400">Draft is archived</p>
        <p className="mt-1 text-sm text-[var(--text2)]">
          This directory entry has been archived. Open a new GitHub PR to re-add the provider, or
          register directly without directory import.
        </p>
      </div>
    );
  }

  if (status === "CLAIMED") {
    return (
      <div className="mb-6 rounded-lg border border-blue-600/30 bg-blue-950/20 px-4 py-3">
        <p className="text-sm font-medium text-blue-400">Draft claimed</p>
        <p className="mt-1 text-sm text-[var(--text2)]">
          {draft.claimedBy
            ? `Claimed by ${draft.claimedBy}.`
            : "This draft has been claimed."}{" "}
          If this is your wallet, connect below and complete registration to go live.
        </p>
      </div>
    );
  }

  // UNCLAIMED
  return (
    <div className="mb-6 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-4 py-3">
      <p className="text-sm font-medium text-[var(--accent)]">
        Directory draft ready to claim
      </p>
      <p className="mt-1 text-sm text-[var(--text2)]">
        {draft.directoryVerified
          ? "This provider entry is in the directory. Connect your wallet and complete registration to claim it and go live."
          : "The directory entry exists but has not been confirmed from a merged GitHub PR yet. Wait for the sync to complete, or register without directory import."}
      </p>
    </div>
  );
}
