/**
 * EIP-3009 ReceiveWithAuthorization payment plumbing — type, parser,
 * EIP-712 domain types, and signer recovery. Pure surface; the route
 * just calls these functions and the service injects the recovery
 * helper as a dependency.
 */

import { recoverTypedDataAddress, serializeSignature } from "viem";
import type { PublicClient } from "viem";

export interface PaymentAuth {
  buyer: `0x${string}`;
  amount: string;
  validAfter: string;
  validBefore: string;
  nonce: `0x${string}`;
  v: number;
  r: `0x${string}`;
  s: `0x${string}`;
}

export const receiveWithAuthorizationTypes = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export function parsePayment(raw: unknown): PaymentAuth {
  if (!raw || typeof raw !== "object") throw new Error("missing payment");
  const p = raw as Record<string, unknown>;
  const need = (k: string) => {
    const v = p[k];
    if (typeof v !== "string" || !v) throw new Error(`payment.${k} required`);
    return v;
  };
  const v = p["v"];
  if (typeof v !== "number") throw new Error("payment.v required (number)");
  return {
    buyer: need("buyer") as `0x${string}`,
    amount: need("amount"),
    validAfter: need("validAfter"),
    validBefore: need("validBefore"),
    nonce: need("nonce") as `0x${string}`,
    v,
    r: need("r") as `0x${string}`,
    s: need("s") as `0x${string}`,
  };
}

/** Best-effort recovery — returns the signer address or `null` if the
 *  signature is malformed or the chain is not configured. The route uses
 *  the result purely as a debugging aid in settlement-failure logs. */
export function makePaymentSignerRecovery(
  publicClient: PublicClient,
  marketAddress: () => `0x${string}`,
  usdcAddress: () => `0x${string}`,
): (payment: PaymentAuth) => Promise<string | null> {
  return async (payment) => {
    const chainId = publicClient.chain?.id;
    if (!chainId) return null;
    try {
      return await recoverTypedDataAddress({
        domain: {
          name: "USDC",
          version: "2",
          chainId,
          verifyingContract: usdcAddress(),
        },
        types: receiveWithAuthorizationTypes,
        primaryType: "ReceiveWithAuthorization",
        message: {
          from: payment.buyer,
          to: marketAddress(),
          value: BigInt(payment.amount),
          validAfter: BigInt(payment.validAfter),
          validBefore: BigInt(payment.validBefore),
          nonce: payment.nonce,
        },
        signature: serializeSignature({
          v: BigInt(payment.v),
          r: payment.r,
          s: payment.s,
        }),
      });
    } catch {
      return null;
    }
  };
}
