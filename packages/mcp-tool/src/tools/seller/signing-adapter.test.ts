import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createLocalSignerAdapter, type LocalSignerAdapterDeps } from "./signing-adapter.js";
import { ChainLensMarketAbi } from "@chain-lens/shared";
import type { Abi } from "viem";
import { keccak256, toHex } from "viem";

const MARKET_ADDRESS = "0x45bB56fDB0E6bb14d178E417b67Ed7B3323ffFf7" as `0x${string}`;
const PAYOUT = "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12" as `0x${string}`;
const METADATA_URI = "https://chainlens.xyz/meta/1.json";
const TX_HASH = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" as `0x${string}`;

// keccak256 of the event sig (replicated from signing-adapter.ts)
const LISTING_REGISTERED_TOPIC = keccak256(
  toHex("ListingRegistered(uint256,address,address,string,uint256)"),
);

function listingIdTopic(id: number): `0x${string}` {
  return `0x${BigInt(id).toString(16).padStart(64, "0")}` as `0x${string}`;
}

function buildReceipt(listingId: number, from: `0x${string}` = MARKET_ADDRESS) {
  return {
    status: "success" as const,
    logs: [
      {
        address: from,
        topics: [
          LISTING_REGISTERED_TOPIC,
          listingIdTopic(listingId),
          "0x000000000000000000000000AbCdEf1234567890AbCdEf1234567890AbCdEf12" as `0x${string}`,
          "0x000000000000000000000000AbCdEf1234567890AbCdEf1234567890AbCdEf12" as `0x${string}`,
        ],
        data: "0x" as `0x${string}`,
      },
    ],
  };
}

function makeDeps(overrides: Partial<LocalSignerAdapterDeps> = {}): LocalSignerAdapterDeps & {
  writeCalls: { address: string; functionName: string; args: readonly unknown[] }[];
} {
  const writeCalls: { address: string; functionName: string; args: readonly unknown[] }[] = [];
  return {
    writeContract: async (args) => {
      writeCalls.push(args);
      return TX_HASH;
    },
    waitForTransactionReceipt: async ({ hash: _ }) => buildReceipt(42),
    marketAddress: MARKET_ADDRESS,
    marketAbi: ChainLensMarketAbi as Abi,
    writeCalls,
    ...overrides,
  };
}

describe("createLocalSignerAdapter", () => {
  it("calls writeContract with correct args and returns listingId from event", async () => {
    const deps = makeDeps();
    const adapter = createLocalSignerAdapter(deps);

    const result = await adapter.signAndSubmit({
      payoutAddress: PAYOUT,
      metadataURI: METADATA_URI,
    });

    assert.equal(result.txHash, TX_HASH);
    assert.equal(result.listingOnChainId, 42);
    assert.equal(deps.writeCalls.length, 1);
    assert.equal(deps.writeCalls[0].address, MARKET_ADDRESS);
    assert.equal(deps.writeCalls[0].functionName, "register");
    assert.deepEqual(deps.writeCalls[0].args, [PAYOUT, METADATA_URI]);
  });

  it("extracts correct listingId from topics", async () => {
    const deps = makeDeps({
      waitForTransactionReceipt: async () => buildReceipt(999),
    });
    const adapter = createLocalSignerAdapter(deps);
    const result = await adapter.signAndSubmit({ payoutAddress: PAYOUT, metadataURI: METADATA_URI });
    assert.equal(result.listingOnChainId, 999);
  });

  it("kind is local_signer", () => {
    const adapter = createLocalSignerAdapter(makeDeps());
    assert.equal(adapter.kind, "local_signer");
  });

  it("throws when transaction reverts", async () => {
    const deps = makeDeps({
      waitForTransactionReceipt: async () => ({ status: "reverted" as const, logs: [] }),
    });
    const adapter = createLocalSignerAdapter(deps);
    await assert.rejects(
      adapter.signAndSubmit({ payoutAddress: PAYOUT, metadataURI: METADATA_URI }),
      /reverted/,
    );
  });

  it("throws when ListingRegistered event is absent from logs", async () => {
    const deps = makeDeps({
      waitForTransactionReceipt: async () => ({ status: "success" as const, logs: [] }),
    });
    const adapter = createLocalSignerAdapter(deps);
    await assert.rejects(
      adapter.signAndSubmit({ payoutAddress: PAYOUT, metadataURI: METADATA_URI }),
      /ListingRegistered/,
    );
  });

  it("ignores logs from a different contract address", async () => {
    const otherAddress = "0x0000000000000000000000000000000000000001" as `0x${string}`;
    const deps = makeDeps({
      waitForTransactionReceipt: async () => buildReceipt(42, otherAddress),
    });
    const adapter = createLocalSignerAdapter(deps);
    await assert.rejects(
      adapter.signAndSubmit({ payoutAddress: PAYOUT, metadataURI: METADATA_URI }),
      /ListingRegistered/,
    );
  });
});
