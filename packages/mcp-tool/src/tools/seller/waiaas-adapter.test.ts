import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { keccak256, toHex } from "viem";
import { ChainLensMarketAbi } from "@chain-lens/shared";
import type { Abi } from "viem";
import {
  createWaiaasAdapter,
  type WaiaasClient,
  type WaiaasAdapterDeps,
} from "./waiaas-adapter.js";

const MARKET_ADDRESS = "0x45bB56fDB0E6bb14d178E417b67Ed7B3323ffFf7" as `0x${string}`;
const PAYOUT = "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12" as `0x${string}`;
const METADATA_URI = "https://chainlens.xyz/meta/1.json";
const TX_HASH = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" as `0x${string}`;

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

function makeDeps(
  overrides: Partial<WaiaasAdapterDeps> = {},
): WaiaasAdapterDeps & { submitCalls: { target: string; functionName: string; args: readonly unknown[] }[] } {
  const submitCalls: { target: string; functionName: string; args: readonly unknown[] }[] = [];
  const client: WaiaasClient = {
    submitContractCall: async (args) => {
      submitCalls.push(args);
      return { txHash: TX_HASH };
    },
  };
  return {
    client,
    waitForTransactionReceipt: async () => buildReceipt(42),
    marketAddress: MARKET_ADDRESS,
    marketAbi: ChainLensMarketAbi as Abi,
    submitCalls,
    ...overrides,
  };
}

