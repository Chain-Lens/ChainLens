import { createHash } from "node:crypto";
import { isValidEvmAddress, type FetchFn } from "./common.js";
import type { SigningProvider, SigningProviderKind } from "./signing-adapter.js";

export interface RegisterPaidListingInput {
  /** Provider slug for informational purposes (used to construct listing URL hint). */
  provider_slug?: string;
  /** EVM address that receives USDC settlement from executed calls. */
  payout_address: string;
  /** URI of the listing metadata JSON. Must be https://, ipfs://, or data:application/json. */
  metadata_uri: string;
  /**
   * Optional SHA-256 hex of the metadata content (without 0x prefix).
   * If provided and the fetched content hash does not match, a warning is added.
   * Omitting this skips hash verification.
   */
  expected_metadata_hash?: string;
}

export interface RegisterPaidListingResult {
  tx_hash: `0x${string}`;
  listing_on_chain_id: number;
  /** ChainLens discover URL for the new listing. */
  listing_url: string;
  /** Kind of signing provider used — informational. */
  signing_provider_kind: SigningProviderKind;
  warnings: string[];
}

export interface RegisterPaidListingDeps {
  signingProvider: SigningProvider;
  /** ChainLens frontend base URL, e.g. "https://chainlens.xyz". */
  chainLensBaseUrl: string;
  fetch: FetchFn;
}

// MVP-safe policy constants
const METADATA_URI_MAX_LENGTH = 2048;
const ALLOWED_URI_SCHEMES = ["https://", "ipfs://", "data:application/json"];

export async function registerPaidListingHandler(
  input: RegisterPaidListingInput,
  deps: RegisterPaidListingDeps,
): Promise<RegisterPaidListingResult> {
  const warnings: string[] = [];

  // Policy: payout address
  if (!input.payout_address) throw new Error("payout_address is required.");
  if (!isValidEvmAddress(input.payout_address)) {
    throw new Error(
      `payout_address "${input.payout_address}" is not a valid EVM address (expected 0x + 40 hex chars).`,
    );
  }
  const payoutAddress = input.payout_address as `0x${string}`;

  // Policy: metadata URI
  if (!input.metadata_uri) throw new Error("metadata_uri is required.");
  const uriError = validateMetadataUri(input.metadata_uri);
  if (uriError) throw new Error(uriError);

  // Metadata validation (fetch + field check + optional hash)
  const metaWarnings = await fetchAndCheckMetadata(
    input.metadata_uri,
    deps.fetch,
    input.expected_metadata_hash,
  );
  warnings.push(...metaWarnings);

  // Sign and submit on-chain
  const { txHash, listingOnChainId } = await deps.signingProvider.signAndSubmit({
    payoutAddress,
    metadataURI: input.metadata_uri,
  });

  const baseUrl = deps.chainLensBaseUrl.replace(/\/$/, "");
  const listingUrl = `${baseUrl}/discover/${listingOnChainId}`;

  return {
    tx_hash: txHash,
    listing_on_chain_id: listingOnChainId,
    listing_url: listingUrl,
    signing_provider_kind: deps.signingProvider.kind,
    warnings,
  };
}

function validateMetadataUri(uri: string): string | null {
  if (uri.length > METADATA_URI_MAX_LENGTH) {
    return (
      `metadata_uri exceeds ${METADATA_URI_MAX_LENGTH} character limit ` +
      `(${uri.length} chars). Use an https:// or ipfs:// URI instead of inline data.`
    );
  }
  if (!ALLOWED_URI_SCHEMES.some((s) => uri.startsWith(s))) {
    return (
      `metadata_uri must start with https://, ipfs://, or data:application/json. ` +
      `Got: "${uri.slice(0, 60)}${uri.length > 60 ? "…" : ""}"`
    );
  }
  return null;
}

async function fetchAndCheckMetadata(
  uri: string,
  fetchFn: FetchFn,
  expectedHash?: string,
): Promise<string[]> {
  const warnings: string[] = [];

  if (uri.startsWith("ipfs://")) {
    warnings.push(
      "ipfs:// metadata URIs cannot be fetched for validation — skipping metadata field check. " +
        "Ensure endpoint, pricing.amount, and output_schema are present before registering.",
    );
    return warnings;
  }

  let body: string;
  try {
    if (uri.startsWith("data:application/json")) {
      body = parseDataUri(uri);
    } else {
      const res = await fetchFn(uri, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) {
        warnings.push(
          `metadata_uri fetch returned HTTP ${res.status} — skipping metadata validation.`,
        );
        return warnings;
      }
      body = await res.text();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`metadata_uri fetch failed: ${msg} — skipping metadata validation.`);
    return warnings;
  }

  // Optional hash check
  if (expectedHash) {
    const computed = sha256hex(body);
    const normalized = expectedHash.toLowerCase().replace(/^0x/, "");
    if (computed !== normalized) {
      warnings.push(
        `metadata hash mismatch — expected ${normalized}, computed ${computed}. ` +
          "The metadata_uri content may have changed since it was reviewed.",
      );
    }
  }

  // Basic field check
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body) as Record<string, unknown>;
  } catch {
    warnings.push("metadata_uri content is not valid JSON — listing may fail validation.");
    return warnings;
  }

  if (!parsed.endpoint) {
    warnings.push("metadata.endpoint is missing — listing will not be executable.");
  }
  const pricing = parsed.pricing as Record<string, unknown> | undefined;
  if (!pricing?.amount) {
    warnings.push("metadata.pricing.amount is missing — listing price is not set.");
  }
  if (!parsed.output_schema) {
    warnings.push("metadata.output_schema is missing — buyers cannot validate responses.");
  }

  return warnings;
}

function parseDataUri(uri: string): string {
  const commaIdx = uri.indexOf(",");
  if (commaIdx === -1) throw new Error("Malformed data URI: missing comma separator.");
  const header = uri.slice(0, commaIdx);
  const payload = uri.slice(commaIdx + 1);
  if (header.includes(";base64")) {
    return Buffer.from(payload, "base64").toString("utf-8");
  }
  return decodeURIComponent(payload);
}

function sha256hex(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}

export const registerPaidListingToolDefinition = {
  name: "seller.register_paid_listing",
  description:
    "Submit a ChainLensMarket.register(payout, metadataURI) on-chain transaction to create a paid API listing. " +
    "Validates payout address and metadata URI (MVP-safe policy), optionally fetches and checks metadata fields, " +
    "then signs and submits via the configured signing provider. " +
    "Requires a signer (CHAIN_LENS_WALLET_PRIVATE_KEY for testnet or CHAIN_LENS_SIGN_SOCKET for the local approval daemon).",
  inputSchema: {
    type: "object",
    required: ["payout_address", "metadata_uri"],
    properties: {
      provider_slug: {
        type: "string",
        description: "Optional provider slug for context (e.g. 'alchemy'). Not sent on-chain.",
      },
      payout_address: {
        type: "string",
        description:
          "EVM address that receives USDC settlement from executed calls. Must be 0x + 40 hex chars.",
      },
      metadata_uri: {
        type: "string",
        description:
          "URI pointing to the listing metadata JSON. " +
          "Allowed schemes: https://, ipfs://, data:application/json. Max 2048 chars. " +
          "Use seller.prepare_paid_listing to prepare the metadata before calling this tool.",
      },
      expected_metadata_hash: {
        type: "string",
        description:
          "Optional SHA-256 hex of the metadata content. " +
          "If provided, the fetched content is hashed and compared. " +
          "Mismatch produces a warning (not an error) — use this to detect URI content drift between review and submission.",
      },
    },
  },
} as const;
