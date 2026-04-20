import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTransaction, recoverAddress, keccak256, serializeTransaction } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { connectDaemon } from "./client.js";
import { daemonAccount } from "./account.js";
import { startDaemon } from "./server.js";

describe("daemonAccount (viem custom account)", () => {
  it("signs a transaction such that recovering the signer returns the unlocked address", async () => {
    const pk = generatePrivateKey();
    const expected = privateKeyToAccount(pk).address;

    const dir = await mkdtemp(join(tmpdir(), "sign-acct-"));
    const socketPath = join(dir, "sign.sock");
    const daemon = await startDaemon({ privateKey: pk, socketPath, ttlMs: 60_000 });
    try {
      const client = await connectDaemon(socketPath);
      const account = await daemonAccount(client);
      assert.equal(account.address.toLowerCase(), expected.toLowerCase());

      const tx = {
        type: "eip1559" as const,
        chainId: 84532,
        to: "0x0000000000000000000000000000000000000042" as const,
        value: 1n,
        nonce: 0,
        gas: 21_000n,
        maxFeePerGas: 1_000_000_000n,
        maxPriorityFeePerGas: 1_000_000n,
        data: "0x" as const,
      };
      const signed = await account.signTransaction(tx);

      const parsed = parseTransaction(signed);
      assert.ok(parsed.r && parsed.s && parsed.v !== undefined);

      // Recover signer from the serialized-unsigned transaction hash and sig.
      const unsigned = serializeTransaction({ ...tx });
      const recovered = await recoverAddress({
        hash: keccak256(unsigned),
        signature: { r: parsed.r, s: parsed.s, v: parsed.v },
      });
      assert.equal(recovered.toLowerCase(), expected.toLowerCase());

      client.close();
    } finally {
      await daemon.close("client").catch(() => {});
      await rm(dir, { recursive: true, force: true });
    }
  });
});
