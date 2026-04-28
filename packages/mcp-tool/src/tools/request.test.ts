import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Abi, Account } from "viem";
import { keccak256, toBytes } from "viem";
import { ApiMarketEscrowV2Abi } from "@chain-lens/shared";
import {
  requestHandler,
  pickJobIdFromReceipt,
  JOB_CREATED_TOPIC,
  type RequestDeps,
} from "./request.js";

const ESCROW = ("0x" + "b".repeat(40)) as `0x${string}`;
const USDC_ADDR = ("0x" + "c".repeat(40)) as `0x${string}`;
const TRANSFER_TOPIC = keccak256(toBytes("Transfer(address,address,uint256)"));
// 0x-padded to 32 bytes, same shape as an indexed `address` topic.
const BUYER_AS_TOPIC =
  "0x000000000000000000000000d21de9470d8a0dbae0de0b5f705001a6482db580" as `0x${string}`;
// A 65-byte ECDSA signature in viem-compatible hex shape. Values are arbitrary
// — the fake wallet returns this verbatim; parseSignature only cares about
// length + format.
const FAKE_SIG =
  "0x" +
  "aa".repeat(32) + // r
  "bb".repeat(32) + // s
  "1c"; // v = 28
const FAKE_NONCE = `0x${"de".repeat(32)}` as `0x${string}`;

type WriteCall = {
  address: `0x${string}`;
  functionName: string;
  args: readonly unknown[];
};

type SignCall = {
  domain: Record<string, unknown>;
  message: Record<string, unknown>;
  primaryType: string;
};

