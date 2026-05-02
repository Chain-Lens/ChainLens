/**
 * Orchestrates the paid x402 listing call:
 *   approval gate → on-chain listing read → metadata resolve →
 *   price floor check → settlement preflight (eth_call) →
 *   seller HTTP call → response scan + schema validation →
 *   settlement → response shaping + call log
 *
 * The preflight step runs before the seller is contacted so that a bad
 * authorization (expired, insufficient balance, used nonce) never causes
 * the seller to do free compute. See docs/RELAY_AND_SETTLEMENT_POLICY.md.
 *
 * Scan and schema failures are soft: they add to warnings[] and relay
 * continues. Only physically unrelayable responses (unserializable, too
 * large) return response_rejected.
 *
 * Returns a discriminated `CallResult` so the route can map each
 * outcome to an HTTP status without the service knowing about Express,
 * and so unit tests can assert on the result tag instead of HTTP plumbing.
 *
 * Side effects intentionally kept on this layer (call log insert, receipt
 * watch) are dispatched via injected fns so tests can capture them.
 */

import { keccak256, stringToBytes } from "viem";
import type { ListingsRepository } from "../repositories/listing.repository.js";
import type {
  ListingMetadata,
  OnChainListing,
} from "./market-chain.service.js";
import type { SellerCallClient } from "./seller-call.client.js";
import type { SettlementService } from "./settlement.service.js";
import type { PaymentAuth } from "../utils/payment.js";
import type { CallLogInput } from "./call-log.service.js";
import { scanResponse } from "./injection-filter.service.js";
import { validateResponseShape } from "./response-schema.service.js";
import { wrapExternal, safeHostFromUrl } from "../utils/external-data.js";
import {
  rejectionReasonToErrorReason,
  serializeError,
  errorCauseMessage,
} from "../utils/error-mapping.js";
import { SettlementPreflightError } from "./settlement.service.js";

// ─── deps ─────────────────────────────────────────────────────────────

export type ListingReader = (id: bigint) => Promise<OnChainListing>;
export type MetadataResolver = (uri: string) => Promise<ListingMetadata>;
export type SignerRecovery = (payment: PaymentAuth) => Promise<string | null>;
export type LogCallFn = (input: CallLogInput) => Promise<unknown>;

interface Logger {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

// ─── result union ─────────────────────────────────────────────────────

export type CallResult =
  | { kind: "ok"; ok: OkResult }
  | { kind: "bad_listing_id" }
  | { kind: "not_approved"; adminStatus: string }
  | { kind: "listing_not_found" }
  | { kind: "listing_inactive" }
  | { kind: "metadata_error"; detail: string }
  | { kind: "metadata_invalid" }
  | { kind: "amount_below_price"; required: string; provided: string }
  | {
      kind: "seller_call_failed";
      reason: "timeout" | "exception";
      detail: string;
      cause: string | null;
      endpoint: string;
      method: "GET" | "POST";
    }
  | { kind: "seller_non_2xx"; status: number; body: unknown }
  | { kind: "response_rejected"; rejectionReason: string; host: string }
  | { kind: "payment_preflight_failed"; detail: string }
  | {
      kind: "settle_failed";
      recoveredSigner: string | null;
      expectedBuyer: `0x${string}`;
      detail: string;
      sellerBody: unknown;
    };

export interface OkResult {
  listingId: string;
  jobRef: `0x${string}`;
  settleTxHash: `0x${string}`;
  delivery: "relayed_unmodified";
  schemaValid: boolean | null;
  warnings: string[];
  body: unknown;
  host: string;
}

// ─── service ──────────────────────────────────────────────────────────

export class ListingCallService {
  constructor(
    private readonly deps: {
      repo: ListingsRepository;
      readListing: ListingReader;
      resolveMetadata: MetadataResolver;
      sellerClient: SellerCallClient;
      settlement: SettlementService;
      signerRecovery: SignerRecovery;
      logCall: LogCallFn;
      logger: Logger;
    },
  ) {}

