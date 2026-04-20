import { describe, it, after, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { parseTransaction } from "viem";
import { connectDaemon, DaemonRpcError } from "./client.js";
import { startDaemon, type Daemon, type DaemonEvent } from "./server.js";

const TEST_PK = generatePrivateKey();
const TEST_ADDRESS = privateKeyToAccount(TEST_PK).address;

async function withDaemon(
  ttlMs: number,
  fn: (daemon: Daemon, socketPath: string, events: DaemonEvent[]) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "sign-daemon-"));
  const socketPath = join(dir, "sign.sock");
  const events: DaemonEvent[] = [];
  const daemon = await startDaemon({
    privateKey: TEST_PK,
    socketPath,
    ttlMs,
    onEvent: (e) => events.push(e),
  });
  try {
    await fn(daemon, socketPath, events);
  } finally {
    await daemon.close("client").catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
}

describe("daemon round-trip", () => {
  it("address() returns the unlocked account", async () => {
    await withDaemon(60_000, async (_daemon, socketPath) => {
      const client = await connectDaemon(socketPath);
      try {
        const { address } = await client.address();
        assert.equal(address.toLowerCase(), TEST_ADDRESS.toLowerCase());
      } finally {
        client.close();
      }
    });
  });

  it("status() reports the unlocked address and TTL", async () => {
    await withDaemon(60_000, async (_daemon, socketPath) => {
      const client = await connectDaemon(socketPath);
      try {
        const status = await client.status();
        assert.equal(status.address.toLowerCase(), TEST_ADDRESS.toLowerCase());
        assert.ok(status.ttlRemainingMs > 0);
        assert.ok(status.ttlRemainingMs <= 60_000);
      } finally {
        client.close();
      }
    });
  });

  it("sign-tx returns a signed EIP-1559 transaction", async () => {
    await withDaemon(60_000, async (_daemon, socketPath) => {
      const client = await connectDaemon(socketPath);
      try {
        const { signedTransaction } = await client.signTransaction({
          type: "eip1559",
          chainId: 84532,
          to: "0x0000000000000000000000000000000000000001",
          value: 0n,
          nonce: 0,
          gas: 21_000n,
          maxFeePerGas: 1_000_000_000n,
          maxPriorityFeePerGas: 1_000_000n,
          data: "0x",
        });
        assert.match(signedTransaction, /^0x02/);
        const parsed = parseTransaction(signedTransaction);
        assert.equal(parsed.chainId, 84532);
        assert.equal(parsed.to?.toLowerCase(), "0x0000000000000000000000000000000000000001");
      } finally {
        client.close();
      }
    });
  });

  it("unknown method returns rpc error", async () => {
    await withDaemon(60_000, async (_daemon, socketPath) => {
      const client = await connectDaemon(socketPath);
      try {
        await assert.rejects(
          () =>
            // @ts-expect-error — intentionally calling unsupported method
            client.signTransaction(null),
          (err: unknown) => err instanceof DaemonRpcError && err.code === "invalid_params",
        );
      } finally {
        client.close();
      }
    });
  });

  it("lock closes the daemon", async () => {
    await withDaemon(60_000, async (daemon, socketPath) => {
      const client = await connectDaemon(socketPath);
      await client.lock();
      client.close();
      const reason = await daemon.closed;
      assert.equal(reason, "client");
    });
  });

  it("TTL expiry closes the daemon", async () => {
    await withDaemon(100, async (daemon) => {
      const reason = await daemon.closed;
      assert.equal(reason, "ttl");
    });
  });

  it("second daemon on the same socket refuses to start", async () => {
    await withDaemon(60_000, async (_daemon, socketPath) => {
      await assert.rejects(
        () => startDaemon({ privateKey: TEST_PK, socketPath, ttlMs: 60_000 }),
        /socket already exists/,
      );
    });
  });
});