function fakeDeps(options: {
  fetchImpl: (url: string, init?: RequestInit) => { status: number; body?: unknown };
  jobIdTopic?: `0x${string}`;
  pollTimeoutMs?: number;
  pollIntervalMs?: number;
}): {
  deps: RequestDeps;
  writes: WriteCall[];
  signs: SignCall[];
  fetchCalls: string[];
} {
  const writes: WriteCall[] = [];
  const signs: SignCall[] = [];
  const fetchCalls: string[] = [];
  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    fetchCalls.push(url);
    const { status, body } = options.fetchImpl(url, init);
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  }) as typeof fetch;

  const jobIdTopic = options.jobIdTopic ?? `0x${"0".repeat(63)}7`; // jobId = 7

  const walletClient = {
    chain: { id: 84532 },
    writeContract: async (args: {
      address: `0x${string}`;
      functionName: string;
      args: readonly unknown[];
    }) => {
      writes.push({ address: args.address, functionName: args.functionName, args: args.args });
      return "0xbbb";
    },
    signTypedData: async (args: {
      domain: Record<string, unknown>;
      message: Record<string, unknown>;
      primaryType: string;
    }) => {
      signs.push({ domain: args.domain, message: args.message, primaryType: args.primaryType });
      return FAKE_SIG as `0x${string}`;
    },
  } as unknown as RequestDeps["walletClient"];

  const publicClient = {
    readContract: async () => 0n,
    waitForTransactionReceipt: async ({ hash }: { hash: `0x${string}` }) => ({
      transactionHash: hash,
      logs: [
        // Real USDC emits AuthorizationUsed + Transfer before JobCreated. We
        // simulate the Transfer booby trap so pickJobIdFromReceipt filtering
        // stays exercised.
        {
          address: USDC_ADDR,
          topics: [
            TRANSFER_TOPIC,
            BUYER_AS_TOPIC,
            BUYER_AS_TOPIC,
          ] as unknown as readonly `0x${string}`[],
          data: "0x" as `0x${string}`,
        },
        {
          address: ESCROW,
          topics: [
            JOB_CREATED_TOPIC,
            jobIdTopic,
            BUYER_AS_TOPIC,
            BUYER_AS_TOPIC,
          ] as unknown as readonly `0x${string}`[],
          data: "0x" as `0x${string}`,
        },
      ],
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
    escrowAddress: ESCROW,
    escrowAbi: [] as unknown as Abi,
    usdcAddress: USDC_ADDR,
    usdcEip712Name: "USD Coin",
    usdcEip712Version: "2",
    keccak256: () => `0x${"f".repeat(64)}` as `0x${string}`,
    taskTypeId: () => `0x${"1".repeat(64)}` as `0x${string}`,
    inputsHash: () => `0x${"2".repeat(64)}` as `0x${string}`,
    randomNonce: () => FAKE_NONCE,
    nowSeconds: () => 1_700_000_000n,
    pollIntervalMs: options.pollIntervalMs ?? 10,
    pollTimeoutMs: options.pollTimeoutMs ?? 1000,
    authValidSeconds: 3600,
    wait: async () => {
      /* immediate */
    },
  };
  return { deps, writes, signs, fetchCalls };
}

describe("requestHandler", () => {
  it("signs TransferWithAuthorization and calls createJobWithAuth in a single tx", async () => {
    let polls = 0;
    const { deps, writes, signs, fetchCalls } = fakeDeps({
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

    // One off-chain signature, one on-chain tx — no approve.
    assert.equal(signs.length, 1);
    assert.equal(signs[0].primaryType, "TransferWithAuthorization");
    assert.equal(signs[0].domain.name, "USD Coin");
    assert.equal(signs[0].domain.version, "2");
    assert.equal(signs[0].domain.verifyingContract, USDC_ADDR);
    assert.equal(signs[0].message.to, ESCROW);
    assert.equal(signs[0].message.value, 50000n);
    assert.equal(signs[0].message.nonce, FAKE_NONCE);
    assert.equal(signs[0].message.validAfter, 0n);
    assert.equal(signs[0].message.validBefore, 1_700_000_000n + 3600n);

    assert.equal(writes.length, 1);
    assert.equal(writes[0].functionName, "createJobWithAuth");
    // args: [seller, taskType, amount, inputsHash, apiId, validAfter, validBefore, nonce, v, r, s]
    assert.equal(writes[0].args[2], 50000n, "amount at index 2");
    assert.equal(writes[0].args[7], FAKE_NONCE, "nonce at index 7");
    // v=28 is encoded as 0x1c in the last byte of FAKE_SIG.
    assert.equal(writes[0].args[8], 28, "v at index 8");

    assert.equal(out.status, "COMPLETED");
    assert.equal(out.jobId, "7");
    assert.ok(fetchCalls[0].endsWith("/jobs/execute"));
    assert.ok(fetchCalls[1].endsWith("/evidence/7"));
  });

  it("includes the seller and escrow chain id in the EIP-712 domain", async () => {
    const { deps, signs } = fakeDeps({
      fetchImpl: (url) =>
        url.endsWith("/jobs/execute")
          ? { status: 202, body: { accepted: true } }
          : { status: 200, body: { status: "COMPLETED", onchainJobId: "7" } },
    });
    await requestHandler(
      {
        seller: ("0x" + "1".repeat(40)) as `0x${string}`,
        task_type: "defillama_tvl",
        inputs: { protocol: "uniswap" },
        amount: "50000",
      },
      deps,
    );
    assert.equal(signs[0].domain.chainId, 84532);
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

  it("forwards api_id to createJobWithAuth args and /jobs/execute body when provided", async () => {
    let executeBody: unknown;
    const { deps, writes } = fakeDeps({
      fetchImpl: (url, init) => {
        if (url.endsWith("/jobs/execute")) {
          executeBody = init?.body ? JSON.parse(String(init.body)) : undefined;
          return { status: 202, body: { accepted: true } };
        }
        return { status: 200, body: { status: "COMPLETED", onchainJobId: "7" } };
      },
    });
    await requestHandler(
      {
        seller: ("0x" + "1".repeat(40)) as `0x${string}`,
        task_type: "defillama_tvl",
        inputs: { protocol: "uniswap" },
        amount: "50000",
        api_id: "4",
      },
      deps,
    );
    const createJobArgs = writes.find((w) => w.functionName === "createJobWithAuth")?.args;
    assert.equal(createJobArgs?.[4], 4n, "apiId should be the 5th createJobWithAuth arg");
    assert.equal((executeBody as { apiId?: string }).apiId, "4");
  });

  it("fails fast when the backend execution trigger is rejected", async () => {
    const { deps } = fakeDeps({
      fetchImpl: (url) =>
        url.endsWith("/jobs/execute") ? { status: 500, body: { error: "boom" } } : { status: 404 },
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

describe("pickJobIdFromReceipt", () => {
  const jobIdTopic = `0x${"0".repeat(63)}7` as `0x${string}`;

  it("skips ERC20 Transfer logs and returns jobId from the JobCreated log", async () => {
    const receipt = {
      logs: [
        {
          address: USDC_ADDR,
          topics: [TRANSFER_TOPIC, BUYER_AS_TOPIC, BUYER_AS_TOPIC],
          data: "0x",
        },
        {
          address: ESCROW,
          topics: [JOB_CREATED_TOPIC, jobIdTopic, BUYER_AS_TOPIC, BUYER_AS_TOPIC],
          data: "0x",
        },
      ],
    } as unknown as Parameters<typeof pickJobIdFromReceipt>[0];
    assert.equal(pickJobIdFromReceipt(receipt, ESCROW), 7n);
  });

  it("ignores JobCreated-shaped logs emitted by a different contract", async () => {
    const receipt = {
      logs: [
        {
          address: USDC_ADDR, // wrong emitter
          topics: [JOB_CREATED_TOPIC, jobIdTopic, BUYER_AS_TOPIC, BUYER_AS_TOPIC],
          data: "0x",
        },
      ],
    } as unknown as Parameters<typeof pickJobIdFromReceipt>[0];
    assert.throws(() => pickJobIdFromReceipt(receipt, ESCROW), /JobCreated event not found/);
  });

  it("throws when no JobCreated log is present", async () => {
    const receipt = {
      logs: [
        {
          address: USDC_ADDR,
          topics: [TRANSFER_TOPIC, BUYER_AS_TOPIC, BUYER_AS_TOPIC],
          data: "0x",
        },
      ],
    } as unknown as Parameters<typeof pickJobIdFromReceipt>[0];
    assert.throws(() => pickJobIdFromReceipt(receipt, ESCROW), /JobCreated event not found/);
  });

  it("matches the keccak256 of the JobCreated event in the shipped ABI", () => {
    const event = ApiMarketEscrowV2Abi.find(
      (
        item,
      ): item is typeof item & { type: "event"; name: string; inputs: Array<{ type: string }> } =>
        item.type === "event" && item.name === "JobCreated",
    );
    if (!event) throw new Error("JobCreated event missing from ABI");
    const sig = `JobCreated(${event.inputs.map((i) => i.type).join(",")})`;
    assert.equal(keccak256(toBytes(sig)), JOB_CREATED_TOPIC);
  });
});
