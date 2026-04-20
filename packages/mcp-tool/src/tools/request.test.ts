import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Abi, Account } from "viem";
import { requestHandler, type RequestDeps } from "./request.js";

type WriteCall = {
  address: `0x${string}`;
  functionName: string;
  args: readonly unknown[];
};

function fakeDeps(options: {
  fetchImpl: (
    url: string,
    init?: RequestInit,
  ) => { status: number; body?: unknown };
  jobIdTopic?: `0x${string}`;
  pollTimeoutMs?: number;
  pollIntervalMs?: number;
  initialAllowance?: bigint;
}): { deps: RequestDeps; writes: WriteCall[]; fetchCalls: string[] } {
  const writes: WriteCall[] = [];
  const fetchCalls: string[] = [];
  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    fetchCalls.push(url);
    const { status, body } = options.fetchImpl(url, init);
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  }) as typeof fetch;

  const jobIdTopic =
    options.jobIdTopic ??
    (`0x${"0".repeat(63)}7`); // jobId = 7

  const walletClient = {
    chain: { id: 84532 },
    writeContract: async (args: {
      address: `0x${string}`;
      functionName: string;
      args: readonly unknown[];
    }) => {
      writes.push({ address: args.address, functionName: args.functionName, args: args.args });
      return args.functionName === "createJob" ? "0xbbb" : "0xaaa";
    },
  } as unknown as RequestDeps["walletClient"];

  const publicClient = {
    readContract: async () => options.initialAllowance ?? 0n,
    waitForTransactionReceipt: async ({ hash }: { hash: `0x${string}` }) => ({
      transactionHash: hash,
      logs:
        hash === "0xbbb"
          ? [
              {
                address: "0xdeadbeef" as `0x${string}`,
                topics: [
                  "0x1111111111111111111111111111111111111111111111111111111111111111",
                  jobIdTopic,
                ] as unknown as readonly `0x${string}`[],
                data: "0x" as `0x${string}`,
              },
            ]
          : [],
    }),
  } as unknown as RequestDeps["publicClient"];

  const deps: RequestDeps = {
    apiBaseUrl: "http://x/api",
    fetch: fakeFetch,
    publicClient,
    walletClient,
    account: {
      address: ("0x" + "a".repeat(40)) as `0x${string}`,
      type: "local",
    } as unknown as Account,
    escrowAddress: ("0x" + "b".repeat(40)) as `0x${string}`,
    escrowAbi: [] as unknown as Abi,
    usdcAddress: ("0x" + "c".repeat(40)) as `0x${string}`,
    usdcAbi: [] as unknown as Abi,
    keccak256: (s) => (`0x${"f".repeat(64)}`) as `0x${string}`,
    taskTypeId: () => (`0x${"1".repeat(64)}`) as `0x${string}`,
    inputsHash: () => (`0x${"2".repeat(64)}`) as `0x${string}`,
    pollIntervalMs: options.pollIntervalMs ?? 10,
    pollTimeoutMs: options.pollTimeoutMs ?? 1000,
    wait: async () => {
      /* immediate */
    },
  };
  return { deps, writes, fetchCalls };
}

