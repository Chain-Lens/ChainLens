import { createServer, type Server, type Socket } from "node:net";
import { access, unlink } from "node:fs/promises";
import { privateKeyToAccount, signTransaction } from "viem/accounts";
import {
  createFrameDecoder,
  encodeFrame,
  rpcError,
  rpcResult,
  type RpcRequest,
  type SignTypedDataRequest,
  type SignTxRequest,
} from "./protocol.js";

export type LockReason = "ttl" | "client" | "signal" | "error";

export type SignTxDecision =
  | { type: "allow"; commit?: () => void }
  | { type: "deny"; code: "unknown_target" | "limit_exceeded" | "denied" | "timeout" | "no_tty"; message: string };

/**
 * Policy gate invoked before signing. Returns allow/deny.
 * Receives the raw viem transaction request. 0.0.2 allowed everything
 * (no gate); 0.0.3 injects decoder + limits + approval prompt.
 */
export type SignTxPolicy = (tx: Record<string, unknown>) => Promise<SignTxDecision>;
export type SignTypedDataPolicy = (
  typedData: Record<string, unknown>,
) => Promise<SignTxDecision>;

export interface DaemonOptions {
  privateKey: `0x${string}`;
  socketPath: string;
  ttlMs: number;
  onEvent?: (event: DaemonEvent) => void;
  /** Pre-sign policy gate. Omit for no-gate (test/legacy). */
  policy?: SignTxPolicy;
  /** Pre-sign policy gate for EIP-712 typed-data requests. */
  typedDataPolicy?: SignTypedDataPolicy;
}

export type DaemonEvent =
  | { type: "listening"; address: `0x${string}`; socketPath: string; ttlMs: number }
  | { type: "request"; method: string }
  | { type: "signed"; amountAtomic?: bigint; kind?: string }
  | { type: "denied"; code: string; message: string }
  | { type: "closed"; reason: LockReason };

export interface Daemon {
  close(reason?: LockReason): Promise<void>;
  closed: Promise<LockReason>;
}

