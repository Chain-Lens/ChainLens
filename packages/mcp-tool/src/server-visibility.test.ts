import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildMcpServer } from "./server.js";

function baseDeps() {
  return {
    discover: { apiBaseUrl: "https://chainlens.example/api", fetch: fetch },
    status: { apiBaseUrl: "https://chainlens.example/api", fetch: fetch },
    inspect: { apiBaseUrl: "https://chainlens.example/api", fetch: fetch },
    seller: { apiBaseUrl: "https://chainlens.example/api", fetch: fetch },
    sellerDraft: { apiBaseUrl: "https://chainlens.example/api", fetch: fetch },
  } as any;
}

async function listToolNames(deps: unknown): Promise<string[]> {
  const mcp = buildMcpServer(deps as never) as any;
  const handler = mcp.server._requestHandlers.get("tools/list");
  const result = await handler({ method: "tools/list", params: {} }, {});
  return result.tools.map((tool: { name: string }) => tool.name);
}

describe("buildMcpServer tool visibility", () => {
  it("keeps read/prep and onboard tools visible without wallet or GitHub deps", async () => {
    const names = await listToolNames(baseDeps());

    assert.ok(names.includes("chain-lens.discover"));
    assert.ok(names.includes("seller.prepare_provider_entry"));
    assert.ok(names.includes("seller.prepare_paid_listing"));
    assert.ok(names.includes("seller.onboard_provider"));
    assert.ok(!names.includes("seller.register_paid_listing"));
    assert.ok(!names.includes("seller.open_directory_pr"));
    assert.ok(!names.includes("seller.backfill_listing_url"));
  });

  it("shows registration only when registration signing deps are wired", async () => {
    const names = await listToolNames({
      ...baseDeps(),
      registerListing: {},
    });

    assert.ok(names.includes("seller.register_paid_listing"));
  });

  it("hides registration for pre-SDK WAIAAS wiring", async () => {
    const names = await listToolNames(baseDeps());

    assert.ok(!names.includes("seller.register_paid_listing"));
  });

  it("shows GitHub seller tools only when GitHub deps are wired", async () => {
    const hidden = await listToolNames(baseDeps());
    const visible = await listToolNames({
      ...baseDeps(),
      github: {},
    });

    assert.ok(!hidden.includes("seller.open_directory_pr"));
    assert.ok(!hidden.includes("seller.backfill_listing_url"));
    assert.ok(visible.includes("seller.open_directory_pr"));
    assert.ok(visible.includes("seller.backfill_listing_url"));
  });

  it("shows publish_listing_metadata_gist only when GitHub deps are wired", async () => {
    const hidden = await listToolNames(baseDeps());
    const visible = await listToolNames({
      ...baseDeps(),
      github: {},
    });

    assert.ok(!hidden.includes("seller.publish_listing_metadata_gist"));
    assert.ok(visible.includes("seller.publish_listing_metadata_gist"));
  });
});