describe("requestHandler", () => {
  it("approves USDC then calls createJob and returns COMPLETED evidence", async () => {
    let polls = 0;
    const { deps, writes, fetchCalls } = fakeDeps({
      fetchImpl: (url, init) => {
        if (url.endsWith("/jobs/execute")) {
          assert.equal(init?.method, "POST");
          return { status: 202, body: { accepted: true } };
        }
        polls += 1;
        if (polls === 1) return { status: 404 };
        return { status: 200, body: { status: "COMPLETED", onchainJobId: "7" } };
      },
    });
    const out = await requestHandler(
      {
        seller: ("0x" + "1".repeat(40)) as `0x${string}`,
        task_type: "blockscout_tx_info",
        inputs: { txHash: "0xabc" },
        amount: "50000",
      },
      deps,
    );
    assert.equal(writes.length, 2);
    assert.equal(writes[0].functionName, "approve");
    assert.equal(writes[1].functionName, "createJob");
    assert.equal(out.status, "COMPLETED");
    assert.equal(out.jobId, "7");
    assert.equal(fetchCalls.length, 3);
    assert.ok(fetchCalls[0].endsWith("/jobs/execute"));
    assert.ok(fetchCalls[1].endsWith("/evidence/7"));
  });

  it("resets stale allowance before approving again", async () => {
    const { deps, writes } = fakeDeps({
      fetchImpl: (url) =>
        url.endsWith("/jobs/execute")
          ? { status: 202, body: { accepted: true } }
          : { status: 200, body: { status: "COMPLETED", onchainJobId: "7" } },
      initialAllowance: 1n,
    });
    const out = await requestHandler(
      {
        seller: ("0x" + "1".repeat(40)) as `0x${string}`,
        task_type: "finance_equity_analysis",
        inputs: { ticker: "TSLA" },
        amount: "2000000",
      },
      deps,
    );
    assert.equal(writes.length, 3);
    assert.equal(writes[0].functionName, "approve");
    assert.deepEqual(writes[0].args, [("0x" + "b".repeat(40)) as `0x${string}`, 0n]);
    assert.equal(writes[1].functionName, "approve");
    assert.deepEqual(writes[1].args, [("0x" + "b".repeat(40)) as `0x${string}`, 2000000n]);
    assert.equal(writes[2].functionName, "createJob");
    assert.equal(out.status, "COMPLETED");
  });

  it("skips approve when allowance is already sufficient", async () => {
    const { deps, writes } = fakeDeps({
      fetchImpl: (url) =>
        url.endsWith("/jobs/execute")
          ? { status: 202, body: { accepted: true } }
          : { status: 200, body: { status: "COMPLETED", onchainJobId: "7" } },
      initialAllowance: 50000n,
    });
    const out = await requestHandler(
      {
        seller: ("0x" + "1".repeat(40)) as `0x${string}`,
        task_type: "defillama_tvl",
        inputs: { protocol: "uniswap" },
        amount: "50000",
      },
      deps,
    );
    assert.equal(writes.length, 1);
    assert.equal(writes[0].functionName, "createJob");
    assert.equal(out.status, "COMPLETED");
  });

  it("returns TIMEOUT when evidence never finalizes within poll window", async () => {
    const { deps } = fakeDeps({
      fetchImpl: (url) =>
        url.endsWith("/jobs/execute")
          ? { status: 202, body: { accepted: true } }
          : { status: 200, body: { status: "PAID" } },
      pollTimeoutMs: 30,
      pollIntervalMs: 5,
    });
    const out = await requestHandler(
      {
        seller: ("0x" + "1".repeat(40)) as `0x${string}`,
        task_type: "defillama_tvl",
        inputs: {},
        amount: "10000",
      },
      deps,
    );
    assert.equal(out.status, "TIMEOUT");
  });

  it("rejects malformed seller address", async () => {
    const { deps } = fakeDeps({ fetchImpl: () => ({ status: 404 }) });
    await assert.rejects(
      requestHandler(
        { seller: "0xnope" as `0x${string}`, task_type: "x", inputs: {}, amount: "1" },
        deps,
      ),
      /invalid seller/,
    );
  });

  it("rejects non-integer amount strings", async () => {
    const { deps } = fakeDeps({ fetchImpl: () => ({ status: 404 }) });
    await assert.rejects(
      requestHandler(
        {
          seller: ("0x" + "1".repeat(40)) as `0x${string}`,
          task_type: "x",
          inputs: {},
          amount: "0.5",
        },
        deps,
      ),
      /amount must be a non-negative integer/,
    );
  });

  it("fails fast when the backend execution trigger is rejected", async () => {
    const { deps } = fakeDeps({
      fetchImpl: (url) =>
        url.endsWith("/jobs/execute")
          ? { status: 500, body: { error: "boom" } }
          : { status: 404 },
    });
    await assert.rejects(
      requestHandler(
        {
          seller: ("0x" + "1".repeat(40)) as `0x${string}`,
          task_type: "defillama_tvl",
          inputs: { protocol: "uniswap" },
          amount: "50000",
        },
        deps,
      ),
      /execution trigger failed 500/,
    );
  });
});
