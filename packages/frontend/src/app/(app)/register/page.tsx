"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import RegisterForm from "@/components/register/RegisterForm";
import RegisterPageHeader from "@/components/register/RegisterPageHeader";

function titleFromSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function cleanProviderSlug(value: string | null) {
  if (!value) return null;
  const slug = value.trim().toLowerCase();
  return /^[a-z0-9-]{1,80}$/.test(slug) ? slug : null;
}

export default function RegisterPage() {
  const searchParams = useSearchParams();
  const providerSlug = cleanProviderSlug(searchParams.get("provider"));
  const prefill = providerSlug
    ? {
        providerSlug,
        name: `${titleFromSlug(providerSlug)} API`,
        description: `Executable API listing for ${titleFromSlug(providerSlug)}.`,
        tags: `${providerSlug}, onchain-data`,
      }
    : undefined;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <RegisterPageHeader />
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