  async execute(args: {
    listingIdStr: string;
    inputs: unknown;
    payment: PaymentAuth;
    startedAt?: number;
  }): Promise<CallResult> {
    const startedAt = args.startedAt ?? Date.now();
    if (!/^\d+$/.test(args.listingIdStr)) {
      return { kind: "bad_listing_id" };
    }
    const listingId = BigInt(args.listingIdStr);

    const outcome = newOutcome();
    let result: CallResult;
    try {
      result = await this.run(listingId, args.listingIdStr, args.inputs, args.payment, outcome);
    } catch (err) {
      outcome.errorReason = "unhandled_exception";
      throw err;
    } finally {
      this.fireCallLog(listingId, args.payment, outcome, startedAt);
    }
    return result;
  }

  // ─── private ────────────────────────────────────────────────────────

  private async run(
    listingId: bigint,
    listingIdStr: string,
    inputs: unknown,
    payment: PaymentAuth,
    outcome: Outcome,
  ): Promise<CallResult> {
    const approval = await this.deps.repo.findApprovalStatus(Number(listingId));
    if (approval !== "APPROVED") {
      outcome.errorReason = "not_approved";
      return { kind: "not_approved", adminStatus: approval ?? "UNLISTED" };
    }

    let listing: OnChainListing;
    try {
      listing = await this.deps.readListing(listingId);
    } catch {
      outcome.errorReason = "listing_not_found";
      return { kind: "listing_not_found" };
    }
    if (!listing.active) {
      outcome.errorReason = "listing_inactive";
      return { kind: "listing_inactive" };
    }

    let meta: ListingMetadata;
    try {
      meta = await this.deps.resolveMetadata(listing.metadataURI);
    } catch (e) {
      outcome.errorReason = "metadata_error";
      return { kind: "metadata_error", detail: e instanceof Error ? e.message : String(e) };
    }
    if (!meta.endpoint || typeof meta.endpoint !== "string") {
      outcome.errorReason = "metadata_invalid";
      return { kind: "metadata_invalid" };
    }
    const method: "GET" | "POST" = meta.method === "POST" ? "POST" : "GET";

    const declaredAmt = meta.pricing?.amount;
    if (declaredAmt) {
      try {
        if (BigInt(payment.amount) < BigInt(declaredAmt)) {
          outcome.errorReason = "amount_below_price";
          return {
            kind: "amount_below_price",
            required: declaredAmt,
            provided: payment.amount,
          };
        }
      } catch {
        // malformed declared price — seller metadata quality issue, ignore
      }
    }

    const jobRef = keccak256(
      stringToBytes(`${listingIdStr}|${payment.buyer}|${payment.nonce}|${payment.amount}`),
    );
    outcome.jobRef = jobRef;

    try {
      await this.deps.settlement.simulateSettlement({ listingId, jobRef, payment });
    } catch (e) {
      outcome.errorReason = "payment_preflight_failed";
      this.deps.logger.warn(
        {
          listingId: listingIdStr,
          buyer: payment.buyer,
          detail: e instanceof SettlementPreflightError ? e.message : String(e),
        },
        "settlement preflight rejected — seller not contacted",
      );
      return {
        kind: "payment_preflight_failed",
        detail: e instanceof Error ? e.message : String(e),
      };
    }

    let sellerResult: { ok: boolean; status: number; body: unknown };
    try {
      sellerResult = await this.deps.sellerClient.call(meta.endpoint, method, inputs);
    } catch (e) {
      const isTimeout =
        e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");
      outcome.errorReason = isTimeout ? "seller_timeout" : "seller_exception";
      this.deps.logger.warn(
        {
          listingId: listingIdStr,
          endpoint: meta.endpoint,
          method,
          error: serializeError(e),
        },
        "seller call failed",
      );
      return {
        kind: "seller_call_failed",
        reason: isTimeout ? "timeout" : "exception",
        detail: e instanceof Error ? e.message : String(e),
        cause: errorCauseMessage(e),
        endpoint: meta.endpoint,
        method,
      };
    }
    outcome.sellerStatus = sellerResult.status;

    if (!sellerResult.ok) {
      outcome.errorReason = sellerResult.status >= 500 ? "seller_5xx" : "seller_4xx";
      return { kind: "seller_non_2xx", status: sellerResult.status, body: sellerResult.body };
    }

    const warnings: string[] = [];

    const scan = scanResponse(sellerResult.body);
    if (!scan.clean) {
      const reason = scan.reason ?? "scan_failed";
      if (reason === "response_unserializable" || reason === "response_too_large") {
        outcome.errorReason = rejectionReasonToErrorReason(reason);
        return {
          kind: "response_rejected",
          rejectionReason: reason,
          host: safeHostFromUrl(meta.endpoint),
        };
      }
      warnings.push(reason);
    }

    const schemaCheck = validateResponseShape(sellerResult.body, meta);
    if (schemaCheck.applicable && !schemaCheck.valid) {
      warnings.push(`schema_validation_failed: ${schemaCheck.reason ?? "unknown"}`);
    }

    let txHash: `0x${string}`;
    try {
      txHash = await this.deps.settlement.settle({ listingId, jobRef, payment });
    } catch (e) {
      outcome.errorReason = "settle_failed";
      const recoveredSigner = await this.deps.signerRecovery(payment);
      this.deps.logger.error(
        {
          listingId: listingIdStr,
          payment,
          expectedBuyer: payment.buyer,
          recoveredSigner,
          err: String(e),
        },
        "settle() tx submission failed",
      );
      return {
        kind: "settle_failed",
        recoveredSigner,
        expectedBuyer: payment.buyer,
        detail: e instanceof Error ? e.message : String(e),
        sellerBody: sellerResult.body,
      };
    }
    outcome.settleTxHash = txHash;
    this.deps.settlement.watchReceipt(txHash, { listingId: listingIdStr, jobRef });

    outcome.success = true;
    outcome.errorReason = null;
    outcome.warningCount = warnings.length;

    return {
      kind: "ok",
      ok: {
        listingId: listingIdStr,
        jobRef,
        settleTxHash: txHash,
        delivery: "relayed_unmodified",
        schemaValid: schemaCheck.applicable ? schemaCheck.valid : null,
        warnings,
        body: sellerResult.body,
        host: safeHostFromUrl(meta.endpoint),
      },
    };
  }

