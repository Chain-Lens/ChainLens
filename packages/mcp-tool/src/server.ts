/**
 * MCP server wiring — binds ChainLens buyer and seller tools.
 * Transport-agnostic: index.ts plugs in the stdio transport.
 *
 * We use McpServer as a container (to avoid the deprecated low-level Server
 * constructor) but register handlers on the underlying server directly.
 * McpServer.registerTool only accepts Zod schemas for inputSchema; our tools
 * use plain JSON Schema objects so that descriptions flow to Claude without
 * pulling in Zod. Dynamic per-dep listing (Phase B/C only when env is set)
 * requires the manual setRequestHandler pattern anyway.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
} from "@modelcontextprotocol/sdk/types.js";

import { discoverHandler, discoverToolDefinition, type DiscoverDeps } from "./tools/discover.js";
import { statusHandler, statusToolDefinition, type StatusDeps } from "./tools/status.js";
import { requestHandler, requestToolDefinition, type RequestDeps } from "./tools/request.js";
import { callHandler, callToolDefinition, type CallDeps } from "./tools/call.js";
import { inspectHandler, inspectToolDefinition, type InspectDeps } from "./tools/inspect.js";

// Seller Phase A
import {
  draftOutputSchemaHandler,
  draftOutputSchemaToolDefinition,
} from "./tools/seller/draft-output-schema.js";
import {
  preflightEndpointHandler,
  preflightEndpointToolDefinition,
  type PreflightEndpointDeps,
} from "./tools/seller/preflight-endpoint.js";
import {
  importDirectoryProviderHandler,
  importDirectoryProviderToolDefinition,
  type ImportDirectoryProviderDeps,
} from "./tools/seller/import-directory-provider.js";
import {
  prepareProviderEntryHandler,
  prepareProviderEntryToolDefinition,
} from "./tools/seller/prepare-provider-entry.js";
import {
  preparePaidListingHandler,
  preparePaidListingToolDefinition,
} from "./tools/seller/prepare-paid-listing.js";

// Seller Phase B
import {
  openDirectoryPrHandler,
  openDirectoryPrToolDefinition,
  type OpenDirectoryPrDeps,
} from "./tools/seller/open-directory-pr.js";
import {
  backfillListingUrlHandler,
  backfillListingUrlToolDefinition,
  type BackfillListingUrlDeps,
} from "./tools/seller/backfill-listing-url.js";
import {
  publishListingMetadataGistHandler,
  publishListingMetadataGistToolDefinition,
} from "./tools/seller/publish-listing-metadata-gist.js";

// Seller Phase B.5
import {
  inspectProviderDraftHandler,
  inspectProviderDraftToolDefinition,
  type InspectProviderDraftDeps,
} from "./tools/seller/inspect-provider-draft.js";
import {
  claimHandoffHandler,
  claimHandoffToolDefinition,
} from "./tools/seller/claim-handoff.js";
import {
  linkListingDraftHandler,
  linkListingDraftToolDefinition,
  type LinkListingDraftDeps,
} from "./tools/seller/link-listing-draft.js";

// Seller Phase C
import {
  registerPaidListingHandler,
  registerPaidListingToolDefinition,
  type RegisterPaidListingDeps,
} from "./tools/seller/register-paid-listing.js";

// Seller Phase D
import {
  onboardProviderHandler,
  onboardProviderToolDefinition,
} from "./tools/seller/onboard-provider.js";

export interface McpServerDeps {
  discover: DiscoverDeps;
  status: StatusDeps;
  inspect: InspectDeps;
  /** Seller Phase A tools share the same read deps. */
  seller: PreflightEndpointDeps & ImportDirectoryProviderDeps;
  /**
   * Seller Phase B GitHub deps. Omit to hide open_directory_pr and
   * backfill_listing_url from the tool list (GITHUB_TOKEN not configured).
   */
  github?: OpenDirectoryPrDeps & BackfillListingUrlDeps;
  /**
   * Seller Phase B.5 deps (inspect_provider_draft, link_listing_draft).
   * claim_handoff is pure computation and shares apiBaseUrl from this dep.
   */
  sellerDraft: InspectProviderDraftDeps & LinkListingDraftDeps;
  /**
   * Seller Phase C — register_paid_listing.
   * Omit when no usable registration signing provider is configured.
   * This hides the tool for read-only installs and for pre-SDK WAIAAS setups.
   */
  registerListing?: RegisterPaidListingDeps;
  /** Omit to disable chain-lens.request (no wallet or no v2 escrow on this chain). */
  request?: RequestDeps;
  /** Omit to disable chain-lens.call (no wallet or no v3 market on this chain). */
  call?: CallDeps;
}

