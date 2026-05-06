import { isValidSlug } from "./common.js";
import {
  type GitHubDeps,
  getDefaultBranchSha,
  createBranch,
  getFileContent,
  putFile,
  openOrFindPr,
} from "./github.js";

export type ListingStatus = "listed";

export interface BackfillListingUrlInput {
  /** Provider slug to update, e.g. "alchemy". */
  provider_slug: string;
  /** Live ChainLens listing URL, e.g. "https://chainlens.pelicanlab.dev/discover/123". */
  listing_url: string;
  /** Status to write. Only "listed" is valid for a backfill after successful registration. */
  listing_status?: ListingStatus;
}

export interface BackfillListingUrlResult {
  pr_url: string;
  updated_json: Record<string, unknown>;
  branch: string;
  warnings: string[];
}

export type BackfillListingUrlDeps = GitHubDeps;

// Listing URL must be hosted on a ChainLens-owned domain.
const CHAINLENS_DOMAINS = [
  "chainlens.pelicanlab.dev",
  "chainlens.xyz",
  "app.chainlens.xyz",
  "www.chainlens.xyz",
];

function isChainLensUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return CHAINLENS_DOMAINS.includes(hostname);
  } catch {
    return false;
  }
}

export async function backfillListingUrlHandler(
  input: BackfillListingUrlInput,
  deps: BackfillListingUrlDeps,
): Promise<BackfillListingUrlResult> {
  const warnings: string[] = [];

  if (!input.provider_slug?.trim()) {
    throw new Error("provider_slug is required.");
  }
  if (!isValidSlug(input.provider_slug)) {
    warnings.push(`provider_slug "${input.provider_slug}" may not be a valid slug.`);
  }
  if (!input.listing_url) {
    throw new Error("listing_url is required.");
  }
  if (!isChainLensUrl(input.listing_url)) {
    throw new Error(
      `listing_url "${input.listing_url}" is not a recognised ChainLens domain. ` +
        `Expected one of: ${CHAINLENS_DOMAINS.join(", ")}.`,
    );
  }

  const listingStatus: ListingStatus = input.listing_status ?? "listed";
  const slug = input.provider_slug.trim();
  const filePath = `providers/${slug}.json`;

  // Get default branch
  const { defaultBranch, sha } = await getDefaultBranchSha(deps);

  // Read existing provider JSON from default branch
  const existing = await getFileContent(deps, filePath, defaultBranch);
  if (!existing) {
    throw new Error(
      `providers/${slug}.json not found on ${defaultBranch}. ` +
        `Open a directory PR first via seller.open_directory_pr.`,
    );
  }

  // Merge updated chainlens block
  const updatedJson: Record<string, unknown> = {
    ...existing.content,
    chainlens: {
      ...(existing.content.chainlens as Record<string, unknown> | undefined),
      listing_status: listingStatus,
      listing_url: input.listing_url,
    },
  };

  const branch = `backfill-listing-${slug}-${Date.now()}`;
  await createBranch(deps, branch, sha, defaultBranch);

  const commitMsg = `chore: backfill listing URL for ${slug}`;
  const content = JSON.stringify(updatedJson, null, 2) + "\n";

  // Use existing blob SHA so the PUT is treated as an update
  await putFile(deps, filePath, branch, content, commitMsg, existing.sha);

  const prTitle = `chore: update listing status for ${slug}`;
  const prBody = buildPrBody(slug, input.listing_url, listingStatus);
  const prUrl = await openOrFindPr(deps, branch, defaultBranch, prTitle, prBody);

  return {
    pr_url: prUrl,
    updated_json: updatedJson,
    branch,
    warnings,
  };
}

function buildPrBody(slug: string, listingUrl: string, status: string): string {
  return [
    `## Backfill: ChainLens Listing URL for \`${slug}\``,
    "",
    "This PR was opened by the ChainLens MCP seller onboarding tool after successful on-chain registration.",
    "",
    `| Field | Value |`,
    `|---|---|`,
    `| \`chainlens.listing_status\` | \`${status}\` |`,
    `| \`chainlens.listing_url\` | ${listingUrl} |`,
    "",
    "---",
    "_No wallet operations are performed by this tool. The listing URL was set by the seller after registration._",
  ].join("\n");
}

export const backfillListingUrlToolDefinition = {
  name: "seller.backfill_listing_url",
  description:
    "Open a GitHub PR updating providers/<slug>.json with the ChainLens listing URL and status after successful on-chain registration. listing_url must be on a ChainLens-owned domain. Requires GITHUB_TOKEN, GITHUB_REPO_OWNER, and GITHUB_REPO_NAME.",
  inputSchema: {
    type: "object",
    required: ["provider_slug", "listing_url"],
    properties: {
      provider_slug: {
        type: "string",
        description: "Provider slug to update, e.g. 'alchemy'.",
      },
      listing_url: {
        type: "string",
        description:
          "Live ChainLens listing URL. Must be hosted on a ChainLens-owned domain (chainlens.pelicanlab.dev or chainlens.xyz).",
      },
      listing_status: {
        type: "string",
        enum: ["listed"],
        description: "Listing status to write. Only 'listed' is valid for a post-registration backfill.",
      },
    },
  },
} as const;
