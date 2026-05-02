"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import RegisterForm from "@/components/register/RegisterForm";
import RegisterPageHeader from "@/components/register/RegisterPageHeader";
import DraftStatusBanner from "@/components/register/DraftStatusBanner";
import {
  fallbackPrefill,
  fetchDirectoryPrefill,
  type DirectoryPrefill,
} from "@/lib/provider-directory";
import { fetchProviderDraft, type ProviderDraft } from "@/lib/provider-draft";

function cleanProviderSlug(value: string | null) {
  if (!value) return null;
  const slug = value.trim().toLowerCase();
  return /^[a-z0-9-]{1,80}$/.test(slug) ? slug : null;
}

export default function RegisterPage() {
  const searchParams = useSearchParams();
  const providerSlug = cleanProviderSlug(searchParams.get("provider"));
  const [prefill, setPrefill] = useState<DirectoryPrefill | undefined>(
    providerSlug ? fallbackPrefill(providerSlug) : undefined,
  );
  const [draft, setDraft] = useState<ProviderDraft | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!providerSlug) {
      setPrefill(undefined);
      setDraft(null);
      return;
    }

    setPrefill(fallbackPrefill(providerSlug));
    fetchDirectoryPrefill(providerSlug).then((nextPrefill) => {
      if (!cancelled) setPrefill(nextPrefill);
    });

    setDraftLoading(true);
    setDraftError(null);
    fetchProviderDraft(providerSlug)
      .then((d) => {
        if (!cancelled) {
          setDraft(d);
          setDraftLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setDraftError(err instanceof Error ? err.message : String(err));
          setDraftLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [providerSlug]);

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <RegisterPageHeader />
      {providerSlug && (
        <DraftStatusBanner draft={draft} loading={draftLoading} error={draftError} />
      )}
      <div className="mb-6 rounded-lg border border-[var(--border)] bg-[var(--bg2)] p-4">
        <p className="text-sm font-medium text-[var(--text)]">
          Not ready for a paid API listing yet?
        </p>
        <p className="mt-1 text-sm leading-relaxed text-[var(--text2)]">
          Add your provider to the open GitHub directory first for discovery,
          SEO, and community review. You can come back here later to claim it
          with a wallet and configure endpoint, price, output schema, and payout.
        </p>
        <a
          href="https://github.com/pelican-lab/awesome-onchain-data-providers"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex text-sm font-medium text-[var(--accent)] hover:underline"
        >
          Add provider on GitHub
        </a>
        <span className="mx-2 text-sm text-[var(--text3)]">or</span>
        <Link
          href="/seller"
          className="inline-flex text-sm font-medium text-[var(--accent)] hover:underline"
        >
          View seller dashboard
        </Link>
      </div>
      <RegisterForm prefill={prefill} />
    </div>
  );
}
