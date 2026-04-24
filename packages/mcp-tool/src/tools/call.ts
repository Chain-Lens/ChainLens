/**
 * `chain-lens.call` — v3 x402 payment flow through the ChainLens Gateway.
 *
 * Flow:
 *   1. Sign a USDC ReceiveWithAuthorization off-chain. `to` is the
 *      ChainLensMarket contract (NOT the seller); the contract pulls the
 *      USDC inside `settle()` once the Gateway confirms the seller ran.
 *   2. GET /api/x402/:listing_id with an `X-Payment` header. Inputs are
 *      encoded as query parameters, so the paid call has no request body.
 *      The Gateway proxies the request to the seller, and on success submits
 *      our signed authorization to ChainLensMarket.settle() — a single
 *      on-chain tx.
 *   3. Return the seller's response body plus the settle tx hash.
 *
 * Failed seller calls (5xx, timeout) → the Gateway drops the auth without
 * submitting it. No USDC moves; the nonce expires around `validBefore`
 * (default ~1h). That IS the refund — no refund contract, no state machine.
 *
 * Handler is DI'd so unit tests can supply a fake signer + fake fetch
 * without viem or network access.
 */

import { Buffer } from "node:buffer";
import { parseSignature } from "viem";
import type { Signer } from "../signer.js";

export interface CallInput {
  /** Decimal on-chain listingId — obtain from chain-lens.discover. */
  listing_id: string;
  /** JSON object forwarded to the seller as querystring (GET) or body (POST). */
  inputs: Record<string, unknown>;
  /** Budget in USDC atomic units (6 decimals). Must be ≥ listing price. */
  amount: string;
}

export interface CallDeps {
  apiBaseUrl: string;
  fetch: typeof fetch;
  signer: Signer;
  /** ChainLensMarket contract — `to` field of the signed authorization. */
  marketAddress: `0x${string}`;
  /** USDC address on this chain — verifyingContract in the EIP-712 domain. */
  usdcAddress: `0x${string}`;
  /** EIP-712 chainId. Must match USDC's deployment chain. */
  chainId: number;
  /** EIP-712 domain name. FiatTokenV2 uses "USDC". */
  usdcEip712Name?: string;
  /** EIP-712 domain version. FiatTokenV2 uses "2". */
  usdcEip712Version?: string;
  /** Random 32-byte nonce. Override for deterministic tests. */
  randomNonce?: () => `0x${string}`;
  /** Current unix seconds. Override for deterministic tests. */
  nowSeconds?: () => bigint;
  /** How long the authorization stays valid. Default 3600s. */
  authValidSeconds?: number;
  /** Abort the Gateway GET after this many ms. Default 150_000. */
  callTimeoutMs?: number;
}

export interface CallResult {
  listingId: string;
  jobRef: `0x${string}`;
  settleTxHash: `0x${string}`;
  delivery: "relayed_unmodified" | "rejected_untrusted";
  safety: {
    trusted: false;
    scanned: boolean;
    schemaValid: boolean | null;
    warnings: string[];
  };
  untrustedData: unknown;
  envelope?: string;
  usdc?: `0x${string}`;
}

const RECEIVE_WITH_AUTH_TYPES = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

const defaultRandomNonce = (): `0x${string}` => {
  const bytes = new Uint8Array(32);
  (globalThis.crypto as Crypto).getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `0x${hex}` as `0x${string}`;
};

const defaultNowSeconds = (): bigint => BigInt(Math.floor(Date.now() / 1000));