export async function startDaemon(opts: DaemonOptions): Promise<Daemon> {
  const account = privateKeyToAccount(opts.privateKey);
  const address = account.address;
  const unlockedAt = Date.now();

  await rejectIfSocketExists(opts.socketPath);

  let closing = false;
  let closedReason: LockReason | null = null;
  let resolveClosed!: (r: LockReason) => void;
  const closed = new Promise<LockReason>((r) => {
    resolveClosed = r;
  });

  const server: Server = createServer();
  server.on("connection", (socket) => handleConnection(socket));

  server.on("error", (err) => {
    opts.onEvent?.({ type: "closed", reason: "error" });
    void closeDaemon("error", err);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.socketPath, () => {
      server.off("error", reject);
      resolve();
    });
  });

  opts.onEvent?.({
    type: "listening",
    address,
    socketPath: opts.socketPath,
    ttlMs: opts.ttlMs,
  });

  const ttlTimer = setTimeout(() => {
    void closeDaemon("ttl");
  }, opts.ttlMs);
  ttlTimer.unref();

  const signalHandler = () => {
    void closeDaemon("signal");
  };
  process.on("SIGINT", signalHandler);
  process.on("SIGTERM", signalHandler);

  async function closeDaemon(reason: LockReason, _err?: unknown): Promise<void> {
    if (closing) return;
    closing = true;
    closedReason = reason;
    clearTimeout(ttlTimer);
    process.off("SIGINT", signalHandler);
    process.off("SIGTERM", signalHandler);

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    try {
      await unlink(opts.socketPath);
    } catch {
      // socket already gone — ignore
    }

    opts.onEvent?.({ type: "closed", reason });
    resolveClosed(reason);
  }

  function handleConnection(socket: Socket): void {
    const decoder = createFrameDecoder((message) => {
      void dispatch(socket, message as RpcRequest);
    });
    socket.on("data", (chunk) => {
      try {
        decoder.push(chunk);
      } catch (err) {
        socket.destroy(err instanceof Error ? err : new Error(String(err)));
      }
    });
    socket.on("error", () => socket.destroy());
  }

  async function dispatch(socket: Socket, req: RpcRequest): Promise<void> {
    if (!req || typeof req.id !== "string" || typeof req.method !== "string") {
      send(socket, rpcError("(unknown)", "invalid_request", "request missing id/method"));
      return;
    }
    opts.onEvent?.({ type: "request", method: req.method });

    switch (req.method) {
      case "address":
        send(socket, rpcResult(req.id, { address }));
        return;
      case "status":
        send(
          socket,
          rpcResult(req.id, {
            address,
            unlockedAt,
            ttlRemainingMs: Math.max(0, opts.ttlMs - (Date.now() - unlockedAt)),
          }),
        );
        return;
      case "sign-tx":
        await handleSignTx(socket, req);
        return;
      case "sign-typed-data":
        await handleSignTypedData(socket, req);
        return;
      case "lock":
        send(socket, rpcResult(req.id, { ok: true }));
        socket.end(() => {
          void closeDaemon("client");
        });
        return;
      default: {
        const unknown = req as { id: string; method: string };
        send(socket, rpcError(unknown.id, "unknown_method", `method not supported: ${unknown.method}`));
      }
    }
  }

  async function handleSignTx(socket: Socket, req: SignTxRequest): Promise<void> {
    const tx = req.params?.transaction;
    if (!tx || typeof tx !== "object") {
      send(socket, rpcError(req.id, "invalid_params", "missing params.transaction"));
      return;
    }
    let commit: (() => void) | undefined;
    if (opts.policy) {
      const decision = await opts.policy(tx as Record<string, unknown>);
      if (decision.type === "deny") {
        opts.onEvent?.({ type: "denied", code: decision.code, message: decision.message });
        send(socket, rpcError(req.id, decision.code, decision.message));
        return;
      }
      commit = decision.commit;
    }
    try {
      const signed = await signTransaction({
        privateKey: opts.privateKey,
        transaction: tx as Parameters<typeof signTransaction>[0]["transaction"],
      });
      commit?.();
      send(socket, rpcResult(req.id, { signedTransaction: signed }));
    } catch (err) {
      send(
        socket,
        rpcError(req.id, "signing_failed", err instanceof Error ? err.message : String(err)),
      );
    }
  }

  async function handleSignTypedData(
    socket: Socket,
    req: SignTypedDataRequest,
  ): Promise<void> {
    const typedData = req.params?.typedData;
    if (!typedData || typeof typedData !== "object") {
      send(socket, rpcError(req.id, "invalid_params", "missing params.typedData"));
      return;
    }
    let commit: (() => void) | undefined;
    if (opts.typedDataPolicy) {
      const decision = await opts.typedDataPolicy(
        typedData as Record<string, unknown>,
      );
      if (decision.type === "deny") {
        opts.onEvent?.({ type: "denied", code: decision.code, message: decision.message });
        send(socket, rpcError(req.id, decision.code, decision.message));
        return;
      }
      commit = decision.commit;
    }
    try {
      const signature = await account.signTypedData(
        typedData as Parameters<typeof account.signTypedData>[0],
      );
      commit?.();
      send(socket, rpcResult(req.id, { signature }));
    } catch (err) {
      send(
        socket,
        rpcError(req.id, "signing_failed", err instanceof Error ? err.message : String(err)),
      );
    }
  }

  function send(socket: Socket, message: unknown): void {
    if (socket.writable) socket.write(encodeFrame(message));
  }

  return {
    close: (reason = "client") => closeDaemon(reason),
    closed,
  };
}

async function rejectIfSocketExists(path: string): Promise<void> {
  try {
    await access(path);
  } catch {
    return;
  }
  throw new Error(
    `socket already exists at ${path} — another daemon running, or stale. Run 'chain-lens-sign lock' or remove the file.`,
  );
}
