import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_BLOCKSCOUT_BASES,
  makeContractSourceHandler,
  makeTxInfoHandler,
  type BlockscoutDeps,
} from "./handler.js";

function fakeDeps(responder: (url: string) => { status: number; body: unknown }): {
  deps: BlockscoutDeps;
  calls: string[];
} {
  const calls: string[] = [];
  const fakeFetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push(url);
    const { status, body } = responder(url);
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return {
    deps: {
      fetch: fakeFetch,
      baseUrlFor: (chainId: number) => DEFAULT_BLOCKSCOUT_BASES[chainId],
    },
    calls,
  };
}

describe("blockscout contract_source handler", () => {
  it("returns normalized shape for a verified contract", async () => {
    const { deps, calls } = fakeDeps(() => ({
      status: 200,
      body: {
        name: "UniswapV3",
        compiler_version: "0.7.6",
        optimization_enabled: true,
        source_code: "contract Uni {}",
        abi: [],
        is_verified: true,
      },
    }));
    const handler = makeContractSourceHandler(deps);
    const out = (await handler({
      contract_address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
      chain_id: 1,
    })) as Record<string, unknown>;
    assert.equal(out.name, "UniswapV3");
    assert.equal(out.verified, true);
    assert.ok(calls[0].includes("/api/v2/smart-contracts/0x1f98"));
  });

  it("rejects malformed address", async () => {
    const { deps } = fakeDeps(() => ({ status: 200, body: {} }));
    const handler = makeContractSourceHandler(deps);
    await assert.rejects(
      handler({ contract_address: "0xnope", chain_id: 1 }),
      /invalid contract_address/,
    );
  });

  it("rejects unknown chain id", async () => {
    const { deps } = fakeDeps(() => ({ status: 200, body: {} }));
    const handler = makeContractSourceHandler(deps);
    await assert.rejects(
      handler({
        contract_address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
        chain_id: 999999,
      }),
      /unsupported chain_id/,
    );
  });

  it("wraps non-200 upstream as UpstreamError", async () => {
    const { deps } = fakeDeps(() => ({ status: 500, body: { error: "boom" } }));
    const handler = makeContractSourceHandler(deps);
    await assert.rejects(
      handler({
        contract_address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
        chain_id: 1,
      }),
      /Blockscout HTTP 500/,
    );
  });
});

describe("blockscout tx_info handler", () => {
  it("flattens from.hash / to.hash shape", async () => {
    const { deps } = fakeDeps(() => ({
      status: 200,
      body: {
        block_number: 123,
        from: { hash: "0xaaa" },
        to: { hash: "0xbbb" },
        value: "1000",
        status: "ok",
        gas_used: "21000",
        timestamp: "2026-04-01T00:00:00Z",
      },
    }));
    const handler = makeTxInfoHandler(deps);
    const out = (await handler({
      tx_hash: "0x" + "a".repeat(64),
      chain_id: 1,
    })) as Record<string, unknown>;
    assert.equal(out.block_number, 123);
    assert.equal(out.from, "0xaaa");
    assert.equal(out.to, "0xbbb");
  });

  it("rejects malformed tx hash", async () => {
    const { deps } = fakeDeps(() => ({ status: 200, body: {} }));
    const handler = makeTxInfoHandler(deps);
    await assert.rejects(handler({ tx_hash: "abc", chain_id: 1 }), /invalid tx_hash/);
  });
});
