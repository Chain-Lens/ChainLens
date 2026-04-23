/**
 * MCP server wiring — binds the three ChainLens tools (discover, status, request)
 * to a @modelcontextprotocol/sdk Server. Transport-agnostic: index.ts plugs in
 * the stdio transport for Claude Desktop.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { discoverHandler, discoverToolDefinition, type DiscoverDeps } from "./tools/discover.js";
import { statusHandler, statusToolDefinition, type StatusDeps } from "./tools/status.js";
import { requestHandler, requestToolDefinition, type RequestDeps } from "./tools/request.js";
import { callHandler, callToolDefinition, type CallDeps } from "./tools/call.js";
import { inspectHandler, inspectToolDefinition, type InspectDeps } from "./tools/inspect.js";

export interface McpServerDeps {
  discover: DiscoverDeps;
  status: StatusDeps;
  inspect: InspectDeps;
  /** Omit to disable chain-lens.request (no wallet or no v2 escrow on this chain). */
  request?: RequestDeps;
  /** Omit to disable chain-lens.call (no wallet or no v3 market on this chain). */
  call?: CallDeps;
}

export function buildMcpServer(deps: McpServerDeps): Server {
  const server = new Server(
    { name: "chain-lens-mcp", version: "0.0.6" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools: unknown[] = [
      discoverToolDefinition,
      inspectToolDefinition,
      statusToolDefinition,
    ];
    if (deps.request) tools.push(requestToolDefinition);
    if (deps.call) tools.push(callToolDefinition);
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params;
    try {
      if (name === discoverToolDefinition.name) {
        const result = await discoverHandler(args as never, deps.discover);
        return toolTextResult(result);
      }
      if (name === statusToolDefinition.name) {
        const result = await statusHandler(args as never, deps.status);
        return toolTextResult(result);
      }
      if (name === inspectToolDefinition.name) {
        const result = await inspectHandler(args as never, deps.inspect);
        return toolTextResult(result);
      }
      if (name === requestToolDefinition.name) {
        if (!deps.request) {
          throw new Error(
            "chain-lens.request is not configured — set WALLET_PRIVATE_KEY (or CHAIN_LENS_SIGN_SOCKET) and point CHAIN_ID at a chain where v2 escrow is deployed.",
          );
        }
        const result = await requestHandler(args as never, deps.request);
        return toolTextResult(result);
      }
      if (name === callToolDefinition.name) {
        if (!deps.call) {
          throw new Error(
            "chain-lens.call is not configured — set WALLET_PRIVATE_KEY (or CHAIN_LENS_SIGN_SOCKET) and point CHAIN_ID at a chain where ChainLensMarket is deployed.",
          );
        }
        const result = await callHandler(args as never, deps.call);
        return toolTextResult(result);
      }
      throw new Error(`Unknown tool: ${name}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: "text", text: message }],
      };
    }
  });

  return server;
}

function toolTextResult(payload: unknown) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, jsonReplacer, 2),
      },
    ],
  };
}

function jsonReplacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}
