import { test, describe } from "node:test";
import * as assert from "node:assert/strict";
import type { Response as ExpressResponse } from "express";
import { sendCallResult } from "./market.routes.js";
import type { CallResult } from "../services/listing-call.service.js";

function mockRes() {
  const captured: { status?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(body: unknown) {
      captured.body = body;
      return res;
    },
  } as unknown as ExpressResponse;
  return { res, captured };
}

describe("sendCallResult HTTP mapping", () => {
  test("ok → 200 with safety.clean true and empty warnings on clean path", () => {
    const { res, captured } = mockRes();
    const result: CallResult = {
      kind: "ok",
      ok: {
        listingId: "1",
        jobRef: "0xjob000000000000000000000000000000000000000000000000000000000000",
        settleTxHash: "0xtx0000000000000000000000000000000000000000000000000000000000000000",
        delivery: "relayed_unmodified",
        schemaValid: null,
        warnings: [],
        body: { result: 42 },
        host: "seller.example.com",
      },
    };

    sendCallResult(res, "1", result);

    assert.equal(captured.status, 200);
    const safety = (captured.body as { safety: Record<string, unknown> }).safety;
    assert.equal(safety["clean"], true);
    assert.deepEqual(safety["warnings"], []);
    assert.equal(safety["scanned"], true);
    assert.equal(safety["trusted"], false);
  });

  test("ok → 200 with safety.clean false when warnings present", () => {
    const { res, captured } = mockRes();
    const result: CallResult = {
      kind: "ok",
      ok: {
        listingId: "1",
        jobRef: "0xjob000000000000000000000000000000000000000000000000000000000000",
        settleTxHash: "0xtx0000000000000000000000000000000000000000000000000000000000000000",
        delivery: "relayed_unmodified",
        schemaValid: false,
        warnings: ["schema_validation_failed: $.value: expected number, got string"],
        body: { value: "not-a-number" },
        host: "seller.example.com",
      },
    };

    sendCallResult(res, "1", result);

    assert.equal(captured.status, 200);
    const safety = (captured.body as { safety: Record<string, unknown> }).safety;
    assert.equal(safety["clean"], false);
    assert.equal(safety["schemaValid"], false);
    assert.ok((safety["warnings"] as string[]).length > 0);
  });

  test("response_rejected → 422 without body (unrelayable case)", () => {
    const { res, captured } = mockRes();
    const result: CallResult = {
      kind: "response_rejected",
      rejectionReason: "response_too_large",
      host: "seller.example.com",
    };

    sendCallResult(res, "1", result);

    assert.equal(captured.status, 422);
    const body = captured.body as Record<string, unknown>;
    assert.ok(body["error"] !== undefined);
    assert.equal(body["rejectionReason"], "response_too_large");
    assert.equal(body["host"], "seller.example.com");
    assert.equal(body["untrusted_data"], undefined, "unrelayable response must not include body");
  });

  test("payment_preflight_failed → 412 with detail", () => {
    const { res, captured } = mockRes();
    const result: CallResult = {
      kind: "payment_preflight_failed",
      detail: "ERC20: transfer amount exceeds balance",
    };

    sendCallResult(res, "1", result);

    assert.equal(captured.status, 412);
    assert.ok(
      (captured.body as { error: string }).error.includes("preflight"),
      "error message should reference preflight",
    );
    assert.equal(
      (captured.body as { detail: string }).detail,
      "ERC20: transfer amount exceeds balance",
    );
  });
});