  private fireCallLog(
    listingId: bigint,
    payment: PaymentAuth,
    outcome: Outcome,
    startedAt: number,
  ): void {
    void this.deps
      .logCall({
        listingId: Number(listingId),
        buyer: payment.buyer,
        success: outcome.success,
        sellerStatus: outcome.sellerStatus,
        latencyMs: Date.now() - startedAt,
        amount: payment.amount,
        jobRef: outcome.jobRef,
        settleTxHash: outcome.settleTxHash,
        errorReason: outcome.errorReason,
        warningCount: outcome.warningCount,
      })
      .catch((e) => this.deps.logger.warn({ err: String(e) }, "call log insert failed"));
  }
}

// ─── outcome record (mutated in place by run; consumed by call log) ──

interface Outcome {
  success: boolean;
  errorReason: string | null;
  sellerStatus: number | null;
  settleTxHash: `0x${string}` | null;
  jobRef: `0x${string}`;
  warningCount: number | null;
}

function newOutcome(): Outcome {
  return {
    success: false,
    errorReason: "unknown",
    sellerStatus: null,
    settleTxHash: null,
    jobRef: "0x",
    warningCount: null,
  };
}

// Re-export the helper that constructs the wrapped envelope so the route
// (which still owns response shaping) can share the same code path.
export { wrapExternal };
