// Length-prefixed JSON RPC on a unix socket. Clients and server share process
// ownership (same uid, socket 0600), so no auth layer.
//
// Wire format per message:
//   [ 4-byte big-endian uint32 body length ][ UTF-8 JSON body ]
//
// BigInts in params/results are encoded as `{ __bigint__: "<decimal>" }` so
// viem transaction objects survive JSON.stringify.

export const MAX_FRAME_SIZE = 64 * 1024;

export type RpcMethod = "address" | "status" | "sign-tx" | "sign-typed-data" | "lock";

export interface RpcRequestBase {
  id: string;
  method: RpcMethod;
}

export interface AddressRequest extends RpcRequestBase {
  method: "address";
}

export interface StatusRequest extends RpcRequestBase {
  method: "status";
}

export interface LockRequest extends RpcRequestBase {
  method: "lock";
}

export interface SignTxRequest extends RpcRequestBase {
  method: "sign-tx";
  params: { transaction: Record<string, unknown> };
}

export interface SignTypedDataRequest extends RpcRequestBase {
  method: "sign-typed-data";
  params: { typedData: Record<string, unknown> };
}

export type RpcRequest =
  | AddressRequest
  | StatusRequest
  | LockRequest
  | SignTxRequest
  | SignTypedDataRequest;

export interface AddressResult {
  address: `0x${string}`;
}

export interface StatusResult {
  address: `0x${string}`;
  ttlRemainingMs: number;
  unlockedAt: number;
}

export interface SignTxResult {
  signedTransaction: `0x${string}`;
}

export interface SignTypedDataResult {
  signature: `0x${string}`;
}

export interface LockResult {
  ok: true;
}

export interface RpcErrorBody {
  code: string;
  message: string;
}

export type RpcResponse<R = unknown> =
  | { id: string; result: R }
  | { id: string; error: RpcErrorBody };

const BIGINT_TAG = "__bigint__";

function replacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return { [BIGINT_TAG]: value.toString() };
  return value;
}

function reviver(_key: string, value: unknown): unknown {
  if (
    value !== null &&
    typeof value === "object" &&
    BIGINT_TAG in (value as Record<string, unknown>)
  ) {
    const raw = (value as Record<string, unknown>)[BIGINT_TAG];
    if (typeof raw === "string") return BigInt(raw);
  }
  return value;
}

export function encodeFrame(message: unknown): Buffer {
  const json = JSON.stringify(message, replacer);
  const body = Buffer.from(json, "utf8");
  if (body.length > MAX_FRAME_SIZE) {
    throw new Error(`frame too large: ${body.length} > ${MAX_FRAME_SIZE}`);
  }
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length, 0);
  return Buffer.concat([header, body]);
}

export interface FrameDecoder {
  push(chunk: Buffer): void;
  reset(): void;
}

export function createFrameDecoder(onFrame: (message: unknown) => void): FrameDecoder {
  let buffered: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  return {
    push(chunk: Buffer): void {
      buffered =
        buffered.length === 0
          ? (chunk as Buffer<ArrayBufferLike>)
          : Buffer.concat([buffered, chunk]);
      while (buffered.length >= 4) {
        const bodyLen = buffered.readUInt32BE(0);
        if (bodyLen > MAX_FRAME_SIZE) {
          throw new Error(`frame too large: ${bodyLen} > ${MAX_FRAME_SIZE}`);
        }
        if (buffered.length < 4 + bodyLen) return;
        const body = buffered.subarray(4, 4 + bodyLen).toString("utf8");
        buffered = buffered.subarray(4 + bodyLen);
        onFrame(JSON.parse(body, reviver));
      }
    },
    reset(): void {
      buffered = Buffer.alloc(0);
    },
  };
}

export function rpcError(id: string, code: string, message: string): RpcResponse {
  return { id, error: { code, message } };
}

export function rpcResult<R>(id: string, result: R): RpcResponse<R> {
  return { id, result };
}
