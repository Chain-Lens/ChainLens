// Orchestrator that runs pure-computation steps inline and returns a structured
// step plan for the rest. Two paths:
//   fast             — skip GitHub PR, go straight to listing prep + registration
//   directory_backed — GitHub PR first, then claim/import for public discovery
//
// This tool does NOT open PRs or sign transactions. It sets requires_confirmation
// on those steps so the agent pauses and asks the user before proceeding.

import {
  prepareProviderEntryHandler,
  type PrepareProviderEntryResult,
  type ChainLensIntent,
} from "./prepare-provider-entry.js";
import {
  preparePaidListingHandler,
  type PreparePaidListingResult,
  type DirectoryMetadata,
} from "./prepare-paid-listing.js";
import { isValidSlug } from "./common.js";

// Accept either a raw DirectoryMetadata or the full ImportDirectoryProviderResult
// shape ({ listing_prefill: ..., provider: ..., ... }). The agent may pass either.
type ImportedMetadataInput = DirectoryMetadata | { listing_prefill: DirectoryMetadata | null };

function unwrapImportedMetadata(
  raw: ImportedMetadataInput | undefined,
): DirectoryMetadata | undefined {
  if (!raw) return undefined;
  if ("listing_prefill" in raw) return (raw.listing_prefill as DirectoryMetadata) ?? undefined;
  return raw as unknown as DirectoryMetadata;
}

export type OnboardPath = "fast" | "directory_backed";
export type StepStatus = "done" | "ready" | "pending" | "needs_confirmation";

export interface OnboardProviderInput {
  /** Onboarding path. "fast" skips GitHub PR; "directory_backed" creates public directory entry first. */
  path: OnboardPath;

  // Provider identity (passed to seller.prepare_provider_entry)
  name: string;
  slug: string;
  category: string;
  description: string;
  website?: string;
  docs?: string;
  source_attestation?: string;

  // Paid listing fields (passed to seller.prepare_paid_listing)
  endpoint?: string;
  method?: "GET" | "POST";
  price_usdc?: number;
  output_schema?: unknown;
  payout_address?: string;

  /**
   * Pass the result of seller.import_directory_provider (or its listing_prefill field)
   * here to skip re-importing. Accepts either the raw DirectoryMetadata shape or the
   * full import result ({ listing_prefill, provider, ... }); listing_prefill is
   * automatically extracted when the full result is passed.
   */
  imported_directory_metadata?: ImportedMetadataInput;

  /**
   * When the metadata URI is already known (e.g. from a prior upload), provide it
   * so the registration step args are fully populated.
   */
  metadata_uri?: string;
  /** Optional SHA-256 hex for hash verification during registration. */
  expected_metadata_hash?: string;

  // GitHub PR customization (used in directory_backed path)
  branch_name?: string;
  pr_title?: string;
  pr_body?: string;
}

export interface OnboardStep {
  /** Human-readable label. */
  step: string;
  /** MCP tool name. Empty string means this step was executed inline. */
  tool: string;
  status: StepStatus;
  /** True = agent must ask the user before calling this tool. */
  requires_confirmation: boolean;
  /** One-line description of what this step does. */
  description: string;
  /**
   * Ready-to-use args for the tool call. Populated for all steps so the agent
   * can copy-paste without extra assembly. Empty object for inline-done steps.
   */
  args: Record<string, unknown>;
  /** Populated when status is "done" and the step ran inline. */
  result?: unknown;
  /** Populated when status is "pending" and waiting on a prior step. */
  blocked_by?: string;
}

export interface OnboardProviderResult {
  path: OnboardPath;
  /** Inline result of seller.prepare_provider_entry. */
  provider_entry: PrepareProviderEntryResult;
  /** Inline result of seller.prepare_paid_listing (may be readiness: "incomplete"). */
  listing_prep: PreparePaidListingResult;
  /** Ordered step plan for the full onboarding flow. */
  steps: OnboardStep[];
  warnings: string[];
  /** Single-sentence status summary for the agent. */
  summary: string;
}