export async function callHandler(
  input: CallInput,
  deps: CallDeps,
): Promise<CallResult> {
  // ---------- input validation ----------
  if (!/^\d+$/.test(input.listing_id)) {
    throw new Error("chain-lens.call: listing_id must be a decimal string");
  }
  if (
    !input.inputs ||
    typeof input.inputs !== "object" ||
    Array.isArray(input.inputs)
  ) {
    throw new Error("chain-lens.call: inputs must be a JSON object");
  }
  if (!/^\d+$/.test(input.amount)) {
    throw new Error(
      "chain-lens.call: amount must be a non-negative integer string (USDC atomic units)",
    );
  }
  const amount = BigInt(input.amount);
  if (amount <= 0n) {
    throw new Error("chain-lens.call: amount must be > 0");
  }

  // ---------- EIP-3009 sign ----------
  const nonce = (deps.randomNonce ?? defaultRandomNonce)();
  const now = (deps.nowSeconds ?? defaultNowSeconds)();
  const validAfter = 0n;
  const validBefore = now + BigInt(deps.authValidSeconds ?? 3600);

  const signature = await deps.signer.signTypedData({
    domain: {
      name: deps.usdcEip712Name ?? "USDC",
      version: deps.usdcEip712Version ?? "2",
      chainId: deps.chainId,
      verifyingContract: deps.usdcAddress,
    },
    types: RECEIVE_WITH_AUTH_TYPES,
    primaryType: "ReceiveWithAuthorization",
    message: {
      from: deps.signer.address,
      to: deps.marketAddress,
      value: amount,
      validAfter,
      validBefore,
      nonce,
    },
  });
  const sig = parseSignature(signature);

  // ---------- Gateway x402 GET ----------
  const url = new URL(`${deps.apiBaseUrl}/x402/${input.listing_id}`);
  for (const [key, value] of Object.entries(input.inputs)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }
  const signal = deps.callTimeoutMs
    ? AbortSignal.timeout(deps.callTimeoutMs)
    : AbortSignal.timeout(150_000);
  const xPayment = Buffer.from(
    JSON.stringify({
      x402Version: 1,
      scheme: "exact",
      network: deps.chainId === 8453 ? "base" : "base-sepolia",
      payload: {
        authorization: {
          from: deps.signer.address,
          to: deps.marketAddress,
          value: input.amount,
          validAfter: validAfter.toString(),
          validBefore: validBefore.toString(),
          nonce,
        },
        signature: {
          v: Number(sig.v),
          r: sig.r,
          s: sig.s,
        },
      },
    }),
  ).toString("base64url");

  const res = await deps.fetch(url, {
    method: "GET",
    headers: { "X-Payment": xPayment },
    signal,
  });

  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      // ignore
    }
    throw new Error(
      `chain-lens.call: gateway returned ${res.status} ${res.statusText}` +
        (detail ? ` — ${detail.slice(0, 500)}` : ""),
    );
  }

  const body = (await res.json()) as Partial<CallResult> & {
    listingId?: string;
    jobRef?: `0x${string}`;
    settleTxHash?: `0x${string}`;
    delivery?: "relayed_unmodified" | "rejected_untrusted";
    safety?: {
      trusted: false;
      scanned: boolean;
      schemaValid: boolean | null;
      warnings: string[];
    };
    untrusted_data?: unknown;
    envelope?: string;
    usdc?: `0x${string}`;
  };

  if (!body.jobRef || !body.settleTxHash) {
    throw new Error(
      "chain-lens.call: gateway response missing jobRef or settleTxHash — " +
        "server may be running a stale v2 build",
    );
  }

  return {
    listingId: body.listingId ?? input.listing_id,
    jobRef: body.jobRef,
    settleTxHash: body.settleTxHash,
    delivery: body.delivery ?? "relayed_unmodified",
    safety: body.safety ?? {
      trusted: false,
      scanned: false,
      schemaValid: null,
      warnings: [],
    },
    untrustedData: body.untrusted_data,
    ...(body.envelope !== undefined ? { envelope: body.envelope } : {}),
    ...(body.usdc !== undefined ? { usdc: body.usdc } : {}),
  };
}

export const callToolDefinition = {
  name: "chain-lens.call",
  description:
    "Invoke a ChainLens v3 listing via x402. Signs a USDC ReceiveWithAuthorization, sends it as an X-Payment header on a GET request, and the Gateway settles on-chain only on success. Failed seller calls drop the signature — no USDC moves.",
  inputSchema: {
    type: "object",
    required: ["listing_id", "inputs", "amount"],
    properties: {
      listing_id: {
        type: "string",
        description: "Decimal on-chain listingId. Obtain from chain-lens.discover.",
      },
      inputs: {
        description:
          "JSON object forwarded to the seller. Must satisfy the listing's inputs_schema.",
      },
      amount: {
        type: "string",
        description:
          "USDC atomic units (6 decimals). Must be ≥ listing price. e.g. '50000' = 0.05 USDC.",
      },
    },
  },
} as const;
