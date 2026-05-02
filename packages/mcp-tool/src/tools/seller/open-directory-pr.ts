import { isValidSlug } from "./common.js";
import {
  type GitHubDeps,
  getDefaultBranchSha,
  createBranch,
  getFileSha,
  putFile,
  openOrFindPr,
} from "./github.js";

export interface ProviderEntry {
  slug: string;
  /** Output of seller.prepare_provider_entry — the JSON to commit. */
  provider_json: Record<string, unknown>;
}

export interface OpenDirectoryPrInput {
  /** One or more provider entries to write. Each becomes providers/<slug>.json. */
  provider_entries: ProviderEntry[];
  /** Branch name to create. Auto-generated from slugs if omitted. */
  branch_name?: string;
  /** Commit message. Auto-generated if omitted. */
  commit_message?: string;
  /** PR title. Auto-generated if omitted. */
  pr_title?: string;
  /** PR body (markdown). Auto-generated if omitted. */
  pr_body?: string;
}

export interface OpenDirectoryPrResult {
  pr_url: string;
  branch: string;
  files_written: string[];
  /** Human-readable summary of what was added/updated. */
  diff_summary: string;
  warnings: string[];
}

export type OpenDirectoryPrDeps = GitHubDeps;

export async function openDirectoryPrHandler(
  input: OpenDirectoryPrInput,
  deps: OpenDirectoryPrDeps,
): Promise<OpenDirectoryPrResult> {
  const warnings: string[] = [];

  if (!input.provider_entries?.length) {
    throw new Error("provider_entries must contain at least one entry.");
  }

  // [Medium] Phase B is actual GitHub writes — invalid slugs are rejected, not warned.
  for (const entry of input.provider_entries) {
    if (!isValidSlug(entry.slug)) {
      throw new Error(
        `slug "${entry.slug}" is invalid. Use lowercase letters, numbers, and hyphens only (e.g. "my-provider"). Fix the slug before opening a PR.`,
      );
    }
    // [Low] File path is derived from entry.slug; provider_json.slug must match.
    const jsonSlug = entry.provider_json.slug as string | undefined;
    if (jsonSlug && jsonSlug !== entry.slug) {
      throw new Error(
        `provider_json.slug "${jsonSlug}" does not match entry.slug "${entry.slug}". ` +
          `The file will be named providers/${entry.slug}.json — ensure the JSON slug matches to avoid inconsistent metadata.`,
      );
    }
  }

  const slugs = input.provider_entries.map((e) => e.slug);
  const branch =
    input.branch_name?.trim() ||
    `add-provider-${slugs.join("-")}-${Date.now()}`;
  const commitMsg =
    input.commit_message?.trim() ||
    `chore: add provider entr${slugs.length === 1 ? "y" : "ies"} for ${slugs.join(", ")}`;
  const prTitle =
    input.pr_title?.trim() ||
    `Add provider: ${slugs.join(", ")}`;
  const prBody =
    input.pr_body?.trim() ||
    buildDefaultPrBody(input.provider_entries);

  // Get default branch tip SHA first so we can validate branch_name against it.
  const { defaultBranch, sha } = await getDefaultBranchSha(deps);

  // [High] createBranch rejects branch_name === defaultBranch; pass defaultBranch for that check.
  await createBranch(deps, branch, sha, defaultBranch);

  // Write each provider file
  const filesWritten: string[] = [];
  const diffLines: string[] = [];

  for (const entry of input.provider_entries) {
    const filePath = `providers/${entry.slug}.json`;
    const existingSha = await getFileSha(deps, filePath, branch);
    const content = JSON.stringify(entry.provider_json, null, 2) + "\n";

    await putFile(deps, filePath, branch, content, commitMsg, existingSha);

    filesWritten.push(filePath);
    diffLines.push(`${existingSha ? "M" : "A"} ${filePath}`);
  }

  // Open or find existing PR
  const prUrl = await openOrFindPr(deps, branch, defaultBranch, prTitle, prBody);

  return {
    pr_url: prUrl,
    branch,
    files_written: filesWritten,
    diff_summary: diffLines.join("\n"),
    warnings,
  };
}

function buildDefaultPrBody(entries: ProviderEntry[]): string {
  const lines: string[] = [
    "## Provider Directory Addition",
    "",
    "This PR was opened by the ChainLens MCP seller onboarding tool.",
    "",
    "### Files",
    ...entries.map((e) => `- \`providers/${e.slug}.json\``),
    "",
    "### Provider Details",
    ...entries.flatMap((e) => [
      `**${e.provider_json.name ?? e.slug}**`,
      e.provider_json.description ? `> ${e.provider_json.description}` : "",
      e.provider_json.website ? `Website: ${e.provider_json.website}` : "",
      e.provider_json.source_attestation
        ? `Source attestation: ${e.provider_json.source_attestation}`
        : "",
      "",
    ]),
    "---",
    "_Phase A: no wallet, no on-chain registration. Listing intent is an intent signal only._",
  ];
  return lines.filter((l) => l !== null).join("\n");
}

export const openDirectoryPrToolDefinition = {
  name: "seller.open_directory_pr",
  description:
    "Open (or find an existing) GitHub PR adding provider JSON files to the awesome-onchain-data-providers directory. Pass the provider_json output from seller.prepare_provider_entry. Requires GITHUB_TOKEN, GITHUB_REPO_OWNER, and GITHUB_REPO_NAME to be set.",
  inputSchema: {
    type: "object",
    required: ["provider_entries"],
    properties: {
      provider_entries: {
        type: "array",
        description:
          "One or more provider entries to write. Each entry becomes providers/<slug>.json. Use the output of seller.prepare_provider_entry.",
        items: {
          type: "object",
          required: ["slug", "provider_json"],
          properties: {
            slug: { type: "string", description: "Provider slug, e.g. 'alchemy'." },
            provider_json: {
              type: "object",
              description: "Provider JSON from seller.prepare_provider_entry.",
            },
          },
        },
      },
      branch_name: {
        type: "string",
        description: "Branch to create. Auto-generated from slugs if omitted.",
      },
      commit_message: {
        type: "string",
        description: "Git commit message. Auto-generated if omitted.",
      },
      pr_title: {
        type: "string",
        description: "Pull request title. Auto-generated if omitted.",
      },
      pr_body: {
        type: "string",
        description: "Pull request body (markdown). Auto-generated if omitted.",
      },
    },
  },
} as const;