export function onboardProviderHandler(input: OnboardProviderInput): OnboardProviderResult {
  const warnings: string[] = [];

  // ── 1. prepare_provider_entry (inline) ──────────────────────────────────
  const clIntent: ChainLensIntent | undefined =
    input.path === "directory_backed"
      ? { wants_listing: true, listing_status: "not_listed" }
      : undefined;

  const providerEntry = prepareProviderEntryHandler({
    name: input.name,
    slug: input.slug,
    category: input.category,
    description: input.description,
    website: input.website,
    docs: input.docs,
    source_attestation: input.source_attestation,
    chainlens_intent: clIntent,
  });
  warnings.push(...providerEntry.warnings);

  // ── 2. prepare_paid_listing (inline) ────────────────────────────────────
  const dirMeta = unwrapImportedMetadata(input.imported_directory_metadata);

  const listingPrep = preparePaidListingHandler({
    provider_slug: input.slug,
    name: input.name,
    description: input.description,
    directory_metadata: dirMeta,
    endpoint: input.endpoint,
    method: input.method,
    price_usdc: input.price_usdc,
    output_schema: input.output_schema as Record<string, unknown>,
    payout_address: input.payout_address,
  });
  // Listing warnings are visible through listing_prep; don't duplicate at top level
  // unless they indicate a hard block.

  // ── 3. Build step plan ───────────────────────────────────────────────────
  const steps: OnboardStep[] = [];
  const slug = input.slug ?? "unknown";

  // Step: prepare_provider_entry — always done inline
  steps.push({
    step: "1. Prepare provider entry",
    tool: "seller.prepare_provider_entry",
    status: "done",
    requires_confirmation: false,
    description: "Build providers/<slug>.json from seller-provided facts.",
    args: {},
    result: providerEntry,
  });

  if (input.path === "directory_backed") {
    // Step: open_directory_pr — always needs confirmation
    const prTitle = input.pr_title ?? `feat: add ${input.name ?? slug} to provider directory`;
    const prBody =
      input.pr_body ??
      `Adds ${input.name ?? slug} to the awesome-onchain-data-providers directory.\n\nProvider slug: \`${slug}\``;
    const branchName =
      input.branch_name ?? `add-provider-${slug}-${new Date().toISOString().slice(0, 10)}`;

    steps.push({
      step: "2. Open directory PR",
      tool: "seller.open_directory_pr",
      status: "needs_confirmation",
      requires_confirmation: true,
      description: "Open a GitHub PR to publish the provider entry for public discovery.",
      args: {
        provider_entries: [
          {
            slug,
            filename: providerEntry.filename,
            provider_json: providerEntry.provider_json,
          },
        ],
        branch_name: branchName,
        pr_title: prTitle,
        pr_body: prBody,
      },
    });

    // Step: import_directory_provider — blocked until PR is merged
    steps.push({
      step: "3. Import directory provider",
      tool: "seller.import_directory_provider",
      status: input.imported_directory_metadata ? "done" : "pending",
      requires_confirmation: false,
      description:
        "Import the merged directory entry to prefill ChainLens listing fields. Run after the PR is merged.",
      args: { provider_slug: slug },
      ...(input.imported_directory_metadata
        ? { result: { provider: input.imported_directory_metadata } }
        : { blocked_by: "seller.open_directory_pr must be merged before importing." }),
    });
  }

  // Step: preflight_endpoint
  const stepNum = input.path === "directory_backed" ? 4 : 2;
  const hasEndpoint = !!input.endpoint;
  steps.push({
    step: `${stepNum}. Preflight endpoint`,
    tool: "seller.preflight_endpoint",
    status: hasEndpoint ? "ready" : "pending",
    requires_confirmation: false,
    description: "Test the seller endpoint through ChainLens backend safety checks.",
    args: {
      endpoint: input.endpoint ?? "",
      method: input.method ?? "GET",
      ...(input.output_schema ? { output_schema: input.output_schema } : {}),
    },
    ...(!hasEndpoint
      ? { blocked_by: "endpoint is required to run preflight." }
      : {}),
  });

  // Step: draft_output_schema (optional, only shown when no schema yet)
  if (!input.output_schema) {
    steps.push({
      step: `${stepNum + 1}. Draft output schema`,
      tool: "seller.draft_output_schema",
      status: "pending",
      requires_confirmation: false,
      description:
        "Generate a JSON Schema from a sample response. Run after preflight to get body_sample.",
      args: { sample_response: null },
      blocked_by: "seller.preflight_endpoint body_sample needed as sample_response.",
    });
  }

  // Step: prepare_paid_listing — done inline
  steps.push({
    step: `${input.output_schema ? stepNum + 1 : stepNum + 2}. Prepare paid listing`,
    tool: "seller.prepare_paid_listing",
    status: "done",
    requires_confirmation: false,
    description: "Assemble ChainLens listing metadata. Readiness shows whether all fields are set.",
    args: {},
    result: listingPrep,
  });

  // Step: register_paid_listing
  const metaUri = input.metadata_uri;
  const canRegister =
    listingPrep.readiness === "ready" &&
    !!metaUri &&
    !!input.payout_address;

  steps.push({
    step: `${input.output_schema ? stepNum + 2 : stepNum + 3}. Register paid listing`,
    tool: "seller.register_paid_listing",
    status: canRegister ? "needs_confirmation" : "pending",
    requires_confirmation: true,
    description: "Sign and submit ChainLensMarket.register on-chain. Requires user confirmation.",
    args: {
      provider_slug: slug,
      payout_address: input.payout_address ?? "",
      metadata_uri: metaUri ?? "",
      ...(input.expected_metadata_hash
        ? { expected_metadata_hash: input.expected_metadata_hash }
        : {}),
    },
    ...(!canRegister
      ? {
          blocked_by: !metaUri
            ? "metadata_uri required — upload metadata and pass the returned URI."
            : !input.payout_address
              ? "payout_address is required."
              : "listing_prep readiness must be \"ready\" before registering.",
        }
      : {}),
  });

  // Step: backfill_listing_url (directory_backed only)
  if (input.path === "directory_backed") {
    steps.push({
      step: `${input.output_schema ? stepNum + 3 : stepNum + 4}. Backfill listing URL`,
      tool: "seller.backfill_listing_url",
      status: "pending",
      requires_confirmation: true,
      description:
        "Open a follow-up PR updating the directory entry with the ChainLens listing URL.",
      args: {
        provider_slug: slug,
        listing_url: "",
        listing_status: "listed",
      },
      blocked_by:
        "seller.register_paid_listing listing_url needed — pass it to listing_url arg.",
    });
  }

  // ── 4. Build summary ─────────────────────────────────────────────────────
  const readyToRegister = canRegister;
  const missingListingFields = listingPrep.next_steps.length;
  const hasEntryWarnings = providerEntry.missing_fields.length > 0;

  let summary: string;
  if (hasEntryWarnings) {
    summary = `Provider entry for "${input.name ?? slug}" has missing fields: ${providerEntry.missing_fields.join(", ")}. Fix these before opening the PR.`;
  } else if (readyToRegister) {
    summary = `"${input.name ?? slug}" is ready to register on-chain via the ${input.path === "fast" ? "fast" : "directory-backed"} path. Confirm the registration step to proceed.`;
  } else if (missingListingFields > 0) {
    summary = `"${input.name ?? slug}" provider entry is ready. Listing is incomplete — ${missingListingFields} field(s) still needed before registration.`;
  } else {
    summary = `"${input.name ?? slug}" provider entry prepared via ${input.path === "fast" ? "fast" : "directory-backed"} path. Review the step plan and proceed.`;
  }

  return {
    path: input.path,
    provider_entry: providerEntry,
    listing_prep: listingPrep,
    steps,
    warnings,
    summary,
  };
}

