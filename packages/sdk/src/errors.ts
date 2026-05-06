import type { FailureMetadata } from "./types.js";

export class ChainLensError extends Error {
  readonly code: string;
  readonly cause?: unknown;

  constructor(message: string, code: string, cause?: unknown) {
    super(message);
    this.name = "ChainLensError";
    this.code = code;
    this.cause = cause;
  }
}

/** Listing not found or task query produced no match. */
export class ChainLensResolveError extends ChainLensError {
  constructor(message: string, cause?: unknown) {
    super(message, "RESOLVE", cause);
    this.name = "ChainLensResolveError";
  }
}

/** Off-chain budget limit exceeded before any signature was produced. */
export class BudgetExceededError extends ChainLensError {
  readonly reason: string;

  constructor(reason: string) {
    super(`Budget exceeded: ${reason}`, "BUDGET");
    this.name = "BudgetExceededError";
    this.reason = reason;
  }
}

/** EIP-3009 signing failed. */
export class ChainLensSignError extends ChainLensError {
  constructor(message: string, cause?: unknown) {
    super(message, "SIGN", cause);
    this.name = "ChainLensSignError";
  }
}

/** Gateway returned a non-200 HTTP status. */
export class ChainLensGatewayError extends ChainLensError {
  readonly status: number;

  constructor(message: string, status: number, cause?: unknown) {
    super(message, "GATEWAY", cause);
    this.name = "ChainLensGatewayError";
    this.status = status;
  }
}

/** The call completed but the provider reported failure (no settlement). */
export class ChainLensCallError extends ChainLensError {
  readonly failure: FailureMetadata;

  constructor(failure: FailureMetadata) {
    super(`Call failed: ${failure.kind} — ${failure.hint}`, "CALL");
    this.name = "ChainLensCallError";
    this.failure = failure;
  }
}
