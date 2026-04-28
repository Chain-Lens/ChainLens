import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { createApprovalPrompt } from "./approval-prompt.js";
import type { DecodedTx } from "./tx-decoder.js";

function mkCtx(overrides?: {
  timeoutSec?: number;
}): Parameters<ReturnType<typeof createApprovalPrompt>>[0] {
  const decoded: DecodedTx = {
    kind: "pay",
    target: "0xD4c40710576f582c49e5E6417F6cA2023E30d3aD",
    counterparty: "0x1111111111111111111111111111111111111111",
    amountAtomic: 50_000n,
    valueWei: 0n,
  };
  return {
    decoded,
    remainingHourAtomic: 9_950_000n,
    timeoutSec: overrides?.timeoutSec ?? 10,
  };
}

function mkStreams() {
  const input = new PassThrough();
  const output = new PassThrough();
  const chunks: string[] = [];
  output.on("data", (c: Buffer) => chunks.push(c.toString()));
  return { input, output, chunks };
}

describe("approval prompt", () => {
  it("approves on 'y' + newline", async () => {
    const { input, output, chunks } = mkStreams();
    const prompt = createApprovalPrompt({ input, output, isTTY: true });
    const p = prompt(mkCtx());
    input.write("y\n");
    const r = await p;
    assert.equal(r.approved, true);
    assert.ok(chunks.join("").includes("Escrow.pay"));
  });

  it("denies on blank line (Enter)", async () => {
    const { input, output } = mkStreams();
    const prompt = createApprovalPrompt({ input, output, isTTY: true });
    const p = prompt(mkCtx());
    input.write("\n");
    const r = await p;
    assert.equal(r.approved, false);
    if (r.approved) throw new Error("unreachable");
    assert.equal(r.reason, "denied");
  });

  it("denies on any non-y answer", async () => {
    const { input, output } = mkStreams();
    const prompt = createApprovalPrompt({ input, output, isTTY: true });
    const p = prompt(mkCtx());
    input.write("maybe\n");
    const r = await p;
    assert.equal(r.approved, false);
  });

  it("auto-denies on timeout", async () => {
    const { input, output } = mkStreams();
    const prompt = createApprovalPrompt({ input, output, isTTY: true });
    // 0 second timeout → fires on next tick
    const r = await prompt({ ...mkCtx(), timeoutSec: 0 });
    // Even though we never wrote to input
    assert.equal(r.approved, false);
    if (r.approved) throw new Error("unreachable");
    assert.equal(r.reason, "timeout");
    // Avoid lingering pipe
    input.end();
  });

  it("refuses immediately when not a TTY", async () => {
    const { input, output } = mkStreams();
    const prompt = createApprovalPrompt({ input, output, isTTY: false });
    const r = await prompt(mkCtx());
    assert.equal(r.approved, false);
    if (r.approved) throw new Error("unreachable");
    assert.equal(r.reason, "no-tty");
  });

  it("serializes concurrent prompts (second waits for first)", async () => {
    const { input, output } = mkStreams();
    const prompt = createApprovalPrompt({ input, output, isTTY: true });
    const p1 = prompt(mkCtx());
    const p2 = prompt(mkCtx());
    input.write("y\n");
    const r1 = await p1;
    assert.equal(r1.approved, true);
    input.write("\n");
    const r2 = await p2;
    assert.equal(r2.approved, false);
  });
});
