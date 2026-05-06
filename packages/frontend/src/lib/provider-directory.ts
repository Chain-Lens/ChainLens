const DEFAULT_DIRECTORY_URL =
  "https://raw.githubusercontent.com/pelican-lab/awesome-onchain-data-providers/main/dist/providers.json";

const DIRECTORY_URL =
  process.env.NEXT_PUBLIC_PROVIDER_DIRECTORY_URL || DEFAULT_DIRECTORY_URL;

export type DirectoryProvider = {
  name: string;
  slug: string;
  category: string;
  subcategory?: string;
  description: string;
  website: string;
  docs?: string;
  supported_chains?: string[];
  api_types?: string[];
  source_attestation: string;
  last_verified: string;
};

type DirectoryPayload = {
  providers?: DirectoryProvider[];
};

export type DirectoryPrefill = {
  providerSlug: string;
  name: string;
  description: string;
  tags: string;
  website?: string;
  docs?: string;
  sourceAttestation?: string;
  directoryStatus: "loaded" | "fallback" | "not_found" | "error";
  directoryMessage?: string;
};

export function fallbackPrefill(providerSlug: string): DirectoryPrefill {
  const title = titleFromSlug(providerSlug);
  return {
    providerSlug,
    name: `${title} API`,
    description: `Executable API listing for ${title}.`,
    tags: `${providerSlug}, onchain-data`,
    directoryStatus: "fallback",
    directoryMessage: "Using URL slug fallback because directory metadata is not loaded.",
  };
}

export async function fetchDirectoryPrefill(providerSlug: string): Promise<DirectoryPrefill> {
  const fallback = fallbackPrefill(providerSlug);

  try {
    const response = await fetch(DIRECTORY_URL, { cache: "no-store" });
    if (!response.ok) {
      return {
        ...fallback,
        directoryStatus: "error",
        directoryMessage: `Directory metadata request failed with HTTP ${response.status}.`,
      };
    }

    const payload = (await response.json()) as DirectoryPayload;
    const provider = payload.providers?.find((item) => item.slug === providerSlug);
    if (!provider) {
      return {
        ...fallback,
        directoryStatus: "not_found",
        directoryMessage: "Provider slug was not found in the open directory yet.",
      };
    }

    return {
      providerSlug,
      name: `${provider.name} API`,
      description: provider.description,
      tags: buildTags(provider),
      website: provider.website,
      docs: provider.docs,
      sourceAttestation: provider.source_attestation,
      directoryStatus: "loaded",
    };
  } catch (error) {
    return {
      ...fallback,
      directoryStatus: "error",
      directoryMessage:
        error instanceof Error ? error.message : "Directory metadata could not be loaded.",
    };
  }
}

function buildTags(provider: DirectoryProvider) {
  return [
    provider.slug,
    provider.category,
    ...(provider.subcategory ? [slugify(provider.subcategory)] : []),
    ...(provider.supported_chains ?? []).map(slugify),
    "onchain-data",
  ]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(", ");
}

function titleFromSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
