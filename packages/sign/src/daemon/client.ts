import { createConnection, type Socket } from "node:net";
import { randomUUID } from "node:crypto";
import {
  createFrameDecoder,
  encodeFrame,
  type AddressResult,
  type RpcResponse,
  type SignTypedDataResult,
  type SignTxResult,
  type StatusResult,
} from "./protocol.js";

export class DaemonRpcError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}

export interface DaemonClient {
  address(): Promise<AddressResult>;
  status(): Promise<StatusResult>;
  signTransaction(transaction: Record<string, unknown>): Promise<SignTxResult>;
  signTypedData(typedData: Record<string, unknown>): Promise<SignTypedDataResult>;
  lock(): Promise<void>;
  close(): void;
}

export async function connectDaemon(socketPath: string): Promise<DaemonClient> {
  const socket = await connect(socketPath);

  const pending = new Map<string, (resp: RpcResponse) => void>();
  const decoder = createFrameDecoder((raw) => {
    const resp = raw as RpcResponse;
    const resolver = pending.get(resp.id);
    if (resolver) {
      pending.delete(resp.id);
      resolver(resp);
    }
  });

  socket.on("data", (chunk) => decoder.push(chunk));
  socket.on("close", () => {
    for (const [, resolve] of pending) {
      resolve({ id: "", error: { code: "connection_closed", message: "daemon socket closed" } });
    }
    pending.clear();
  });

  function call<R>(method: string, params?: unknown): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      const id = randomUUID();
      pending.set(id, (resp) => {
        if ("error" in resp) reject(new DaemonRpcError(resp.error.code, resp.error.message));
        else resolve(resp.result as R);
      });
      const payload = params === undefined ? { id, method } : { id, method, params };
      socket.write(encodeFrame(payload));
    });
  }

  return {
    address: () => call<AddressResult>("address"),
    status: () => call<StatusResult>("status"),
    signTransaction: (transaction) =>
      call<SignTxResult>("sign-tx", { transaction }),
    signTypedData: (typedData) =>
      call<SignTypedDataResult>("sign-typed-data", { typedData }),
    lock: async () => {
      await call<{ ok: true }>("lock");
    },
    close: () => socket.end(),
  };
}

function connect(socketPath: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath);
    const onError = (err: Error) => {
      socket.off("connect", onConnect);
      reject(err);
    };
    const onConnect = () => {
      socket.off("error", onError);
      resolve(socket);
    };
    socket.once("error", onError);
    socket.once("connect", onConnect);
  });
}
