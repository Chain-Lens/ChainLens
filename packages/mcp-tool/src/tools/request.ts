/**
 * `chain-lens.request` — create a paid job on ChainLens and wait for evidence.
 *
 * Flow (EIP-3009 single-tx path):
 *   1. Sign a USDC TransferWithAuthorization off-chain (no gas, no RPC round-trip).
 *   2. Call `ApiMarketEscrowV2.createJobWithAuth(...)` — escrow redeems the
 *      authorization and records the job in the same tx. No prior `approve`
 *      needed, so we avoid the approve-then-createJob race that previously
 *      surfaced as "ERC20: transfer amount exceeds allowance" reverts when
 *      RPC state between the two txs diverged.
 *   3. Parse `JobCreated` event from the receipt to get `jobId`.
 *   4. Trigger the backend gateway to execute/finalize.
 *   5. Poll `GET /api/evidence/:jobId` until terminal status or timeout.
 *
 * The handler is dependency-injected so unit tests can supply fake clients
 * and fake signers without pulling in viem or the network.
 */

import type { Abi, Account, Log, PublicClient, TransactionReceipt, WalletClient } from "viem";
import { parseSignature } from "viem";

export interface RequestInput {
  seller: `0x${string}`;
  task_type: string;
  inputs: unknown;
  api_id?: string | number | bigint;
  /** Budget in USDC atomic units (6 decimals), e.g. `"50000"` = 0.05 USDC. */
  amount: string;
}

export interface RequestDeps {
  apiBaseUrl: string;
  fetch: typeof fetch;
  publicClient: PublicClient;
  walletClient: WalletClient;
  /**
   * Account object (not bare address). viem routes bare addresses through
   * `eth_sendTransaction` — fine for JSON-RPC wallets that hold the key, but
   * broken for public RPC endpoints + local signer. Pass the full `Account`
   * so viem uses `eth_sendRawTransaction` with the local signature.
   */
  account: Account;
  escrowAddress: `0x${string}`;
  escrowAbi: Abi;
  usdcAddress: `0x${string}`;
  /**
   * EIP-712 domain name/version for the USDC contract at `usdcAddress`.
   * For real USDC (FiatTokenV2 on Base), this is "USD Coin" / "2".
   * Exposed so tests can inject a mock and deployers can override if they
   * point at a non-standard USDC fork.
   */
  usdcEip712Name: string;
  usdcEip712Version: string;
  /** keccak256 helper injected to keep handler viem-free-ish for tests. */
  keccak256: (value: string) => `0x${string}`;
  /** Encodes "task type name" → bytes32 id. */
  taskTypeId: (taskType: string) => `0x${string}`;
  /** Computes inputsHash from canonical JSON of inputs. */
  inputsHash: (inputs: unknown) => `0x${string}`;
  /** Random bytes32 nonce generator for EIP-3009 replay protection. */
  randomNonce: () => `0x${string}`;
  pollIntervalMs: number;
  pollTimeoutMs: number;
  /** How long the EIP-3009 authorization stays valid. Default 1 hour. */
  authValidSeconds?: number;
  /** Defaults to `setTimeout`; tests override with a fake timer. */
  wait?: (ms: number) => Promise<void>;
  /** Defaults to `() => BigInt(Math.floor(Date.now() / 1000))`. */
  nowSeconds?: () => bigint;
}

export interface RequestResult {
  jobId: string;
  txHash: `0x${string}`;
  status: "PENDING" | "COMPLETED" | "REFUNDED" | "FAILED" | "TIMEOUT";
  evidence?: unknown;
}

const TERMINAL = new Set(["COMPLETED", "REFUNDED", "FAILED"]);

const defaultWait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// keccak256("JobCreated(uint256,address,address,bytes32,uint256,bytes32,uint256)")
// Pinned as a literal so this module stays side-effect-free; a unit test
// cross-checks it against the ApiMarketEscrowV2 ABI so any ABI drift fails loudly.
export const JOB_CREATED_TOPIC =
  "0x87970d72e091e94cc30361952ba516be479a55c4add2c20b9e94165af942fd66" as const;

const TRANSFER_WITH_AUTH_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export function pickJobIdFromReceipt(
  receipt: TransactionReceipt,
  escrowAddress: `0x${string}`,
): bigint {
  // Without filtering by escrow + event selector, earlier ERC20 Transfer/Approval
  // logs (whose topics[1] is the buyer address) get picked up as the jobId,
  // then overflow Prisma's int8 column on the backend and blow up /jobs/execute.
  const wanted = escrowAddress.toLowerCase();
  for (const log of receipt.logs as Log[]) {
    if (log.address.toLowerCase() !== wanted) continue;
    const topics = log.topics as readonly `0x${string}`[] | undefined;
    if (!topics || topics[0] !== JOB_CREATED_TOPIC || !topics[1]) continue;
    return BigInt(topics[1]);
  }
  throw new Error("chain-lens.request: JobCreated event not found in tx receipt");
}

