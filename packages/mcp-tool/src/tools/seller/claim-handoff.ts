import type { DraftStatus, ProviderDraft } from "./inspect-provider-draft.js";

export interface ClaimHandoffInput {
  provider_slug: string;
  /** Draft object from seller.inspect_provider_draft, if already fetched. */
  draft?: ProviderDraft | null;
  /** API base URL override. Defaults to the configured CHAIN_LENS_API_URL. */
  api_base_url?: string;
}

export interface SellerAction {
  step: number;
  action: string;
  /** True when this step requires a wallet connection or seller auth token. */
  requires_auth: boolean;
}

export interface ClaimHandoffResult {
  provider_slug: string;
  /** Current draft status if draft was provided, otherwise null. */
  draft_status: DraftStatus | null;
  /** URL of the ChainLens registration page prefilled with directory metadata. */
  register_url: string;
  /** REST endpoint the seller must POST to with seller_auth_token to claim. */
  claim_api_endpoint: string;
  /** Ordered list of actions the seller must take. */
  seller_actions: SellerAction[];
  warnings: string[];
}

export interface ClaimHandoffDeps {
  apiBaseUrl: string;
}

export function claimHandoffHandler(
  input: ClaimHandoffInput,
  deps: ClaimHandoffDeps,
): ClaimHandoffResult {
  const warnings: string[] = [];
  const slug = input.provider_slug?.trim();
  if (!slug) throw new Error("provider_slug is required.");

  const baseUrl = (input.api_base_url ?? deps.apiBaseUrl).replace(/\/api$/, "");
  const apiBase = input.api_base_url?.replace(/\/$/, "") ?? deps.apiBaseUrl;

  const registerUrl = `${baseUrl}/register?provider=${slug}`;
  const claimApiEndpoint = `${apiBase}/directory/drafts/${encodeURIComponent(slug)}/claim`;

  const draftStatus = input.draft?.status ?? null;

  if (draftStatus === "LISTED") {
    warnings.push(`Draft for "${slug}" is already LISTED — no claim action needed.`);
  }
  if (draftStatus === "ARCHIVED") {
    warnings.push(`Draft for "${slug}" is ARCHIVED — claiming is not possible.`);
  }
  if (input.draft && !input.draft.directoryVerified) {
    warnings.push(
      "directoryVerified is false — the draft was not confirmed from a merged GitHub PR. " +
        "Wait for the directory sync to complete before claiming.",
    );
  }

  const actions = buildSellerActions(slug, draftStatus, claimApiEndpoint, registerUrl);

  return {
    provider_slug: slug,
    draft_status: draftStatus,
    register_url: registerUrl,
    claim_api_endpoint: claimApiEndpoint,
    seller_actions: actions,
    warnings,
  };
}

function buildSellerActions(
  slug: string,
  status: DraftStatus | null,
  claimApiEndpoint: string,
  registerUrl: string,
): SellerAction[] {
  const actions: SellerAction[] = [];
  let step = 1;

  if (!status || status === "UNCLAIMED") {
    actions.push({
      step: step++,
      action:
        `Authenticate as a seller on ChainLens to get a seller_auth_token cookie. ` +
        `The /seller/auth endpoint accepts a signed message proving wallet ownership.`,
      requires_auth: true,
    });
    actions.push({
      step: step++,
      action:
        `POST to ${claimApiEndpoint} with your seller_auth_token in the Cookie header ` +
        `(Cookie: seller_token=<your_token>) to claim the draft for "${slug}". ` +
        `Use seller.link_listing_draft after registration to link the listing id.`,
      requires_auth: true,
    });
  }

  if (status === "CLAIMED") {
    actions.push({
      step: step++,
      action:
        `The draft is already claimed. If the claim is yours, proceed directly to registration. ` +
        `Otherwise contact the current claimant or register without directory import.`,
      requires_auth: false,
    });
  }

  actions.push({
    step: step++,
    action:
      `Open ${registerUrl} in your browser with wallet connected. ` +
      `The form will be prefilled from the directory draft. ` +
      `Add endpoint, price, output schema, and payout address, then submit the on-chain transaction.`,
    requires_auth: true,
  });

  actions.push({
    step: step++,
    action:
      `After registration, call seller.link_listing_draft with the listingOnChainId from the tx receipt ` +
      `and your seller_auth_token to link the on-chain listing back to the draft.`,
    requires_auth: true,
  });

  actions.push({
    step: step++,
    action:
      `Finally, call seller.backfill_listing_url to open a GitHub PR updating ` +
      `providers/${slug}.json with the live listing URL and status.`,
    requires_auth: false,
  });

  return actions;
}

export const claimHandoffToolDefinition = {
  name: "seller.claim_handoff",
  description:
    "Produce a claim URL, register URL, and ordered seller action list for turning a ChainLens directory draft into a live paid listing. Pure computation — no network calls. Pass the draft from seller.inspect_provider_draft to get status-aware guidance.",
  inputSchema: {
    type: "object",
    required: ["provider_slug"],
    properties: {
      provider_slug: {
        type: "string",
        description: "Provider slug, e.g. 'alchemy'.",
      },
      draft: {
        type: "object",
        description:
          "Optional draft object from seller.inspect_provider_draft. If omitted, guidance is generated assuming UNCLAIMED status.",
      },
      api_base_url: {
        type: "string",
        description:
          "Override the API base URL for generating endpoints (default: configured CHAIN_LENS_API_URL).",
      },
    },
  },
} as const;
