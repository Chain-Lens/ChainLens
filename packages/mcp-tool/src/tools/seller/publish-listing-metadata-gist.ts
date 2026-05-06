import { createHash } from "node:crypto";
import {
  preparePaidListingHandler,
  type PreparePaidListingInput,
} from "./prepare-paid-listing.js";
import { createGist, type GistDeps } from "./github.js";

export type { GistDeps as PublishListingMetadataGistDeps };

export interface PublishListingMetadataGistInput {
  provider_slug: string;
  name?: string;
  description?: string;
  endpoint?: string;
  method?: "GET" | "POST";
  price_usdc?: number;
  output_schema?: unknown;
  payout_address: string;
  tags?: string[];
  source_attestation?: string;
}

export interface PublishListingMetadataGistResult {
  gist_url: string;
  metadata_uri: string;
  expected_metadata_hash: string;
  register_args: {
    provider_slug: string;
    payout_address: string;
    metadata_uri: string;
    expected_metadata_hash: string;
  };
  warnings: string[];
}

export async function publishListingMetadataGistHandler(
  input: PublishListingMetadataGistInput,
  deps: GistDeps,
): Promise<PublishListingMetadataGistResult> {
  // 1. Run prepare_paid_listing to validate and assemble metadata.
  // source_attestation is not a top-level field in PreparePaidListingInput —
  // it is read from directory_metadata. We thread it through there.
  const prepInput: PreparePaidListingInput = {
    provider_slug: input.provider_slug,
    name: input.name,
    description: input.description,
    endpoint: input.endpoint,
    method: input.method,
    price_usdc: input.price_usdc,
    output_schema: input.output_schema,
    payout_address: input.payout_address,
    tags: input.tags,
    ...(input.source_attestation
      ? { directory_metadata: { source_attestation: input.source_attestation } }
      : {}),
  };

  // Remove undefined keys so prepare_paid_listing sees clean input
  for (const key of Object.keys(prepInput) as Array<keyof typeof prepInput>) {
    if (prepInput[key] === undefined) delete prepInput[key];
  }

  const listingResult = preparePaidListingHandler(prepInput);

  if (listingResult.readiness !== "ready") {
    const missing = listingResult.next_steps.join("; ");
    throw new Error(
      `Listing is not ready — fix these before publishing: ${missing}`,
    );
  }

  const metadata = listingResult.metadata!;

  // 2. Validate required on-chain-referenced fields before creating the Gist
  if (!metadata.endpoint) {
    throw new Error("metadata.endpoint is required before publishing.");
  }
  if (!metadata.pricing?.amount) {
    throw new Error("metadata.pricing.amount is required before publishing.");
  }
  if (metadata.output_schema === undefined || metadata.output_schema === null) {
    throw new Error("metadata.output_schema is required before publishing.");
  }

  // 3. Serialize to JSON
  const metadataJson = JSON.stringify(metadata, null, 2);
  const filename = `${input.provider_slug}.chainlens.metadata.json`;

  // 4. Create public Gist (raw_url is accessible even without auth)
  const gist = await createGist(
    deps,
    `ChainLens listing metadata for ${input.provider_slug}`,
    { [filename]: { content: metadataJson } },
    true,
  );

  const fileEntry = gist.files[filename];
  if (!fileEntry?.raw_url) {
    throw new Error(`Gist created but raw_url missing for file "${filename}".`);
  }

  const rawUrl = fileEntry.raw_url;

  // 5. Fetch raw_url and hash fetched content — not the local string
  const fetchRes = await deps.fetch(rawUrl);
  if (!fetchRes.ok) {
    throw new Error(
      `Failed to fetch Gist raw_url (HTTP ${fetchRes.status}). URI: ${rawUrl}`,
    );
  }
  const fetchedContent = await fetchRes.text();
  const expectedMetadataHash = createHash("sha256")
    .update(fetchedContent, "utf8")
    .digest("hex");

  const warnings: string[] = [...listingResult.warnings];

  if (fetchedContent !== metadataJson) {
    warnings.push(
      "Fetched Gist content differs from local JSON — hash is computed from fetched content.",
    );
  }

  return {
    gist_url: gist.html_url,
    metadata_uri: rawUrl,
    expected_metadata_hash: expectedMetadataHash,
    register_args: {
      provider_slug: input.provider_slug,
      payout_address: input.payout_address,
      metadata_uri: rawUrl,
      expected_metadata_hash: expectedMetadataHash,
    },
    warnings,
  };
}

export const publishListingMetadataGistToolDefinition = {
  name: "seller.publish_listing_metadata_gist",
  description:
    "Upload ChainLens listing metadata to a public GitHub Gist and return the raw URI and SHA-256 hash ready to pass to seller.register_paid_listing. " +
    "Accepts the same seller-friendly inputs as seller.prepare_paid_listing. " +
    "Requires GITHUB_TOKEN with gist write scope. " +
    "Does NOT sign or submit any on-chain transaction — use seller.register_paid_listing for that.",
  inputSchema: {
    type: "object",
    required: ["provider_slug", "payout_address"],
    properties: {
      provider_slug: {
        type: "string",
        description: "Provider slug, e.g. 'alchemy'.",
      },
      name: {
        type: "string",
        description: "Listing name.",
      },
      description: {
        type: "string",
        description: "Listing description.",
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
        description: "Per-call price in USDC display units (e.g. 0.05).",
      },
      output_schema: {
        description: "JSON Schema for the endpoint response.",
      },
      payout_address: {
        type: "string",
        description: "EVM address to receive USDC per-call payments (0x + 40 hex chars).",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Tags for discoverability.",
      },
      source_attestation: {
        type: "string",
        description: "Official HTTPS URL proving information source.",
      },
    },
  },
} as const;
