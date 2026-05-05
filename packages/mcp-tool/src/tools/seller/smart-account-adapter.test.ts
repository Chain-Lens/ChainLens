import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { keccak256, toHex, decodeFunctionData, getAddress } from "viem";
import { ChainLensMarketAbi } from "@chain-lens/shared";
import type { Abi } from "viem";
import {
  createSmartAccountSessionAdapter,
  buildSmartAccountWriteFn,
  SMART_ACCOUNT_EXECUTE_ABI,
  type SmartAccountAdapterDeps,
} from "./smart-account-adapter.js";

const MARKET_ADDRESS = "0x45bB56fDB0E6bb14d178E417b67Ed7B3323ffFf7" as `0x${string}`;
const SMART_ACCOUNT = "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa" as `0x${string}`;
const PAYOUT = "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12" as `0x${string}`;
// Checksum-valid address used where encodeFunctionData is actually called (viem strict mode).
const PAYOUT_CS = getAddress("0xabcdef1234567890abcdef1234567890abcdef12");
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
  overrides: Partial<SmartAccountAdapterDeps> = {},
): SmartAccountAdapterDeps & { writeCalls: { address: string; functionName: string; args: readonly unknown[] }[] } {
  const writeCalls: { address: string; functionName: string; args: readonly unknown[] }[] = [];
  return {
    writeContract: async (args) => {
      writeCalls.push(args);
      return TX_HASH;
    },
    waitForTransactionReceipt: async () => buildReceipt(77),
    marketAddress: MARKET_ADDRESS,
    marketAbi: ChainLensMarketAbi as Abi,
    smartAccountAddress: SMART_ACCOUNT,
    writeCalls,
    ...overrides,
  };
}

describe("buildSmartAccountWriteFn", () => {
  function makeSessionKeyWrite() {
    const calls: { address: `0x${string}`; abi: Abi; functionName: string; args: readonly unknown[] }[] = [];
    const fn = async (args: { address: `0x${string}`; abi: Abi; functionName: string; args: readonly unknown[] }) => {
      calls.push(args);
      return TX_HASH;
    };
    return { fn, calls };
  }

  it("calls execute on smartAccountAddress, not marketAddress directly", async () => {
    const { fn, calls } = makeSessionKeyWrite();
    const writeFn = buildSmartAccountWriteFn({ sessionKeyWriteContract: fn, smartAccountAddress: SMART_ACCOUNT });

    await writeFn({ address: MARKET_ADDRESS, abi: ChainLensMarketAbi as Abi, functionName: "register", args: [PAYOUT_CS, METADATA_URI] });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].address, SMART_ACCOUNT);      // outer: smart account
    assert.equal(calls[0].functionName, "execute");
  });

  it("sets execute dest=marketAddress and value=0n", async () => {
    const { fn, calls } = makeSessionKeyWrite();
    const writeFn = buildSmartAccountWriteFn({ sessionKeyWriteContract: fn, smartAccountAddress: SMART_ACCOUNT });

    await writeFn({ address: MARKET_ADDRESS, abi: ChainLensMarketAbi as Abi, functionName: "register", args: [PAYOUT_CS, METADATA_URI] });

    const [dest, value] = calls[0].args as [`0x${string}`, bigint, `0x${string}`];
    assert.equal(dest.toLowerCase(), MARKET_ADDRESS.toLowerCase());
    assert.equal(value, 0n);
  });

  it("encodes inner register call as calldata in execute args[2]", async () => {
    const { fn, calls } = makeSessionKeyWrite();
    const writeFn = buildSmartAccountWriteFn({ sessionKeyWriteContract: fn, smartAccountAddress: SMART_ACCOUNT });

    await writeFn({ address: MARKET_ADDRESS, abi: ChainLensMarketAbi as Abi, functionName: "register", args: [PAYOUT_CS, METADATA_URI] });

    const [, , innerCalldata] = calls[0].args as [`0x${string}`, bigint, `0x${string}`];
    const decoded = decodeFunctionData({ abi: ChainLensMarketAbi as Abi, data: innerCalldata });
    assert.equal(decoded.functionName, "register");
    const innerArgs = decoded.args as [string, string];
    assert.equal(innerArgs[0].toLowerCase(), PAYOUT_CS.toLowerCase());
    assert.equal(innerArgs[1], METADATA_URI);
  });

  it("uses SMART_ACCOUNT_EXECUTE_ABI (not market ABI) for the outer call", async () => {
    const { fn, calls } = makeSessionKeyWrite();
    const writeFn = buildSmartAccountWriteFn({ sessionKeyWriteContract: fn, smartAccountAddress: SMART_ACCOUNT });

    await writeFn({ address: MARKET_ADDRESS, abi: ChainLensMarketAbi as Abi, functionName: "register", args: [PAYOUT_CS, METADATA_URI] });

    const outerAbi = calls[0].abi as typeof SMART_ACCOUNT_EXECUTE_ABI;
    assert.ok(Array.isArray(outerAbi));
    assert.equal(outerAbi[0].name, "execute");
  });
});

