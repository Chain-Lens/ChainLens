import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_DEFILLAMA_BASE, makeTvlHandler, type DefillamaDeps } from "./handler.js";

function fakeDeps(responder: (url: string) => { status: number; body: unknown }): {
  deps: DefillamaDeps;
  calls: string[];
} {
  const calls: string[] = [];
  const fakeFetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push(url);
    const { status, body } = responder(url);
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { deps: { fetch: fakeFetch, baseUrl: DEFAULT_DEFILLAMA_BASE }, calls };
}

describe("defillama tvl handler", () => {
  it("summarises chainTvls and surfaces tvl", async () => {
    const { deps, calls } = fakeDeps(() => ({
      status: 200,
      body: {
        name: "Uniswap",
        category: "Dexes",
        tvl: 4_500_000_000,
        chainTvls: {
          Ethereum: { tvl: 3_000_000_000 },
          Arbitrum: { tvl: 500_000_000 },
          Junk: "oops",
        },
      },
    }));
    const handler = makeTvlHandler(deps);
    const out = (await handler({ protocol: "uniswap" })) as Record<string, unknown>;
    assert.equal(out.protocol, "uniswap");
    assert.equal(out.tvl_usd, 4_500_000_000);
    const chains = out.chain_tvls as Record<string, number>;
    assert.equal(chains.Ethereum, 3_000_000_000);
    assert.equal(chains.Junk, undefined);
    assert.ok(calls[0].endsWith("/protocol/uniswap"));
  });

  it("rejects garbage protocol slugs", async () => {
    const { deps } = fakeDeps(() => ({ status: 200, body: {} }));
    const handler = makeTvlHandler(deps);
    await assert.rejects(
      handler({ protocol: "Drop;Table--" }),
      /invalid protocol slug/,
    );
  });

  it("wraps 404 as UpstreamError", async () => {
    const { deps } = fakeDeps(() => ({ status: 404, body: { error: "not found" } }));
    const handler = makeTvlHandler(deps);
    await assert.rejects(handler({ protocol: "unknown-proto" }), /DeFiLlama HTTP 404/);
  });
});
