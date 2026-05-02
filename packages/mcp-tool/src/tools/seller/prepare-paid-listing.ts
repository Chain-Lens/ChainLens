import { isValidEvmAddress, usdcToAtomic, isValidSlug } from "./common.js";

export interface DirectoryMetadata {
  name?: string;
  description?: string;
  category?: string;
  tags?: string[];
  website?: string;
  docs?: string;
  source_attestation?: string;
  [k: string]: unknown;
}

export interface PreparePaidListingInput {
  provider_slug: string;
  name?: string;
  description?: string;
  /** Directory metadata previously imported via seller.import_directory_provider. */
  directory_metadata?: DirectoryMetadata;
  /** Seller endpoint URL. */
  endpoint?: string;
  /** HTTP method. */
  method?: "GET" | "POST";
  /** Per-call price in USDC display units (e.g. 0.05). */
  price_usdc?: number;
  /** JSON Schema for the endpoint response. */
  output_schema?: unknown;
  /** Tags for discoverability. */
  tags?: string[];
  /** EVM payout address. */
  payout_address?: string;
}

export interface ListingMetadata {
  name: string;
  description: string;
  endpoint?: string;
  method?: string;
  pricing?: { amount: string; unit: string };
  output_schema?: unknown;
  tags?: string[];
  website?: string;
  docs?: string;
  source_attestation?: string;
  provider_slug: string;
  category?: string;
}

export type Readiness = "ready" | "incomplete";

export interface PreparePaidListingResult {
  metadata: ListingMetadata | null;
  register_url: string;
  readiness: Readiness;
  warnings: string[];
  next_steps: string[];
}

export function preparePaidListingHandler(input: PreparePaidListingInput): PreparePaidListingResult {
  const warnings: string[] = [];
  const nextSteps: string[] = [];
  const dir = input.directory_metadata ?? {};

  // --- slug ---
  if (!input.provider_slug) {
    throw new Error("provider_slug is required.");
  }
  if (!isValidSlug(input.provider_slug)) {
    warnings.push(`provider_slug "${input.provider_slug}" does not look like a valid slug.`);
  }

  // Merge: explicit inputs override directory metadata
  const name = input.name ?? dir.name ?? "";
  const description = input.description ?? dir.description ?? "";
  const tags = input.tags ?? (Array.isArray(dir.tags) ? dir.tags : undefined);
  const sourceAttestation = dir.source_attestation;

  if (!name) {
    warnings.push("name is missing — provide via input or directory_metadata.");
    nextSteps.push("Provide a name for the listing.");
  }
  if (!description) {
    warnings.push("description is missing — provide via input or directory_metadata.");
    nextSteps.push("Provide a description for the listing.");
  }

  // --- endpoint ---
  const endpoint = input.endpoint;
  if (!endpoint) {
    nextSteps.push("Set endpoint (the seller API URL).");
  } else {
    try {
      new URL(endpoint);
    } catch {
      warnings.push(`endpoint "${endpoint}" is not a valid URL.`);
    }
  }

  // --- method ---
  const method = input.method;
  if (!method) {
    nextSteps.push("Set method (GET or POST).");
  }

  // --- price ---
  const priceUsdc = input.price_usdc;
  if (priceUsdc === undefined || priceUsdc === null) {
    nextSteps.push("Set price_usdc (per-call price in USDC, e.g. 0.05).");
  } else if (priceUsdc <= 0) {
    warnings.push("price_usdc must be greater than 0.");
  }

  // --- output_schema ---
  const outputSchema = input.output_schema;
  if (outputSchema === undefined || outputSchema === null) {
    nextSteps.push(
      "Provide output_schema. Use seller.draft_output_schema with a sample response to generate one.",
    );
  }

  // --- payout_address ---
  const payoutAddress = input.payout_address;
  if (!payoutAddress) {
    nextSteps.push("Set payout_address (EVM address to receive USDC payments).");
  } else if (!isValidEvmAddress(payoutAddress)) {
    warnings.push(
      `payout_address "${payoutAddress}" does not look like a valid EVM address (0x + 40 hex chars).`,
    );
  }

  // Determine readiness
  const ready =
    !!endpoint &&
    !!method &&
    priceUsdc !== undefined &&
    priceUsdc !== null &&
    priceUsdc > 0 &&
    outputSchema !== undefined &&
    outputSchema !== null &&
    !!payoutAddress &&
    isValidEvmAddress(payoutAddress ?? "");

  const pricing =
    priceUsdc !== undefined && priceUsdc !== null && priceUsdc > 0
      ? { amount: usdcToAtomic(priceUsdc), unit: "per_call" }
      : undefined;

  const metadata: ListingMetadata = {
    name,
    description,
    provider_slug: input.provider_slug,
    ...(endpoint ? { endpoint } : {}),
    ...(method ? { method } : {}),
    ...(pricing ? { pricing } : {}),
    ...(outputSchema ? { output_schema: outputSchema } : {}),
    ...(tags ? { tags } : {}),
    ...(dir.website ? { website: dir.website } : {}),
    ...(dir.docs ? { docs: dir.docs } : {}),
    ...(sourceAttestation ? { source_attestation: sourceAttestation } : {}),
    ...(dir.category ? { category: dir.category } : {}),
  };

  if (ready) {
    nextSteps.push(
      "Listing metadata is ready. Use seller.preflight_endpoint to verify the endpoint, then proceed to ChainLens registration.",
    );
  }

  const registerUrl = `/register?provider=${input.provider_slug}`;

  return {
    metadata,
    register_url: registerUrl,
    readiness: ready ? "ready" : "incomplete",
    warnings,
    next_steps: nextSteps,
  };
}

export const preparePaidListingToolDefinition = {
  name: "seller.prepare_paid_listing",
  description:
    "Prepare ChainLens paid listing metadata without signing or registering. Merges directory metadata with seller-provided endpoint, price, and schema. Returns a readiness checklist and a register URL. Does NOT upload metadata or submit a transaction.",
  inputSchema: {
    type: "object",
    required: ["provider_slug"],
    properties: {
      provider_slug: {
        type: "string",
        description: "Provider slug, e.g. 'alchemy'.",
      },
      name: {
        type: "string",
        description: "Listing name. Falls back to directory_metadata.name if omitted.",
      },
      description: {
        type: "string",
        description: "Listing description. Falls back to directory_metadata.description if omitted.",
      },
      directory_metadata: {
        type: "object",
        description:
          "Previously imported directory metadata from seller.import_directory_provider. Used to prefill name, description, tags, website, docs, and source_attestation.",
      },
      endpoint: {
        type: "string",
        description: "Seller API endpoint URL.",
      },
      method: {
        type: "string",
        enum: ["GET", "POST"],
        description: "HTTP method for the endpoint.",
      },
      price_usdc: {
        type: "number",
        description: "Per-call price in USDC display units (e.g. 0.05 = 50000 atomic).",
      },
      output_schema: {
        description:
          "JSON Schema for the endpoint response. Use seller.draft_output_schema to generate one.",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Tags for discoverability. Falls back to directory_metadata.tags if omitted.",
      },
      payout_address: {
        type: "string",
        description: "EVM address to receive USDC per-call payments (0x + 40 hex chars).",
      },
    },
  },
} as const;