describe("createWaiaasAdapter", () => {
  describe("kind and basic behavior", () => {
    it("kind is waiaas", () => {
      const adapter = createWaiaasAdapter(makeDeps());
      assert.equal(adapter.kind, "waiaas");
    });

    it("calls submitContractCall with target=marketAddress and functionName=register", async () => {
      const deps = makeDeps();
      const adapter = createWaiaasAdapter(deps);
      await adapter.signAndSubmit({ payoutAddress: PAYOUT, metadataURI: METADATA_URI });

      assert.equal(deps.submitCalls.length, 1);
      assert.equal(deps.submitCalls[0].target, MARKET_ADDRESS);
      assert.equal(deps.submitCalls[0].functionName, "register");
    });

    it("passes payout and metadataURI as args", async () => {
      const deps = makeDeps();
      const adapter = createWaiaasAdapter(deps);
      await adapter.signAndSubmit({ payoutAddress: PAYOUT, metadataURI: METADATA_URI });

      const [payout, uri] = deps.submitCalls[0].args as [string, string];
      assert.equal(payout, PAYOUT);
      assert.equal(uri, METADATA_URI);
    });

    it("returns txHash and listingOnChainId from event", async () => {
      const adapter = createWaiaasAdapter(makeDeps());
      const result = await adapter.signAndSubmit({ payoutAddress: PAYOUT, metadataURI: METADATA_URI });
      assert.equal(result.txHash, TX_HASH);
      assert.equal(result.listingOnChainId, 42);
    });

    it("extracts listingId from event topics", async () => {
      const deps = makeDeps({
        waitForTransactionReceipt: async () => buildReceipt(99),
      });
      const adapter = createWaiaasAdapter(deps);
      const result = await adapter.signAndSubmit({ payoutAddress: PAYOUT, metadataURI: METADATA_URI });
      assert.equal(result.listingOnChainId, 99);
    });

    it("accepts ipfs:// metadata URI", async () => {
      const adapter = createWaiaasAdapter(makeDeps());
      const result = await adapter.signAndSubmit({
        payoutAddress: PAYOUT,
        metadataURI: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
      });
      assert.ok(result.txHash);
    });

    it("accepts data:application/json metadata URI", async () => {
      const adapter = createWaiaasAdapter(makeDeps());
      const result = await adapter.signAndSubmit({
        payoutAddress: PAYOUT,
        metadataURI: "data:application/json,{}",
      });
      assert.ok(result.txHash);
    });
  });

  describe("construction-time config validation", () => {
    it("throws on invalid marketAddress", () => {
      assert.throws(
        () => createWaiaasAdapter(makeDeps({ marketAddress: "not-an-address" as `0x${string}` })),
        /marketAddress/,
      );
    });

    it("throws on marketAddress that is too short", () => {
      assert.throws(
        () => createWaiaasAdapter(makeDeps({ marketAddress: "0xbad" as `0x${string}` })),
        /marketAddress/,
      );
    });
  });

  describe("policy: payout address", () => {
    it("throws when payoutAddress is not a valid EVM address", async () => {
      const adapter = createWaiaasAdapter(makeDeps());
      await assert.rejects(
        () => adapter.signAndSubmit({ payoutAddress: "0xbad" as `0x${string}`, metadataURI: METADATA_URI }),
        /payoutAddress.*not a valid EVM address/,
      );
    });

    it("throws when payoutAddress is empty", async () => {
      const adapter = createWaiaasAdapter(makeDeps());
      await assert.rejects(
        () => adapter.signAndSubmit({ payoutAddress: "" as `0x${string}`, metadataURI: METADATA_URI }),
        /payoutAddress/,
      );
    });
  });

  describe("policy: metadata URI scheme", () => {
    it("throws on disallowed scheme (ftp://)", async () => {
      const adapter = createWaiaasAdapter(makeDeps());
      await assert.rejects(
        () => adapter.signAndSubmit({ payoutAddress: PAYOUT, metadataURI: "ftp://example.com/meta.json" }),
        /metadataURI scheme not allowed/,
      );
    });

    it("throws on bare http:// URI", async () => {
      const adapter = createWaiaasAdapter(makeDeps());
      await assert.rejects(
        () => adapter.signAndSubmit({ payoutAddress: PAYOUT, metadataURI: "http://example.com/meta.json" }),
        /metadataURI scheme not allowed/,
      );
    });

    it("throws on empty metadataURI", async () => {
      const adapter = createWaiaasAdapter(makeDeps());
      await assert.rejects(
        () => adapter.signAndSubmit({ payoutAddress: PAYOUT, metadataURI: "" }),
        /metadataURI scheme not allowed/,
      );
    });
  });

  describe("policy: payout allowlist", () => {
    it("accepts payout address in allowlist", async () => {
      const adapter = createWaiaasAdapter(makeDeps({ payoutAllowlist: [PAYOUT] }));
      const result = await adapter.signAndSubmit({ payoutAddress: PAYOUT, metadataURI: METADATA_URI });
      assert.ok(result.txHash);
    });

    it("rejects payout address not in allowlist", async () => {
      const OTHER = "0x1111111111111111111111111111111111111111" as `0x${string}`;
      const adapter = createWaiaasAdapter(makeDeps({ payoutAllowlist: [OTHER] }));
      await assert.rejects(
        () => adapter.signAndSubmit({ payoutAddress: PAYOUT, metadataURI: METADATA_URI }),
        /not in the configured payout allowlist/,
      );
    });

    it("allowlist comparison is case-insensitive", async () => {
      const lowerPayout = PAYOUT.toLowerCase() as `0x${string}`;
      const mixedPayout = ("0x" + PAYOUT.slice(2).toUpperCase()) as `0x${string}`;
      const adapter = createWaiaasAdapter(makeDeps({ payoutAllowlist: [lowerPayout] }));
      const result = await adapter.signAndSubmit({ payoutAddress: mixedPayout, metadataURI: METADATA_URI });
      assert.ok(result.txHash);
    });

    it("no restriction when allowlist is empty", async () => {
      const adapter = createWaiaasAdapter(makeDeps({ payoutAllowlist: [] }));
      const result = await adapter.signAndSubmit({ payoutAddress: PAYOUT, metadataURI: METADATA_URI });
      assert.ok(result.txHash);
    });

    it("no restriction when allowlist is undefined", async () => {
      const adapter = createWaiaasAdapter(makeDeps({ payoutAllowlist: undefined }));
      const result = await adapter.signAndSubmit({ payoutAddress: PAYOUT, metadataURI: METADATA_URI });
      assert.ok(result.txHash);
    });
  });

  describe("receipt handling", () => {
    it("throws when transaction reverts", async () => {
      const deps = makeDeps({
        waitForTransactionReceipt: async () => ({ status: "reverted" as const, logs: [] }),
      });
      const adapter = createWaiaasAdapter(deps);
      await assert.rejects(
        () => adapter.signAndSubmit({ payoutAddress: PAYOUT, metadataURI: METADATA_URI }),
        /reverted/,
      );
    });

    it("throws when ListingRegistered event is absent", async () => {
      const deps = makeDeps({
        waitForTransactionReceipt: async () => ({ status: "success" as const, logs: [] }),
      });
      const adapter = createWaiaasAdapter(deps);
      await assert.rejects(
        () => adapter.signAndSubmit({ payoutAddress: PAYOUT, metadataURI: METADATA_URI }),
        /ListingRegistered/,
      );
    });

    it("ignores ListingRegistered events from a different contract", async () => {
      const other = "0x0000000000000000000000000000000000000001" as `0x${string}`;
      const deps = makeDeps({
        waitForTransactionReceipt: async () => buildReceipt(77, other),
      });
      const adapter = createWaiaasAdapter(deps);
      await assert.rejects(
        () => adapter.signAndSubmit({ payoutAddress: PAYOUT, metadataURI: METADATA_URI }),
        /ListingRegistered/,
      );
    });
  });
});
