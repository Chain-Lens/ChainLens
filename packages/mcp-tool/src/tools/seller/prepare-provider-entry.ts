import { isValidSlug, findMarketingLanguage, isOfficialLookingUrl } from "./common.js";

export type SourceAttestation = string;

export interface ChainLensIntent {
  wants_listing?: boolean;
  contact?: string;
  preferred_task_types?: string[];
  listing_status?: "not_listed" | "requested" | "draft" | "pending_claim" | "listed";
  listing_url?: string | null;
}

export interface PrepareProviderEntryInput {
  name: string;
  slug: string;
  website?: string;
  docs?: string;
  category: string;
  description: string;
  source_attestation?: SourceAttestation;
  chainlens_intent?: ChainLensIntent;
}

export interface PrepareProviderEntryResult {
  provider_json: Record<string, unknown>;
  filename: string;
  warnings: string[];
  missing_fields: string[];
}

// Must match the enum in schema/provider.schema.json
const KNOWN_CATEGORIES = ["rpc", "indexer", "oracle", "analytics", "subgraph", "specialized"];

export function prepareProviderEntryHandler(
  input: PrepareProviderEntryInput,
): PrepareProviderEntryResult {
  const warnings: string[] = [];
  const missing: string[] = [];

  // --- slug ---
  if (!input.slug) {
    missing.push("slug");
  } else if (!isValidSlug(input.slug)) {
    warnings.push(
      `slug "${input.slug}" is invalid — use lowercase letters, numbers, and hyphens only (e.g. "my-provider").`,
    );
  }

  // --- name ---
  if (!input.name?.trim()) missing.push("name");

  // --- category ---
  if (!input.category) {
    missing.push("category");
  } else if (!KNOWN_CATEGORIES.includes(input.category.toLowerCase())) {
    warnings.push(
      `category "${input.category}" is not a recognised value. Known values: ${KNOWN_CATEGORIES.join(", ")}.`,
    );
  }

  // --- description ---
  if (!input.description?.trim()) {
    missing.push("description");
  } else {
    const marketingHits = findMarketingLanguage(input.description);
    if (marketingHits.length > 0) {
      warnings.push(
        `description contains marketing language — avoid superlatives and use factual statements instead.`,
      );
    }
  }

  // --- source_attestation --- (required by schema)
  if (!input.source_attestation) {
    missing.push("source_attestation");
    warnings.push(
      "source_attestation is missing — include an official HTTPS URL (e.g. GitHub repo, official website) to prove the information source.",
    );
  } else if (!isOfficialLookingUrl(input.source_attestation)) {
    warnings.push(
      `source_attestation "${input.source_attestation}" does not look like an official HTTPS URL.`,
    );
  }

  // --- website --- (required by schema)
  if (!input.website) {
    missing.push("website");
    warnings.push("website is missing.");
  }

  // --- docs --- (optional)
  if (!input.docs) warnings.push("docs is missing (optional but recommended).");

  const today = new Date().toISOString().slice(0, 10);

  // Build provider JSON — shape must pass schema/provider.schema.json.
  // Only write URI fields when they have actual string values; null would fail
  // format:uri validation. listing_url is the sole exception (schema allows null).
  const providerJson: Record<string, unknown> = {
    name: input.name,
    slug: input.slug,
    description: input.description,
    category: input.category?.toLowerCase(),
    added_date: today,
    last_verified: today,
  };

  if (input.website) providerJson.website = input.website;
  if (input.docs) providerJson.docs = input.docs;
  if (input.source_attestation) providerJson.source_attestation = input.source_attestation;

  // Optional chainlens intent block
  if (input.chainlens_intent) {
    const cl: Record<string, unknown> = {
      wants_listing: input.chainlens_intent.wants_listing ?? false,
      preferred_task_types: input.chainlens_intent.preferred_task_types ?? [],
      listing_status: input.chainlens_intent.listing_status ?? "not_listed",
      listing_url: input.chainlens_intent.listing_url ?? null, // schema: type ["string","null"]
    };
    // contact is optional URI — omit rather than write null
    if (input.chainlens_intent.contact) cl.contact = input.chainlens_intent.contact;
    providerJson.chainlens = cl;
  }

  const filename = `providers/${input.slug ?? "unknown"}.json`;

  return {
    provider_json: providerJson,
    filename,
    warnings,
    missing_fields: missing,
  };
}

export const prepareProviderEntryToolDefinition = {
  name: "seller.prepare_provider_entry",
  description:
    "Create a provider JSON draft from structured seller inputs. Returns the JSON object and filename — does NOT write the file. Use this to prepare a providers/<slug>.json entry for the awesome-onchain-data-providers directory.",
  inputSchema: {
    type: "object",
    required: ["name", "slug", "category", "description"],
    properties: {
      name: {
        type: "string",
        description: "Human-readable provider name, e.g. 'Alchemy'.",
      },
      slug: {
        type: "string",
        description:
          "URL-safe lowercase identifier, e.g. 'alchemy'. Only letters, numbers, and hyphens.",
      },
      website: {
        type: "string",
        description: "Official website URL.",
      },
      docs: {
        type: "string",
        description: "Documentation URL.",
      },
      category: {
        type: "string",
        enum: ["rpc", "indexer", "oracle", "analytics", "subgraph", "specialized"],
        description: "Provider category matching schema/provider.schema.json enum.",
      },
      description: {
        type: "string",
        description: "Short factual description. Avoid marketing language.",
      },
      source_attestation: {
        type: "string",
        description:
          "Official HTTPS URL proving the source of information (e.g. GitHub repo, official blog post).",
      },
      chainlens_intent: {
        type: "object",
        description:
          "Optional intent block indicating the provider wants a ChainLens paid listing. This is an intent signal only — it does not activate execution.",
        properties: {
          wants_listing: { type: "boolean" },
          contact: { type: "string" },
          preferred_task_types: { type: "array", items: { type: "string" } },
          listing_status: {
            type: "string",
            enum: ["not_listed", "requested", "draft", "pending_claim", "listed"],
          },
          listing_url: { type: "string" },
        },
      },
    },
  },
} as const;
