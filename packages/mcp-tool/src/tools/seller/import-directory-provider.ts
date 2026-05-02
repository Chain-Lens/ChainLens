import { type FetchFn, fetchJson, isStaleVerified, isPlainObject } from "./common.js";

const GITHUB_PROVIDERS_URL =
  "https://raw.githubusercontent.com/pelican-lab/awesome-onchain-data-providers/main/dist/providers.json";

export interface ImportDirectoryProviderInput {
  /** Slug of the provider to import (e.g. "alchemy"). */
  provider_slug: string;
  /** Override the directory source URL (optional). */
  directory_url?: string;
  /**
   * When true, try ChainLens draft API before falling back to the raw directory.
   * Default true.
   */
  prefer_chainlens_draft?: boolean;
}

export interface ListingPrefill {
  name?: string;
  description?: string;
  category?: string;
  tags?: string[];
  website?: string;
  docs?: string;
  source_attestation?: string;
  provider_slug: string;
}

export interface ImportDirectoryProviderResult {
  /** Raw provider entry from the directory. */
  provider: Record<string, unknown> | null;
  /** Fields pre-filled for a ChainLens paid listing draft. */
  listing_prefill: ListingPrefill | null;
  /** Fields still needed before the listing can be submitted. */
  missing_paid_listing_fields: string[];
  warnings: string[];
  /** ChainLens registration URL for this provider. */
  register_url: string;
}

export interface ImportDirectoryProviderDeps {
  apiBaseUrl: string;
  fetch: FetchFn;
}

export async function importDirectoryProviderHandler(
  input: ImportDirectoryProviderInput,
  deps: ImportDirectoryProviderDeps,
): Promise<ImportDirectoryProviderResult> {
  const warnings: string[] = [];
  const slug = input.provider_slug?.trim();

  if (!slug) {
    throw new Error("provider_slug is required.");
  }

  const preferDraft = input.prefer_chainlens_draft !== false;
  const registerUrl = `${deps.apiBaseUrl.replace(/\/api$/, "")}/register?provider=${slug}`;

  let provider: Record<string, unknown> | null = null;

  // 1. Try ChainLens draft API
  if (preferDraft) {
    try {
      const draft = await fetchJson<Record<string, unknown>>(
        `${deps.apiBaseUrl}/directory/drafts/${encodeURIComponent(slug)}`,
        deps.fetch,
      );
      if (isPlainObject(draft)) {
        provider = draft;
      }
    } catch {
      // fall through to directory fallback
    }
  }

  // 2. Fall back to raw directory JSON
  if (!provider) {
    const directoryUrl = input.directory_url ?? GITHUB_PROVIDERS_URL;
    let allProviders: unknown;
    try {
      allProviders = await fetchJson<unknown>(directoryUrl, deps.fetch);
    } catch (err) {
      throw new Error(
        `Failed to fetch directory from ${directoryUrl}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    provider = findBySlug(allProviders, slug);

    if (!provider) {
      throw new Error(
        `Provider slug "${slug}" not found in directory. Check spelling or add the provider first via seller.prepare_provider_entry.`,
      );
    }
  }

  // Stale check
  const lastVerified = provider.last_verified as string | undefined;
  if (isStaleVerified(lastVerified)) {
    warnings.push(
      `last_verified is ${lastVerified ?? "absent"} — this entry may be outdated. Verify provider details before listing.`,
    );
  }

  // Source attestation check
  if (!provider.source_attestation) {
    warnings.push(
      "source_attestation is missing — directory metadata cannot be used as ownership proof.",
    );
  }

  warnings.push(
    "Imported directory metadata is not ownership proof. Endpoint, price, output schema, and payout address must be set separately.",
  );

  const prefill = buildPrefill(provider, slug);
  const missing = missingPaidListingFields(provider);

  return {
    provider,
    listing_prefill: prefill,
    missing_paid_listing_fields: missing,
    warnings,
    register_url: registerUrl,
  };
}

function findBySlug(data: unknown, slug: string): Record<string, unknown> | null {
  // Unwrap dist/providers.json envelope: { providers: [...], ... }
  let searchTarget = data;
  if (isPlainObject(data) && Array.isArray((data as Record<string, unknown>).providers)) {
    searchTarget = (data as Record<string, unknown>).providers;
  }

  if (Array.isArray(searchTarget)) {
    const match = searchTarget.find(
      (item) => isPlainObject(item) && (item.slug === slug || item.id === slug),
    );
    return (match as Record<string, unknown>) ?? null;
  }
  if (isPlainObject(searchTarget)) {
    const byKey = (searchTarget as Record<string, unknown>)[slug];
    if (isPlainObject(byKey)) return byKey;
    // Try scanning values for slug/id match
    for (const val of Object.values(searchTarget as Record<string, unknown>)) {
      if (isPlainObject(val) && (val.slug === slug || val.id === slug)) {
        return val;
      }
    }
  }
  return null;
}

function buildPrefill(
  provider: Record<string, unknown>,
  slug: string,
): ListingPrefill {
  return {
    provider_slug: slug,
    name: provider.name as string | undefined,
    description: provider.description as string | undefined,
    category: provider.category as string | undefined,
    tags: Array.isArray(provider.tags) ? (provider.tags as string[]) : undefined,
    website: provider.website as string | undefined,
    docs: provider.docs as string | undefined,
    source_attestation: provider.source_attestation as string | undefined,
  };
}

const PAID_LISTING_REQUIRED = ["endpoint", "method", "price_usdc", "output_schema", "payout_address"];

function missingPaidListingFields(provider: Record<string, unknown>): string[] {
  // These fields cannot come from directory metadata — always missing at import time
  return PAID_LISTING_REQUIRED.filter(
    (f) => provider[f] === undefined || provider[f] === null || provider[f] === "",
  );
}

export const importDirectoryProviderToolDefinition = {
  name: "seller.import_directory_provider",
  description:
    "Import a provider entry from the ChainLens directory or the awesome-onchain-data-providers GitHub repo and turn it into a paid listing prefill draft. Tries the ChainLens draft API first, falls back to raw GitHub JSON. Imported metadata is NOT ownership proof — endpoint, price, output schema, and payout address must be provided separately.",
  inputSchema: {
    type: "object",
    required: ["provider_slug"],
    properties: {
      provider_slug: {
        type: "string",
        description: "Slug of the provider to import, e.g. 'alchemy'.",
      },
      directory_url: {
        type: "string",
        description:
          "Override directory source URL. Defaults to the awesome-onchain-data-providers dist/providers.json on GitHub.",
      },
      prefer_chainlens_draft: {
        type: "boolean",
        description:
          "Try ChainLens draft API before falling back to the raw directory. Default true.",
      },
    },
  },
} as const;