export function buildMcpServer(deps: McpServerDeps): McpServer {
  // McpServer owns the transport lifecycle; we register handlers on the
  // underlying server directly to keep plain JSON Schema inputSchema support.
  const mcpServer = new McpServer(
    { name: "chain-lens-mcp", version: "0.0.9" },
    { capabilities: { tools: {} } },
  );
  const server = mcpServer.server;

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools: unknown[] = [
      discoverToolDefinition,
      inspectToolDefinition,
      statusToolDefinition,
      // Seller Phase A — always listed, no wallet required
      prepareProviderEntryToolDefinition,
      importDirectoryProviderToolDefinition,
      preflightEndpointToolDefinition,
      draftOutputSchemaToolDefinition,
      preparePaidListingToolDefinition,
      // Seller Phase B.5 — always listed (apiBaseUrl is always present)
      inspectProviderDraftToolDefinition,
      claimHandoffToolDefinition,
      linkListingDraftToolDefinition,
      // Seller Phase D — always listed (pure computation, no wallet)
      onboardProviderToolDefinition,
    ];
    // Seller Phase B — only when GitHub token is configured
    if (deps.github) {
      tools.push(publishListingMetadataGistToolDefinition);
      tools.push(openDirectoryPrToolDefinition);
      tools.push(backfillListingUrlToolDefinition);
    }
    // Seller Phase C — only when a usable registration signing provider is configured
    if (deps.registerListing) tools.push(registerPaidListingToolDefinition);
    if (deps.request) tools.push(requestToolDefinition);
    if (deps.call) tools.push(callToolDefinition);
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params;
    try {
      // Buyer tools
      if (name === discoverToolDefinition.name)
        return toolTextResult(await discoverHandler(args as never, deps.discover));
      if (name === statusToolDefinition.name)
        return toolTextResult(await statusHandler(args as never, deps.status));
      if (name === inspectToolDefinition.name)
        return toolTextResult(await inspectHandler(args as never, deps.inspect));
      if (name === requestToolDefinition.name) {
        if (!deps.request) throw new Error("chain-lens.request is not configured — set CHAIN_LENS_WALLET_PRIVATE_KEY (or CHAIN_LENS_SIGN_SOCKET) and point CHAIN_LENS_CHAIN_ID at a chain where v2 escrow is deployed.");
        return toolTextResult(await requestHandler(args as never, deps.request));
      }
      if (name === callToolDefinition.name) {
        if (!deps.call) throw new Error("chain-lens.call is not configured — set CHAIN_LENS_WALLET_PRIVATE_KEY (or CHAIN_LENS_SIGN_SOCKET) and point CHAIN_LENS_CHAIN_ID at a chain where ChainLensMarket is deployed.");
        return toolTextResult(await callHandler(args as never, deps.call));
      }

      // Seller Phase A
      if (name === prepareProviderEntryToolDefinition.name)
        return toolTextResult(prepareProviderEntryHandler(args as never));
      if (name === importDirectoryProviderToolDefinition.name)
        return toolTextResult(await importDirectoryProviderHandler(args as never, deps.seller));
      if (name === preflightEndpointToolDefinition.name)
        return toolTextResult(await preflightEndpointHandler(args as never, deps.seller));
      if (name === draftOutputSchemaToolDefinition.name)
        return toolTextResult(draftOutputSchemaHandler(args as never));
      if (name === preparePaidListingToolDefinition.name)
        return toolTextResult(preparePaidListingHandler(args as never));

      // Seller Phase B.5
      if (name === inspectProviderDraftToolDefinition.name)
        return toolTextResult(await inspectProviderDraftHandler(args as never, deps.sellerDraft));
      if (name === claimHandoffToolDefinition.name)
        return toolTextResult(claimHandoffHandler(args as never, { apiBaseUrl: deps.sellerDraft.apiBaseUrl }));
      if (name === linkListingDraftToolDefinition.name)
        return toolTextResult(await linkListingDraftHandler(args as never, deps.sellerDraft));

      // Seller Phase B
      if (name === publishListingMetadataGistToolDefinition.name) {
        if (!deps.github) throw new Error("seller.publish_listing_metadata_gist is not configured — set GITHUB_TOKEN to enable metadata Gist publishing.");
        return toolTextResult(await publishListingMetadataGistHandler(args as never, deps.github));
      }
      if (name === openDirectoryPrToolDefinition.name) {
        if (!deps.github) throw new Error("seller.open_directory_pr is not configured — set GITHUB_TOKEN, GITHUB_REPO_OWNER, and GITHUB_REPO_NAME.");
        return toolTextResult(await openDirectoryPrHandler(args as never, deps.github));
      }
      if (name === backfillListingUrlToolDefinition.name) {
        if (!deps.github) throw new Error("seller.backfill_listing_url is not configured — set GITHUB_TOKEN, GITHUB_REPO_OWNER, and GITHUB_REPO_NAME.");
        return toolTextResult(await backfillListingUrlHandler(args as never, deps.github));
      }

      // Seller Phase C
      if (name === registerPaidListingToolDefinition.name) {
        if (!deps.registerListing) throw new Error("seller.register_paid_listing is not configured — set CHAIN_LENS_WALLET_PRIVATE_KEY (testnet) or CHAIN_LENS_SIGN_SOCKET (recommended) to enable on-chain registration.");
        return toolTextResult(await registerPaidListingHandler(args as never, deps.registerListing));
      }

      // Seller Phase D
      if (name === onboardProviderToolDefinition.name)
        return toolTextResult(onboardProviderHandler(args as never));

      throw new Error(`Unknown tool: ${name}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { isError: true, content: [{ type: "text", text: message }] };
    }
  });

  return mcpServer;
}

function toolTextResult(payload: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, jsonReplacer, 2) }],
  };
}

function jsonReplacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}