export async function requestHandler(
  input: RequestInput,
  deps: RequestDeps,
): Promise<RequestResult> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(input.seller)) {
    throw new Error(`chain-lens.request: invalid seller address '${input.seller}'`);
  }
  if (
    !input.inputs ||
    typeof input.inputs !== "object" ||
    Array.isArray(input.inputs)
  ) {
    throw new Error("chain-lens.request: inputs must be a JSON object");
  }
  if (!/^\d+$/.test(input.amount)) {
    throw new Error(`chain-lens.request: amount must be a non-negative integer string (USDC atomic units)`);
  }
  const amount = BigInt(input.amount);
  if (amount <= 0n) throw new Error("chain-lens.request: amount must be > 0");
  const apiId = BigInt(input.api_id ?? 0);
  if (input.api_id === undefined) {
    // Backend falls back to (seller, task_type) string match when apiId=0. That
    // path has bitten us twice: category drift ("finance" vs "finance_equity_analysis")
    // and TaskTypeRegistry disable both surface here as failed jobs. Warn once.
    process.stderr.write(
      "chain-lens.request: api_id not provided — backend will fall back to " +
        "(seller, task_type) string matching, which is fragile. Pass api_id from " +
        "chain-lens.discover for reliable routing.\n",
    );
  }
  const taskTypeId = deps.taskTypeId(input.task_type);
  const inputsHash = deps.inputsHash(input.inputs);

  // 1. Sign USDC TransferWithAuthorization off-chain. The signature authorizes
  // the escrow to pull `amount` USDC from the buyer inside the same tx as
  // createJob — no separate approve, no allowance state sitting around.
  const nonce = deps.randomNonce();
  const now = (deps.nowSeconds ?? (() => BigInt(Math.floor(Date.now() / 1000))))();
  const validAfter = 0n;
  const validBefore = now + BigInt(deps.authValidSeconds ?? 3600);

  const chainId = deps.walletClient.chain?.id;
  if (chainId === undefined) {
    throw new Error("chain-lens.request: walletClient.chain not configured");
  }

  const signature = await deps.walletClient.signTypedData({
    account: deps.account,
    domain: {
      name: deps.usdcEip712Name,
      version: deps.usdcEip712Version,
      chainId,
      verifyingContract: deps.usdcAddress,
    },
    types: TRANSFER_WITH_AUTH_TYPES,
    primaryType: "TransferWithAuthorization",
    message: {
      from: deps.account.address,
      to: deps.escrowAddress,
      value: amount,
      validAfter,
      validBefore,
      nonce,
    },
  });
  const sig = parseSignature(signature);

  // 2. Single on-chain tx: escrow redeems the authorization and records the job.
  const createHash = await deps.walletClient.writeContract({
    address: deps.escrowAddress,
    abi: deps.escrowAbi,
    functionName: "createJobWithAuth",
    args: [
      input.seller,
      taskTypeId,
      amount,
      inputsHash,
      apiId,
      validAfter,
      validBefore,
      nonce,
      Number(sig.v),
      sig.r,
      sig.s,
    ],
    account: deps.account,
    chain: deps.walletClient.chain,
  });
  const receipt = await deps.publicClient.waitForTransactionReceipt({ hash: createHash });

  // 3. Parse jobId.
  const jobId = pickJobIdFromReceipt(receipt, deps.escrowAddress);

  // 3.5 Trigger backend-side execution/finalization. Best effort: the evidence
  // poll below remains the source of truth, so a transient 5xx here should not
  // mask an already-running worker.
  const executeRes = await deps.fetch(`${deps.apiBaseUrl}/jobs/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jobId: jobId.toString(),
      seller: input.seller,
      taskType: input.task_type,
      inputs: input.inputs,
      amount: input.amount,
      ...(input.api_id !== undefined ? { apiId: apiId.toString() } : {}),
    }),
  });
  if (!executeRes.ok && executeRes.status !== 409) {
    throw new Error(
      `chain-lens.request: execution trigger failed ${executeRes.status} ${executeRes.statusText}`,
    );
  }

  // 4. Poll evidence until terminal or timeout.
  const wait = deps.wait ?? defaultWait;
  const deadline = Date.now() + deps.pollTimeoutMs;
  let lastEvidence: unknown;
  let lastStatus: RequestResult["status"] = "PENDING";
  while (Date.now() < deadline) {
    const res = await deps.fetch(`${deps.apiBaseUrl}/evidence/${jobId}`);
    if (res.status === 200) {
      const body = (await res.json()) as { status?: string } & Record<string, unknown>;
      lastEvidence = body;
      const st = body.status;
      if (typeof st === "string" && TERMINAL.has(st)) {
        lastStatus = st as RequestResult["status"];
        return { jobId: jobId.toString(), txHash: createHash, status: lastStatus, evidence: lastEvidence };
      }
    } else if (res.status !== 404) {
      // 404 just means evidence row not yet written — keep polling.
      throw new Error(`chain-lens.request: evidence poll failed ${res.status}`);
    }
    await wait(deps.pollIntervalMs);
  }
  return {
    jobId: jobId.toString(),
    txHash: createHash,
    status: "TIMEOUT",
    evidence: lastEvidence,
  };
}

export const requestToolDefinition = {
  name: "chain-lens.request",
  description:
    "Create a paid ChainLens job. Signs a USDC EIP-3009 authorization, calls createJobWithAuth on the v2 escrow in a single tx, then waits for the evidence to be recorded.",
  inputSchema: {
    type: "object",
    required: ["seller", "task_type", "inputs", "amount"],
    properties: {
      seller: {
        type: "string",
        description: "0x-prefixed seller address (registered in SellerRegistry).",
      },
      task_type: {
        type: "string",
        description:
          "Task type name (e.g. 'defillama_tvl'). Must be registered AND enabled in the on-chain TaskTypeRegistry — otherwise the backend auto-refunds. When api_id is provided this is advisory for the on-chain event only; routing uses api_id.",
      },
      inputs: {
        description: "Arbitrary JSON inputs for the task; canonical-hashed into inputsHash.",
      },
      api_id: {
        type: "string",
        description:
          "Strongly recommended. On-chain uint256 listing id — pull it from chain-lens.discover. When set, backend routes by primary key; otherwise it falls back to fragile (seller, task_type) string matching and jobs can silently auto-refund on drift.",
      },
      amount: {
        type: "string",
        description: "Budget in USDC atomic units (6 decimals). e.g. '50000' = 0.05 USDC.",
      },
    },
  },
} as const;
