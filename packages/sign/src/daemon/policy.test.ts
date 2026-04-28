import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodeFunctionData } from "viem";
import { generatePrivateKey } from "viem/accounts";
import { startDaemon } from "./server.js";
import { connectDaemon, DaemonRpcError } from "./client.js";
import { buildPolicy, buildTypedDataPolicy } from "./policy.js";
import { createLimitEnforcer } from "./limit-enforcer.js";
import type { PromptContext, PromptResult } from "./approval-prompt.js";

const APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

function mkApproveTx(amount: bigint) {
  const data = encodeFunctionData({
    abi: APPROVE_ABI,
    functionName: "approve",
    args: ["0x1111111111111111111111111111111111111111", amount],
  });
  return {
    type: "eip1559" as const,
    chainId: 84532,
    to: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`,
    value: 0n,
    nonce: 0,
    gas: 100_000n,
    maxFeePerGas: 1_000_000_000n,
    maxPriorityFeePerGas: 1_000_000n,
    data,
  };
}

function mkReceiveWithAuthorization(amount: bigint) {
  return {
    domain: {
      name: "USDC",
      version: "2",
      chainId: 84532,
      verifyingContract: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    },
    types: {
      ReceiveWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "ReceiveWithAuthorization",
    message: {
      from: "0x2222222222222222222222222222222222222222",
      to: "0x45bB56fDB0E6bb14d178E417b67Ed7B3323ffFf7",
      value: amount,
      validAfter: 0n,
      validBefore: 1_776_800_000n,
      nonce: "0x" + "11".repeat(32),
    },
  };
}

async function mkTestDaemon(opts: {
  prompt: (ctx: PromptContext) => Promise<PromptResult>;
  maxPerTxAtomic?: bigint;
  maxPerHourAtomic?: bigint;
}) {
  const dir = await mkdtemp(join(tmpdir(), "sign-policy-"));
  const socketPath = join(dir, "sign.sock");
  const limits = createLimitEnforcer({
    maxPerTxAtomic: opts.maxPerTxAtomic ?? 5_000_000n,
    maxPerHourAtomic: opts.maxPerHourAtomic ?? 10_000_000n,
  });
  const policy = buildPolicy({ limits, approvalTimeoutSec: 1, prompt: opts.prompt });
  const typedDataPolicy = buildTypedDataPolicy({
    limits,
    approvalTimeoutSec: 1,
    prompt: opts.prompt,
  });
  const pk = generatePrivateKey();
  const daemon = await startDaemon({
    privateKey: pk,
    socketPath,
    ttlMs: 10_000,
    policy,
    typedDataPolicy,
  });
  const cleanup = async () => {
    await daemon.close("client").catch(() => {});
    await rm(dir, { recursive: true, force: true });
  };
  return { daemon, socketPath, cleanup, limits };
}

describe("daemon policy gate", () => {
  it("rejects unknown target with unknown_target code", async () => {
    const env = await mkTestDaemon({ prompt: async () => ({ approved: true }) });
    try {
      const client = await connectDaemon(env.socketPath);
      const plainTx = {
        type: "eip1559" as const,
        chainId: 84532,
        to: "0x2222222222222222222222222222222222222222" as `0x${string}`,
        value: 1n,
        nonce: 0,
        gas: 21_000n,
        maxFeePerGas: 1_000_000_000n,
        maxPriorityFeePerGas: 1_000_000n,
        data: "0x" as const,
      };
      await assert.rejects(
        () => client.signTransaction(plainTx),
        (err: unknown) => {
          assert.ok(err instanceof DaemonRpcError);
          assert.equal((err as DaemonRpcError).code, "unknown_target");
          return true;
        },
      );
      client.close();
    } finally {
      await env.cleanup();
    }
  });

  it("rejects per-tx limit with limit_exceeded code", async () => {
    const env = await mkTestDaemon({
      prompt: async () => ({ approved: true }),
      maxPerTxAtomic: 1_000_000n,
    });
    try {
      const client = await connectDaemon(env.socketPath);
      await assert.rejects(
        () => client.signTransaction(mkApproveTx(5_000_000n)),
        (err: unknown) => {
          assert.equal((err as DaemonRpcError).code, "limit_exceeded");
          return true;
        },
      );
      client.close();
    } finally {
      await env.cleanup();
    }
  });

  it("rejects user-denied with denied code", async () => {
    const env = await mkTestDaemon({
      prompt: async () => ({ approved: false, reason: "denied" }),
    });
    try {
      const client = await connectDaemon(env.socketPath);
      await assert.rejects(
        () => client.signTransaction(mkApproveTx(100_000n)),
        (err: unknown) => {
          assert.equal((err as DaemonRpcError).code, "denied");
          return true;
        },
      );
      client.close();
    } finally {
      await env.cleanup();
    }
  });

  it("signs and records into hour window when approved", async () => {
    const env = await mkTestDaemon({ prompt: async () => ({ approved: true }) });
    try {
      const client = await connectDaemon(env.socketPath);
      const signed = await client.signTransaction(mkApproveTx(2_000_000n));
      assert.ok(signed.signedTransaction.startsWith("0x"));
      // After sign, windowSum should reflect the spend
      assert.equal(env.limits.windowSum(), 2_000_000n);
      client.close();
    } finally {
      await env.cleanup();
    }
  });

  it("does not record when denied (window stays at 0)", async () => {
    const env = await mkTestDaemon({
      prompt: async () => ({ approved: false, reason: "denied" }),
    });
    try {
      const client = await connectDaemon(env.socketPath);
      await client.signTransaction(mkApproveTx(2_000_000n)).catch(() => undefined);
      assert.equal(env.limits.windowSum(), 0n);
      client.close();
    } finally {
      await env.cleanup();
    }
  });

  it("signs ReceiveWithAuthorization typed data and records spend", async () => {
    const env = await mkTestDaemon({ prompt: async () => ({ approved: true }) });
    try {
      const client = await connectDaemon(env.socketPath);
      const signed = await client.signTypedData(mkReceiveWithAuthorization(3_000_000n));
      assert.match(signed.signature, /^0x[0-9a-fA-F]{130}$/);
      assert.equal(env.limits.windowSum(), 3_000_000n);
      client.close();
    } finally {
      await env.cleanup();
    }
  });

  it("rejects ReceiveWithAuthorization typed data over limit", async () => {
    const env = await mkTestDaemon({
      prompt: async () => ({ approved: true }),
      maxPerTxAtomic: 1_000_000n,
    });
    try {
      const client = await connectDaemon(env.socketPath);
      await assert.rejects(
        () => client.signTypedData(mkReceiveWithAuthorization(3_000_000n)),
        (err: unknown) => {
          assert.equal((err as DaemonRpcError).code, "limit_exceeded");
          return true;
        },
      );
      assert.equal(env.limits.windowSum(), 0n);
      client.close();
    } finally {
      await env.cleanup();
    }
  });
});
