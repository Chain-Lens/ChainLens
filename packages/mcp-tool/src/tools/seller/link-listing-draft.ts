import type { ProviderDraft } from "./inspect-provider-draft.js";
import { type FetchFn, fetchJson } from "./common.js";

export interface LinkListingDraftInput {
  provider_slug: string;
  /** On-chain listing ID from the registration transaction receipt. */
  listing_on_chain_id: number;
  /** Optional live listing URL to set at the same time. */
  listing_url?: string;
  /** seller_auth_token obtained from the ChainLens /seller/auth endpoint. */
  seller_auth_token: string;
  /** API base URL override. Defaults to the configured CHAIN_LENS_API_URL. */
  api_base_url?: string;
}

export interface LinkListingDraftResult {
  provider_slug: string;
  draft: ProviderDraft;
  /** The endpoint that was PATCHed. */
  endpoint: string;
  warnings: string[];
}

export interface LinkListingDraftDeps {
  apiBaseUrl: string;
  fetch: FetchFn;
}

export async function linkListingDraftHandler(
  input: LinkListingDraftInput,
  deps: LinkListingDraftDeps,
): Promise<LinkListingDraftResult> {
  const warnings: string[] = [];
  const slug = input.provider_slug?.trim();
  if (!slug) throw new Error("provider_slug is required.");
  if (!input.seller_auth_token?.trim()) throw new Error("seller_auth_token is required.");
  if (typeof input.listing_on_chain_id !== "number" || !Number.isInteger(input.listing_on_chain_id) || input.listing_on_chain_id < 0) {
    throw new Error("listing_on_chain_id must be a non-negative integer.");
  }

  const apiBase = (input.api_base_url?.replace(/\/$/, "") ?? deps.apiBaseUrl);
  const endpoint = `${apiBase}/directory/drafts/${encodeURIComponent(slug)}/listing`;

  const body: Record<string, unknown> = {
    listingOnChainId: input.listing_on_chain_id,
  };
  if (input.listing_url) {
    body.listingUrl = input.listing_url;
  }

  const draft = await fetchJson<ProviderDraft>(endpoint, deps.fetch, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: `seller_token=${input.seller_auth_token}`,
    },
    body: JSON.stringify(body),
  });

  if (draft.status !== "LISTED") {
    warnings.push(
      `Draft status is "${draft.status}" after PATCH — expected "LISTED". ` +
        "The backend may require additional steps before the draft transitions to LISTED.",
    );
  }
  if (!draft.listingUrl && !input.listing_url) {
    warnings.push(
      "No listing_url was provided. Call seller.backfill_listing_url after obtaining the live ChainLens URL.",
    );
  }

  return { provider_slug: slug, draft, endpoint, warnings };
}

export const linkListingDraftToolDefinition = {
  name: "seller.link_listing_draft",
  description:
    "Link an on-chain listing ID back to a ChainLens directory draft after successful registration. PATCHes /directory/drafts/:slug/listing with the listingOnChainId and optional listing URL. Requires a seller_auth_token (from ChainLens /seller/auth).",
  inputSchema: {
    type: "object",
    required: ["provider_slug", "listing_on_chain_id", "seller_auth_token"],
    properties: {
      provider_slug: {
        type: "string",
        description: "Provider slug, e.g. 'alchemy'.",
      },
      listing_on_chain_id: {
        type: "integer",
        minimum: 0,
        description: "On-chain listing ID from the registration transaction receipt.",
      },
      listing_url: {
        type: "string",
        description:
          "Optional live ChainLens listing URL. If omitted, call seller.backfill_listing_url separately once the URL is known.",
      },
      seller_auth_token: {
        type: "string",
        description:
          "JWT token obtained from ChainLens /seller/auth. Sent as Cookie: seller_token=<token>.",
      },
      api_base_url: {
        type: "string",
        description: "Override the API base URL (default: configured CHAIN_LENS_API_URL).",
      },
    },
  },
} as const;
