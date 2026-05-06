import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildDebugSummary } from "./debug.js";
import type { TelemetryEntry } from "@chain-lens/sdk";

function entry(over: Partial<TelemetryEntry> = {}): TelemetryEntry {
  return {
    ts: Date.now(),
    listingId: 1,
    amountUsdc: 0.05,
    latencyMs: 200,
    ok: true,
    ...over,
  };
}

describe("buildDebugSummary", () => {
  test("empty telemetry", () => {
    const out = buildDebugSummary([]);
    assert.match(out, /No telemetry recorded yet/);
  });

  test("empty telemetry with listing filter", () => {
    const out = buildDebugSummary([], 17);
    assert.match(out, /No telemetry found for listing #17/);
  });

  test("dominant schema_mismatch failure", () => {
    const entries = [
      entry({ ok: false, listingId: 17, failure: { kind: "schema_mismatch", hint: "bad shape" } }),
      entry({ ok: false, listingId: 17, failure: { kind: "schema_mismatch", hint: "bad shape" } }),
      entry({ ok: true, listingId: 17 }),
    ];
    const out = buildDebugSummary(entries);
    assert.match(out, /schema_mismatch/);
    assert.match(out, /output_schema/);
    assert.match(out, /Settlement was not submitted/);
    assert.match(out, /No USDC moved/);
  });

  test("dominant timeout failure", () => {
    const entries = [
      entry({ ok: false, failure: { kind: "timeout", hint: "timed out" } }),
      entry({ ok: false, failure: { kind: "timeout", hint: "timed out" } }),
    ];
    const out = buildDebugSummary(entries);
    assert.match(out, /timeout/);
    assert.match(out, /did not respond within/);
  });

  test("listing filter narrows results", () => {
    const entries = [
      entry({ ok: false, listingId: 17, failure: { kind: "schema_mismatch", hint: "x" } }),
      entry({ ok: true, listingId: 42 }),
      entry({ ok: true, listingId: 42 }),
    ];
    const out = buildDebugSummary(entries, 17);
    assert.match(out, /listing #17/);
    // listing 42 calls should not appear in the count
    assert.match(out, /Total calls:   1/);
  });

  test("all-success trace shows no failure section", () => {
    const entries = [entry({ ok: true }), entry({ ok: true })];
    const out = buildDebugSummary(entries);
    assert.match(out, /Failures:      0/);
    assert.doesNotMatch(out, /Likely cause/);
  });
});
