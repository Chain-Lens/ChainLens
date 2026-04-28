// Decodes EIP-712 typed-data requests into the same policy-friendly spend
// shape used by transaction signing. Scope is intentionally narrow: v3 MCP
// only needs USDC ReceiveWithAuthorization for ChainLensMarket settlement.

export interface RawTypedData {
  domain?: Record<string, unknown>;
  primaryType?: unknown;
  message?: Record<string, unknown>;
}

export type DecodedTypedData =
  | {
      kind: "receiveWithAuthorization";
      /** USDC token verifyingContract from EIP-712 domain. */
      target: `0x${string}`;
      /** ChainLensMarket address receiving the authorization. */
      counterparty: `0x${string}`;
      /** USDC atomic amount authorized. */
      amountAtomic: bigint;
      valueWei: 0n;
      from: `0x${string}`;
      validBefore: bigint;
    }
  | {
      kind: "unknown";
      target: `0x${string}` | null;
      selector: null;
      valueWei: 0n;
      reason: string;
    };

export function decodeTypedData(input: RawTypedData): DecodedTypedData {
  if (input.primaryType !== "ReceiveWithAuthorization") {
    return unknown("unsupported primaryType");
  }

  const domain = input.domain;
  const message = input.message;
  if (!domain || !message) return unknown("missing domain/message");

  const target = asAddress(domain.verifyingContract);
  const from = asAddress(message.from);
  const to = asAddress(message.to);
  const value = asBigInt(message.value);
  const validBefore = asBigInt(message.validBefore);

  if (!target) return unknown("missing domain.verifyingContract");
  if (!from) return unknown("missing message.from", target);
  if (!to) return unknown("missing message.to", target);
  if (value === null) return unknown("missing message.value", target);
  if (validBefore === null) return unknown("missing message.validBefore", target);

  return {
    kind: "receiveWithAuthorization",
    target,
    counterparty: to,
    amountAtomic: value,
    valueWei: 0n,
    from,
    validBefore,
  };
}

function unknown(reason: string, target: `0x${string}` | null = null): DecodedTypedData {
  return {
    kind: "unknown",
    target,
    selector: null,
    valueWei: 0n,
    reason,
  };
}

function asAddress(value: unknown): `0x${string}` | null {
  if (typeof value !== "string") return null;
  return /^0x[a-fA-F0-9]{40}$/.test(value) ? (value as `0x${string}`) : null;
}

function asBigInt(value: unknown): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return BigInt(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return null;
}
