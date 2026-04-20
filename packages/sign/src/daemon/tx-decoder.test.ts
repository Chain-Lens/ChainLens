import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { encodeFunctionData } from "viem";
import { decodeTx } from "./tx-decoder.js";

const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
const ESCROW = "0xD4c40710576f582c49e5E6417F6cA2023E30d3aD" as const;
const SPENDER = "0x1111111111111111111111111111111111111111" as const;
const RECIPIENT = "0x2222222222222222222222222222222222222222" as const;

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

const TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const PAY_ABI = [
  {
    type: "function",
    name: "pay",
    stateMutability: "nonpayable",
    inputs: [
      { name: "apiId", type: "uint256" },
      { name: "seller", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "taskType", type: "bytes32" },
      { name: "inputsHash", type: "bytes32" },
    ],
    outputs: [{ name: "jobId", type: "uint256" }],
  },
] as const;

const ZERO32 = `0x${"0".repeat(64)}` as `0x${string}`;

describe("decodeTx", () => {
  it("decodes USDC approve", () => {
    const data = encodeFunctionData({
      abi: APPROVE_ABI,
      functionName: "approve",
      args: [SPENDER, 5_000_000n],
    });
    const out = decodeTx({ to: USDC, data });
    assert.equal(out.kind, "approve");
    if (out.kind !== "approve") throw new Error("unreachable");
    assert.equal(out.amountAtomic, 5_000_000n);
    assert.equal(out.counterparty.toLowerCase(), SPENDER.toLowerCase());
    assert.equal(out.target, USDC);
  });

  it("decodes USDC transfer", () => {
    const data = encodeFunctionData({
      abi: TRANSFER_ABI,
      functionName: "transfer",
      args: [RECIPIENT, 100n],
    });
    const out = decodeTx({ to: USDC, data });
    assert.equal(out.kind, "transfer");
    if (out.kind !== "transfer") throw new Error("unreachable");
    assert.equal(out.amountAtomic, 100n);
  });

  it("decodes Escrow pay and extracts the USDC amount from arg[2]", () => {
    const data = encodeFunctionData({
      abi: PAY_ABI,
      functionName: "pay",
      args: [1n, RECIPIENT, 2_500_000n, ZERO32, ZERO32],
    });
    const out = decodeTx({ to: ESCROW, data });
    assert.equal(out.kind, "pay");
    if (out.kind !== "pay") throw new Error("unreachable");
    assert.equal(out.amountAtomic, 2_500_000n);
    assert.equal(out.counterparty.toLowerCase(), RECIPIENT.toLowerCase());
  });

  it("returns unknown on selector not in allowlist", () => {
    // e.g. transferFrom — not in our known set
    const out = decodeTx({ to: USDC, data: "0x23b872dd00000000" });
    assert.equal(out.kind, "unknown");
    if (out.kind !== "unknown") throw new Error("unreachable");
    assert.equal(out.selector, "0x23b872dd");
  });

  it("returns unknown on empty calldata (plain ETH send)", () => {
    const out = decodeTx({ to: RECIPIENT, data: "0x", value: 1_000n });
    assert.equal(out.kind, "unknown");
    if (out.kind !== "unknown") throw new Error("unreachable");
    assert.equal(out.valueWei, 1_000n);
  });

  it("returns unknown when tx.to is missing (contract deploy)", () => {
    const out = decodeTx({ data: "0x60806040" });
    assert.equal(out.kind, "unknown");
    if (out.kind !== "unknown") throw new Error("unreachable");
    assert.equal(out.target, null);
  });
});
