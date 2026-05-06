// Decodes a viem-style transaction request into a policy-friendly shape so the
// daemon can enforce spending limits and show a meaningful approval prompt.
//
// Scope: 5 known function selectors (USDC approve/transfer, Escrow v2
// pay/createJob, ChainLensMarket register). Anything else returns
// `kind: "unknown"` and the daemon refuses to sign. This is a security
// tool — guessing is worse than refusing.

import { decodeFunctionData, type Abi } from "viem";

const KNOWN_ABI: Abi = [
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
  {
    type: "function",
    name: "createJob",
    stateMutability: "nonpayable",
    inputs: [
      { name: "seller", type: "address" },
      { name: "taskType", type: "bytes32" },
      { name: "amount", type: "uint256" },
      { name: "inputsHash", type: "bytes32" },
      { name: "apiId", type: "uint256" },
    ],
    outputs: [{ name: "jobId", type: "uint256" }],
  },
  {
    // ChainLensMarket.register — seller paid listing registration, no token spend.
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [
      { name: "payout", type: "address" },
      { name: "metadataURI", type: "string" },
    ],
    outputs: [{ name: "listingId", type: "uint256" }],
  },
];

export type KnownKind = "approve" | "transfer" | "pay" | "createJob" | "register";

export type DecodedTx =
  | {
      kind: "approve" | "transfer" | "pay" | "createJob";
      /** Contract being called (tx.to). */
      target: `0x${string}`;
      /** USDC-atomic amount moved/approved by this tx. */
      amountAtomic: bigint;
      /** Recipient — spender (approve), destination (transfer), seller (pay/createJob). */
      counterparty: `0x${string}`;
      /** Native value sent (wei). Non-zero is unusual for these calls. */
      valueWei: bigint;
    }
  | {
      kind: "register";
      /** ChainLensMarket contract address. */
      target: `0x${string}`;
      /** Always 0n — registration moves no tokens. */
      amountAtomic: bigint;
      /** Payout address — receives USDC settlements for executed calls. */
      counterparty: `0x${string}`;
      /** Metadata URI committed on-chain. */
      metadataUri: string;
      /** Native value (wei). Should be 0n — register is nonpayable. */
      valueWei: bigint;
    }
  | {
      kind: "unknown";
      target: `0x${string}` | null;
      /** 4-byte selector if present, else null. */
      selector: `0x${string}` | null;
      valueWei: bigint;
    };

export interface RawTx {
  to?: `0x${string}` | null;
  data?: `0x${string}` | null;
  value?: bigint | null;
}

export function decodeTx(tx: RawTx): DecodedTx {
  const valueWei = tx.value ?? 0n;
  const data = tx.data ?? "0x";
  const to = tx.to ?? null;

  if (!to) return { kind: "unknown", target: null, selector: selectorOf(data), valueWei };
  if (data === "0x" || data.length < 10) {
    return { kind: "unknown", target: to, selector: null, valueWei };
  }

  let decoded: { functionName: string; args: readonly unknown[] };
  try {
    const res = decodeFunctionData({ abi: KNOWN_ABI, data });
    decoded = { functionName: res.functionName, args: res.args ?? [] };
  } catch {
    return { kind: "unknown", target: to, selector: selectorOf(data), valueWei };
  }

  switch (decoded.functionName) {
    case "approve":
      return {
        kind: "approve",
        target: to,
        counterparty: decoded.args[0] as `0x${string}`,
        amountAtomic: decoded.args[1] as bigint,
        valueWei,
      };
    case "transfer":
      return {
        kind: "transfer",
        target: to,
        counterparty: decoded.args[0] as `0x${string}`,
        amountAtomic: decoded.args[1] as bigint,
        valueWei,
      };
    case "pay":
      return {
        kind: "pay",
        target: to,
        counterparty: decoded.args[1] as `0x${string}`,
        amountAtomic: decoded.args[2] as bigint,
        valueWei,
      };
    case "createJob":
      return {
        kind: "createJob",
        target: to,
        counterparty: decoded.args[0] as `0x${string}`,
        amountAtomic: decoded.args[2] as bigint,
        valueWei,
      };
    case "register":
      return {
        kind: "register",
        target: to,
        counterparty: decoded.args[0] as `0x${string}`,
        amountAtomic: 0n,
        metadataUri: decoded.args[1] as string,
        valueWei,
      };
    default:
      return { kind: "unknown", target: to, selector: selectorOf(data), valueWei };
  }
}

function selectorOf(data: `0x${string}` | string): `0x${string}` | null {
  if (!data.startsWith("0x") || data.length < 10) return null;
  return data.slice(0, 10) as `0x${string}`;
}
