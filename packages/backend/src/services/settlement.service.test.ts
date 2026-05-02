import { test, describe } from "node:test";
import * as assert from "node:assert/strict";
import { OnChainSettlementService, SettlementPreflightError } from "./settlement.service.js";
import type { PaymentAuth } from "../utils/payment.js";

const MARKET = "0xmarket0000000000000000000000000000000000" as `0x${string}`;
const ACCOUNT = "0xrelayer000000000000000000000000000000000" as `0x${string}`;

const fakePayment: PaymentAuth = {
  buyer: "0xbuyer00000000000000000000000000000000000",
  amount: "1000000",
  validAfter: "0",
  validBefore: "9999999999",
  nonce: "0xnonce0000000000000000000000000000000000000000000000000000000000",
  v: 27,
  r: "0xrr00000000000000000000000000000000000000000000000000000000000000",
  s: "0xss00000000000000000000000000000000000000000000000000000000000000",
};

const fakeArgs = {
  listingId: 42n,
  jobRef: "0xjob000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
  payment: fakePayment,
};

function makeService(overrides: {
  simulateContract?: (params: unknown) => Promise<unknown>;
  writeContract?: (params: unknown) => Promise<`0x${string}`>;
}) {
  const walletClient = {
    account: { address: ACCOUNT },
    writeContract: overrides.writeContract ?? (async () => "0xtx" as `0x${string}`),
  };
  const publicClient = {
    simulateContract:
      overrides.simulateContract ?? (async () => ({ result: undefined, request: {} })),
    waitForTransactionReceipt: async () => ({ status: "success", gasUsed: 1n }),
  };
  return new OnChainSettlementService(
    walletClient as never,
    publicClient as never,
    async (fn) => fn(),
    () => MARKET,
    { info: () => {}, warn: () => {} },
  );
}

describe("OnChainSettlementService", () => {
  test("simulateSettlement wraps any revert in SettlementPreflightError", async () => {
    const root = new Error("ERC20: transfer amount exceeds balance");
    const svc = makeService({
      simulateContract: async () => {
        throw root;
      },
    });

    await assert.rejects(
      () => svc.simulateSettlement(fakeArgs),
      (err: unknown) => {
        assert.ok(err instanceof SettlementPreflightError, "should be SettlementPreflightError");
        assert.equal(err.name, "SettlementPreflightError");
        assert.ok(
          err.message.includes("ERC20: transfer amount exceeds balance"),
          "message should include original revert reason",
        );
        assert.strictEqual(err.cause, root, "cause should be the original error");
        return true;
      },
    );
  });

  test("simulateSettlement and settle pass identical args arrays to the contract", async () => {
    let simulateArgs: unknown[] | undefined;
    let writeArgs: unknown[] | undefined;

    const svc = makeService({
      simulateContract: async (params) => {
        simulateArgs = (params as { args: unknown[] }).args;
        return { result: undefined, request: {} };
      },
      writeContract: async (params) => {
        writeArgs = (params as { args: unknown[] }).args;
        return "0xtx" as `0x${string}`;
      },
    });

    await svc.simulateSettlement(fakeArgs);
    await svc.settle(fakeArgs);

    assert.ok(simulateArgs, "simulateContract should have been called");
    assert.ok(writeArgs, "writeContract should have been called");
    assert.deepEqual(
      simulateArgs,
      writeArgs,
      "simulateSettlement and settle must pass identical args to the contract",
    );
  });
});