describe("createSmartAccountSessionAdapter", () => {
  describe("kind and basic behavior", () => {
    it("kind is smart_account", () => {
      const adapter = createSmartAccountSessionAdapter(makeDeps());
      assert.equal(adapter.kind, "smart_account");
    });

    it("calls writeContract with register and returns listingId from event", async () => {
      const deps = makeDeps();
      const adapter = createSmartAccountSessionAdapter(deps);
      const result = await adapter.signAndSubmit({ payoutAddress: PAYOUT, metadataURI: METADATA_URI });

      assert.equal(result.txHash, TX_HASH);
      assert.equal(result.listingOnChainId, 77);
      assert.equal(deps.writeCalls.length, 1);
      assert.equal(deps.writeCalls[0].address, MARKET_ADDRESS);
      assert.equal(deps.writeCalls[0].functionName, "register");
      assert.deepEqual(deps.writeCalls[0].args, [PAYOUT, METADATA_URI]);
    });

    it("extracts listingId from event topics", async () => {
      const deps = makeDeps({
        waitForTransactionReceipt: async () => buildReceipt(123),
      });
      const adapter = createSmartAccountSessionAdapter(deps);
      const result = await adapter.signAndSubmit({ payoutAddress: PAYOUT, metadataURI: METADATA_URI });
      assert.equal(result.listingOnChainId, 123);
    });

    it("accepts ipfs:// metadata URI", async () => {
      const deps = makeDeps();
      const adapter = createSmartAccountSessionAdapter(deps);
      const result = await adapter.signAndSubmit({
        payoutAddress: PAYOUT,
        metadataURI: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
      });
      assert.ok(result.txHash);
    });

    it("accepts data:application/json metadata URI", async () => {
      const deps = makeDeps();
      const adapter = createSmartAccountSessionAdapter(deps);
      const result = await adapter.signAndSubmit({
        payoutAddress: PAYOUT,
        metadataURI: "data:application/json,{}",
      });
      assert.ok(result.txHash);
    });
  });

  describe("construction-time config validation", () => {
    it("throws on invalid smartAccountAddress", () => {
      assert.throws(
        () => createSmartAccountSessionAdapter(makeDeps({ smartAccountAddress: "0xbad" as `0x${string}` })),
        /smartAccountAddress/,
      );
    });

    it("throws on invalid marketAddress", () => {
      assert.throws(
        () => createSmartAccountSessionAdapter(makeDeps({ marketAddress: "not-an-address" as `0x${string}` })),
        /marketAddress/,
      );
    });
  });

  describe("policy: payout address", () => {
    it("throws when payoutAddress is not a valid EVM address", async () => {
      const adapter = createSmartAccountSessionAdapter(makeDeps());
      await assert.rejects(
        () => adapter.signAndSubmit({ payoutAddress: "0xbad" as `0x${string}`, metadataURI: METADATA_URI }),
        /payoutAddress.*not a valid EVM address/,
      );
    });

    it("throws when payoutAddress is empty", async () => {
      const adapter = createSmartAccountSessionAdapter(makeDeps());
      await assert.rejects(
        () => adapter.signAndSubmit({ payoutAddress: "" as `0x${string}`, metadataURI: METADATA_URI }),
        /payoutAddress/,
      );
    });
  });

  describe("policy: metadata URI scheme", () => {
    it("throws on disallowed scheme (ftp://)", async () => {
      const adapter = createSmartAccountSessionAdapter(makeDeps());
      await assert.rejects(
        () => adapter.signAndSubmit({ payoutAddress: PAYOUT, metadataURI: "ftp://example.com/meta.json" }),
        /metadataURI scheme not allowed/,
      );
    });

    it("throws on bare http:// URI", async () => {
      const adapter = createSmartAccountSessionAdapter(makeDeps());
      await assert.rejects(
        () => adapter.signAndSubmit({ payoutAddress: PAYOUT, metadataURI: "http://example.com/meta.json" }),
        /metadataURI scheme not allowed/,
      );
    });

    it("throws on empty metadataURI", async () => {
      const adapter = createSmartAccountSessionAdapter(makeDeps());
      await assert.rejects(
        () => adapter.signAndSubmit({ payoutAddress: PAYOUT, metadataURI: "" }),
        /metadataURI scheme not allowed/,
      );
    });
  });

  describe("policy: payout allowlist", () => {
    it("accepts payout address in allowlist", async () => {
      const adapter = createSmartAccountSessionAdapter(
        makeDeps({ payoutAllowlist: [PAYOUT] }),
      );
      const result = await adapter.signAndSubmit({ payoutAddress: PAYOUT, metadataURI: METADATA_URI });
      assert.ok(result.txHash);
    });

    it("rejects payout address not in allowlist", async () => {
      const OTHER = "0x1111111111111111111111111111111111111111" as `0x${string}`;
      const adapter = createSmartAccountSessionAdapter(
        makeDeps({ payoutAllowlist: [OTHER] }),
      );
      await assert.rejects(
        () => adapter.signAndSubmit({ payoutAddress: PAYOUT, metadataURI: METADATA_URI }),
        /not in the configured payout allowlist/,
      );
    });

    it("rejects payout address not in allowlist before signing", async () => {
      const OTHER = "0x1111111111111111111111111111111111111111" as `0x${string}`;
      const deps = makeDeps({ payoutAllowlist: [OTHER] });
      const adapter = createSmartAccountSessionAdapter(deps);
      await assert.rejects(
        () => adapter.signAndSubmit({ payoutAddress: PAYOUT, metadataURI: METADATA_URI }),
        /not in the configured payout allowlist/,
      );
      assert.equal(deps.writeCalls.length, 0);
    });

    it("allowlist comparison is case-insensitive", async () => {
      // Allowlist has lowercase; submit with mixed-case hex digits (0x prefix stays lowercase).
      const lowerPayout = PAYOUT.toLowerCase() as `0x${string}`;
      const mixedPayout = ("0x" + PAYOUT.slice(2).toUpperCase()) as `0x${string}`;
      const adapter = createSmartAccountSessionAdapter(
        makeDeps({ payoutAllowlist: [lowerPayout] }),
      );
      const result = await adapter.signAndSubmit({ payoutAddress: mixedPayout, metadataURI: METADATA_URI });
      assert.ok(result.txHash);
    });

    it("no restriction when allowlist is empty", async () => {
      const adapter = createSmartAccountSessionAdapter(
        makeDeps({ payoutAllowlist: [] }),
      );
      const result = await adapter.signAndSubmit({ payoutAddress: PAYOUT, metadataURI: METADATA_URI });
      assert.ok(result.txHash);
    });

    it("no restriction when allowlist is undefined", async () => {
      const adapter = createSmartAccountSessionAdapter(
        makeDeps({ payoutAllowlist: undefined }),
      );
      const result = await adapter.signAndSubmit({ payoutAddress: PAYOUT, metadataURI: METADATA_URI });
      assert.ok(result.txHash);
    });
  });

  describe("receipt handling", () => {
    it("throws when transaction reverts", async () => {
      const deps = makeDeps({
        waitForTransactionReceipt: async () => ({ status: "reverted" as const, logs: [] }),
      });
      const adapter = createSmartAccountSessionAdapter(deps);
      await assert.rejects(
        () => adapter.signAndSubmit({ payoutAddress: PAYOUT, metadataURI: METADATA_URI }),
        /reverted/,
      );
    });

    it("throws when ListingRegistered event is absent", async () => {
      const deps = makeDeps({
        waitForTransactionReceipt: async () => ({ status: "success" as const, logs: [] }),
      });
      const adapter = createSmartAccountSessionAdapter(deps);
      await assert.rejects(
        () => adapter.signAndSubmit({ payoutAddress: PAYOUT, metadataURI: METADATA_URI }),
        /ListingRegistered/,
      );
    });

    it("ignores ListingRegistered events from a different contract", async () => {
      const other = "0x0000000000000000000000000000000000000001" as `0x${string}`;
      const deps = makeDeps({
        waitForTransactionReceipt: async () => buildReceipt(99, other),
      });
      const adapter = createSmartAccountSessionAdapter(deps);
      await assert.rejects(
        () => adapter.signAndSubmit({ payoutAddress: PAYOUT, metadataURI: METADATA_URI }),
        /ListingRegistered/,
      );
    });
  });
});
