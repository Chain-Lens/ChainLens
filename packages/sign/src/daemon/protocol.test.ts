import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MAX_FRAME_SIZE, createFrameDecoder, encodeFrame } from "./protocol.js";

describe("protocol frame codec", () => {
  it("round-trips a simple object", () => {
    const msg = { id: "1", method: "address" };
    const frame = encodeFrame(msg);
    const received: unknown[] = [];
    const decoder = createFrameDecoder((m) => received.push(m));
    decoder.push(frame);
    assert.equal(received.length, 1);
    assert.deepEqual(received[0], msg);
  });

  it("round-trips bigints inside transaction params", () => {
    const tx = { value: 1_234_567_890n, gas: 21_000n, nested: { amount: 42n } };
    const frame = encodeFrame({ id: "2", method: "sign-tx", params: { transaction: tx } });
    let decoded: unknown;
    createFrameDecoder((m) => {
      decoded = m;
    }).push(frame);
    assert.deepEqual(decoded, {
      id: "2",
      method: "sign-tx",
      params: { transaction: tx },
    });
  });

  it("delivers multiple frames from a single chunk", () => {
    const a = encodeFrame({ id: "a", method: "status" });
    const b = encodeFrame({ id: "b", method: "lock" });
    const received: unknown[] = [];
    createFrameDecoder((m) => received.push(m)).push(Buffer.concat([a, b]));
    assert.equal(received.length, 2);
    assert.equal((received[0] as { id: string }).id, "a");
    assert.equal((received[1] as { id: string }).id, "b");
  });

  it("buffers a split frame across chunks", () => {
    const frame = encodeFrame({ id: "split", method: "status" });
    const received: unknown[] = [];
    const decoder = createFrameDecoder((m) => received.push(m));
    decoder.push(frame.subarray(0, 3));
    assert.equal(received.length, 0);
    decoder.push(frame.subarray(3));
    assert.equal(received.length, 1);
    assert.equal((received[0] as { id: string }).id, "split");
  });

  it("rejects oversized frames", () => {
    const huge = "x".repeat(MAX_FRAME_SIZE + 1);
    assert.throws(() => encodeFrame({ id: "big", method: "status", payload: huge }));
  });
});
