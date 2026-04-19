import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SOURCIFY_BASE, makeVerifyHandler, type SourcifyDeps } from "./handler.js";

function fakeDeps(responder: (url: string) => { status: number; body: unknown }): {
  deps: SourcifyDeps;
  calls: string[];
} {
  const calls: string[] = [];
  const fakeFetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push(url);
    const { status, body } = responder(url);
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { deps: { fetch: fakeFetch, baseUrl: DEFAULT_SOURCIFY_BASE }, calls };
}

describe("sourcify verify handler", () => {
  it("maps 'perfect' to verified=true", async () => {
    const { deps, calls } = fakeDeps(() => ({
      status: 200,
      body: [{ address: "0x1f98", chainIds: [{ chainId: "1", status: "perfect" }], status: "perfect" }],
    }));
    const handler = makeVerifyHandler(deps);
    const out = (await handler({
      contract_address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
      chain_id: 1,
    })) as Record<string, unknown>;
    assert.equal(out.verified, true);
    assert.equal(out.match_type, "perfect");
    assert.ok(
      calls[0].includes("addresses=0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984"),
    );
    assert.ok(calls[0].includes("chainIds=1"));
  });

  it("marks unknown status as not verified", async () => {
    const { deps } = fakeDeps(() => ({ status: 200, body: [{ status: "false" }] }));
    const handler = makeVerifyHandler(deps);
    const out = (await handler({
      contract_address: "0x" + "1".repeat(40),
      chain_id: 1,
    })) as Record<string, unknown>;
    assert.equal(out.verified, false);
    assert.equal(out.match_type, null);
  });

  it("rejects malformed address", async () => {
    const { deps } = fakeDeps(() => ({ status: 200, body: [] }));
    const handler = makeVerifyHandler(deps);
    await assert.rejects(
      handler({ contract_address: "0xabc", chain_id: 1 }),
      /invalid contract_address/,
    );
  });

  it("wraps 500 upstream", async () => {
    const { deps } = fakeDeps(() => ({ status: 500, body: "" }));
    const handler = makeVerifyHandler(deps);
    await assert.rejects(
      handler({ contract_address: "0x" + "1".repeat(40), chain_id: 1 }),
      /Sourcify HTTP 500/,
    );
  });
});
