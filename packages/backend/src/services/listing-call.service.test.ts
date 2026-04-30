import { test, describe } from "node:test";
import * as assert from "node:assert/strict";
import {
  ListingCallService,
  type CallResult,
  type ListingReader,
  type MetadataResolver,
  type SignerRecovery,
  type LogCallFn,
} from "./listing-call.service.js";
import type { ListingsRepository } from "../repositories/listing.repository.js";
import type { SellerCallClient, SellerCallResult } from "./seller-call.client.js";
import type { SettlementService } from "./settlement.service.js";
import type { OnChainListing, ListingMetadata } from "./market-chain.service.js";
import type { PaymentAuth } from "../utils/payment.js";

// ─── default fakes ───────────────────────────────────────────────────
// Each test overrides the slice it cares about. Defaults represent a
// happy path so a failing test can be read as "what the override broke."

function makeRepo(approval: "APPROVED" | "PENDING" | null = "APPROVED"): ListingsRepository {
  return {
    countV3: async () => 0,
    findApproved: async () => [],
    findApprovalStatus: async () => approval,
  };
}

const okListing: OnChainListing = {
  owner: "0xowner000000000000000000000000000000000000",
  payout: "0xpayout00000000000000000000000000000000000",
  active: true,
  metadataURI: "data:application/json,{}",
};

const okMeta: ListingMetadata = {
  endpoint: "https://seller.test/api",
  method: "GET",
  pricing: { amount: "1000000" },
};

const noopLogger = { info: () => {}, warn: () => {}, error: () => {} };

const noopSettlement: SettlementService = {
  async settle() {
    return "0xtxhash";
  },
  watchReceipt() {},
};

function payment(over: Partial<PaymentAuth> = {}): PaymentAuth {
  return {
    buyer: "0xbuyer00000000000000000000000000000000000",
    amount: "1500000",
    validAfter: "0",
    validBefore: "9999999999",
    nonce: "0xnonce0000000000000000000000000000000000000000000000000000000000",
    v: 27,
    r: "0xrr00000000000000000000000000000000000000000000000000000000000000",
    s: "0xss00000000000000000000000000000000000000000000000000000000000000",
    ...over,
  };
}

function buildService(over: {
  repo?: ListingsRepository;
  readListing?: ListingReader;
  resolveMetadata?: MetadataResolver;
  sellerClient?: SellerCallClient;
  settlement?: SettlementService;
  signerRecovery?: SignerRecovery;
  logCall?: LogCallFn;
} = {}) {
  const calls: { logCall: Parameters<LogCallFn>[0][] } = { logCall: [] };
  const svc = new ListingCallService({
    repo: over.repo ?? makeRepo(),
    readListing: over.readListing ?? (async () => okListing),
    resolveMetadata: over.resolveMetadata ?? (async () => okMeta),
    sellerClient: over.sellerClient ?? {
      async call() {
        return { ok: true, status: 200, body: { ok: true } } satisfies SellerCallResult;
      },
    },
    settlement: over.settlement ?? noopSettlement,
    signerRecovery: over.signerRecovery ?? (async () => null),
    logCall:
      over.logCall ??
      (async (input) => {
        calls.logCall.push(input);
        return undefined;
      }),
    logger: noopLogger,
  });
  return { svc, calls };
}

const baseArgs = { listingIdStr: "1", inputs: {}, payment: payment() };

// ─── tests ────────────────────────────────────────────────────────────