export const onboardProviderToolDefinition = {
  name: "seller.onboard_provider",
  description:
    "High-level orchestrator for the full provider onboarding flow. " +
    "Runs prepare_provider_entry and prepare_paid_listing inline, then returns an ordered step plan " +
    "for preflight, PR creation, directory import, on-chain registration, and URL backfill. " +
    "Two paths: 'fast' (skip GitHub PR) or 'directory_backed' (public directory entry first). " +
    "Steps marked requires_confirmation=true must not be executed without explicit user approval. " +
    "Does NOT open PRs or sign transactions — those remain separate tool calls.",
  inputSchema: {
    type: "object",
    required: ["path", "name", "slug", "category", "description"],
    properties: {
      path: {
        type: "string",
        enum: ["fast", "directory_backed"],
        description:
          "'fast' skips GitHub PR and goes straight to listing. " +
          "'directory_backed' creates a public directory entry first, then imports it for ChainLens prefill.",
      },
      name: { type: "string", description: "Human-readable provider name, e.g. 'Alchemy'." },
      slug: {
        type: "string",
        description: "URL-safe lowercase identifier, e.g. 'alchemy'.",
      },
      category: {
        type: "string",
        enum: ["rpc", "indexer", "oracle", "analytics", "subgraph", "specialized"],
      },
      description: { type: "string", description: "Short factual description." },
      website: { type: "string" },
      docs: { type: "string" },
      source_attestation: {
        type: "string",
        description: "Official HTTPS URL proving information source.",
      },
      endpoint: { type: "string", description: "Seller API endpoint URL." },
      method: { type: "string", enum: ["GET", "POST"] },
      price_usdc: { type: "number", description: "Per-call price in USDC display units." },
      output_schema: { description: "JSON Schema for the endpoint response." },
      payout_address: { type: "string", description: "EVM address to receive USDC payments." },
      imported_directory_metadata: {
        type: "object",
        description:
          "Pass either the full result of seller.import_directory_provider " +
          "({ listing_prefill, provider, ... }) or just the listing_prefill object directly. " +
          "listing_prefill is automatically extracted from the full result. " +
          "Skips the import step and uses this data for name/description/tags prefill.",
      },
      metadata_uri: {
        type: "string",
        description:
          "Already-uploaded metadata URI. When provided, the registration step args are fully populated.",
      },
      expected_metadata_hash: {
        type: "string",
        description: "SHA-256 hex of the metadata content for hash verification.",
      },
      branch_name: {
        type: "string",
        description: "Git branch name for the directory PR (directory_backed path).",
      },
      pr_title: { type: "string", description: "PR title override." },
      pr_body: { type: "string", description: "PR body override." },
    },
  },
} as const;
