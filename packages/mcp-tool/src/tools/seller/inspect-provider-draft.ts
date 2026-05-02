import { type FetchFn, fetchJson, isStaleVerified } from "./common.js";

export type DraftStatus = "UNCLAIMED" | "CLAIMED" | "LISTED" | "ARCHIVED";

export interface ProviderDraft {
  id: string;
  providerSlug: string;
  name: string;
  description: string;
  category: string;
  website: string;
  docs?: string | null;
  sourceAttestation: string;
  directoryMetadata: unknown;
  directoryVerified: boolean;
  sourceRepoUrl?: string | null;
  sourcePrUrl?: string | null;
  sourceCommit?: string | null;
  reviewedAt?: string | null;
  lastSyncedAt?: string | null;
  status: DraftStatus;
  claimedBy?: string | null;
  claimedAt?: string | null;
  listingUrl?: string | null;
  listingOnChainId?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface InspectProviderDraftResult {
  draft: ProviderDraft | null;
  found: boolean;
  status: DraftStatus | null;
  /** Single sentence describing what the seller should do next. */
  next_action: string;
  warnings: string[];
  /** URL to claim this draft on ChainLens (only set when status is UNCLAIMED or CLAIMED). */
  claim_url: string | null;
  /** URL to start paid listing registration. */
  register_url: string | null;
}

export interface InspectProviderDraftInput {
  provider_slug: string;
}

export interface InspectProviderDraftDeps {
  apiBaseUrl: string;
  fetch: FetchFn;
}

export async function inspectProviderDraftHandler(
  input: InspectProviderDraftInput,
  deps: InspectProviderDraftDeps,
): Promise<InspectProviderDraftResult> {
  const warnings: string[] = [];
  const slug = input.provider_slug?.trim();

  if (!slug) throw new Error("provider_slug is required.");

  const baseUrl = deps.apiBaseUrl.replace(/\/api$/, "");
  const registerUrl = `${baseUrl}/register?provider=${slug}`;
  const claimApiUrl = `${deps.apiBaseUrl}/directory/drafts/${encodeURIComponent(slug)}/claim`;

  let draft: ProviderDraft | null = null;

  try {
    draft = await fetchJson<ProviderDraft>(
      `${deps.apiBaseUrl}/directory/drafts/${encodeURIComponent(slug)}`,
      deps.fetch,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/404|not found/i.test(msg)) {
      return {
        draft: null,
        found: false,
        status: null,
        next_action:
          `No ChainLens draft found for "${slug}". ` +
          "Open a GitHub directory PR first via seller.open_directory_pr, then wait for the sync to create a draft.",
        warnings: [],
        claim_url: null,
        register_url: registerUrl,
      };
    }
    throw err;
  }

  if (draft.lastSyncedAt && isStaleVerified(draft.lastSyncedAt)) {
    warnings.push(
      `lastSyncedAt is ${draft.lastSyncedAt} — the draft may not reflect the latest GitHub directory state.`,
    );
  }
  if (!draft.directoryVerified) {
    warnings.push(
      "directoryVerified is false — this draft has not been confirmed from a merged PR yet.",
    );
  }

  const next = nextActionFor(draft, claimApiUrl, registerUrl);

  return {
    draft,
    found: true,
    status: draft.status,
    next_action: next,
    warnings,
    claim_url: draft.status === "UNCLAIMED" || draft.status === "CLAIMED" ? claimApiUrl : null,
    register_url: registerUrl,
  };
}

function nextActionFor(draft: ProviderDraft, claimApiUrl: string, registerUrl: string): string {
  switch (draft.status) {
    case "UNCLAIMED":
      return (
        `Draft is unclaimed. Use seller.claim_handoff to get the claim URL, ` +
        `or POST to ${claimApiUrl} with your seller auth token to claim it, ` +
        `then proceed to ${registerUrl} to complete paid listing registration.`
      );
    case "CLAIMED":
      return (
        `Draft is claimed by ${draft.claimedBy ?? "unknown"}. ` +
        `If this is your address, proceed to ${registerUrl} to complete registration. ` +
        `If not, contact the current claimant or start a fresh listing without directory import.`
      );
    case "LISTED":
      return (
        `Draft is already linked to listing on-chain id ${draft.listingOnChainId ?? "unknown"}. ` +
        (draft.listingUrl ? `View listing: ${draft.listingUrl}` : "No listing URL set yet.")
      );
    case "ARCHIVED":
      return "Draft is archived. Create a new directory entry or contact ChainLens support.";
    default:
      return "Unknown draft status — check the draft object for details.";
  }
}

export const inspectProviderDraftToolDefinition = {
  name: "seller.inspect_provider_draft",
  description:
    "Fetch the ChainLens directory draft for a provider slug and summarise its status. Returns draft fields, next-action guidance, claim URL, and register URL. No authentication required.",
  inputSchema: {
    type: "object",
    required: ["provider_slug"],
    properties: {
      provider_slug: {
        type: "string",
        description: "Provider slug to inspect, e.g. 'alchemy'.",
      },
    },
  },
} as const;