describe("ListingCallService", () => {
  test("rejects non-decimal listingId before any side effect", async () => {
    const { svc, calls } = buildService();
    const result = await svc.execute({ ...baseArgs, listingIdStr: "abc" });
    assert.equal(result.kind, "bad_listing_id");
    assert.equal(calls.logCall.length, 0, "no log row for caller-side errors");
  });

  test("returns not_approved when repo lookup is null (UNLISTED)", async () => {
    const { svc } = buildService({ repo: makeRepo(null) });
    const result = await svc.execute(baseArgs);
    assert.equal(result.kind, "not_approved");
    if (result.kind === "not_approved") assert.equal(result.adminStatus, "UNLISTED");
  });

  test("returns not_approved + status label when repo says PENDING", async () => {
    const { svc } = buildService({ repo: makeRepo("PENDING") });
    const result = await svc.execute(baseArgs);
    if (result.kind !== "not_approved") assert.fail(`expected not_approved, got ${result.kind}`);
    assert.equal(result.adminStatus, "PENDING");
  });

  test("returns listing_inactive when on-chain says inactive", async () => {
    const { svc } = buildService({
      readListing: async () => ({ ...okListing, active: false }),
    });
    const result = await svc.execute(baseArgs);
    assert.equal(result.kind, "listing_inactive");
  });

  test("returns amount_below_price when payment under listing pricing.amount", async () => {
    const { svc } = buildService({
      resolveMetadata: async () => ({ ...okMeta, pricing: { amount: "5000000" } }),
    });
    const result = await svc.execute({ ...baseArgs, payment: payment({ amount: "1000000" }) });
    if (result.kind !== "amount_below_price") {
      assert.fail(`expected amount_below_price, got ${result.kind}`);
    }
    assert.equal(result.required, "5000000");
    assert.equal(result.provided, "1000000");
  });

  test("classifies seller call timeout vs exception", async () => {
    const aborted = new Error("aborted");
    aborted.name = "AbortError";
    const timeoutSvc = buildService({
      sellerClient: {
        async call() {
          throw aborted;
        },
      },
    });
    const t = await timeoutSvc.svc.execute(baseArgs);
    if (t.kind !== "seller_call_failed") assert.fail(`expected seller_call_failed got ${t.kind}`);
    assert.equal(t.reason, "timeout");

    const excSvc = buildService({
      sellerClient: {
        async call() {
          throw new Error("boom");
        },
      },
    });
    const e = await excSvc.svc.execute(baseArgs);
    if (e.kind !== "seller_call_failed") assert.fail(`expected seller_call_failed got ${e.kind}`);
    assert.equal(e.reason, "exception");
  });

  test("returns seller_non_2xx for non-OK seller responses", async () => {
    const { svc } = buildService({
      sellerClient: {
        async call() {
          return { ok: false, status: 503, body: "down for maintenance" };
        },
      },
    });
    const result = await svc.execute(baseArgs);
    if (result.kind !== "seller_non_2xx") assert.fail(`expected seller_non_2xx got ${result.kind}`);
    assert.equal(result.status, 503);
  });

  test("ok path: settles, returns wrapped body, fires call log with success=true", async () => {
    const settled: string[] = [];
    const settlement: SettlementService = {
      async settle() {
        settled.push("called");
        return "0xfeedbeef";
      },
      watchReceipt() {},
    };
    const { svc, calls } = buildService({ settlement });
    const result = await svc.execute(baseArgs);

    if (result.kind !== "ok") assert.fail(`expected ok, got ${result.kind}`);
    assert.equal(result.ok.settleTxHash, "0xfeedbeef");
    assert.equal(result.ok.delivery, "relayed_unmodified");
    assert.equal(settled.length, 1);

    // call log fires synchronously inside finally — give one tick to land
    await new Promise((r) => setImmediate(r));
    assert.equal(calls.logCall.length, 1);
    assert.equal(calls.logCall[0]?.success, true);
    assert.equal(calls.logCall[0]?.errorReason, null);
  });

  test("settle_failed surfaces recovered signer hint", async () => {
    const settlement: SettlementService = {
      async settle() {
        throw new Error("nonce already used");
      },
      watchReceipt() {},
    };
    const { svc } = buildService({
      settlement,
      signerRecovery: async () => "0xrecovered00000000000000000000000000000000",
    });
    const result = await svc.execute(baseArgs);
    if (result.kind !== "settle_failed") assert.fail(`expected settle_failed got ${result.kind}`);
    assert.equal(result.recoveredSigner, "0xrecovered00000000000000000000000000000000");
    assert.match(result.detail, /nonce already used/);
  });
});
