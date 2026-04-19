import {
  ApiMarketEscrowV2Abi,
  SellerRegistryAbi,
  CONTRACT_ADDRESSES_V2,
  SELLER_REGISTRY_ADDRESSES,
} from "@chainlens/shared";
import {
  recordJobPaid,
  recordJobCompletion,
  buildEvidenceURI,
  type EvidenceStore,
} from "./evidence.service.js";

export interface ListenerLogger {
  info: (obj: object, msg: string) => void;
  warn: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
}

export interface JobCreatedArgs {
  jobId: bigint;
  buyer: `0x${string}`;
  seller: `0x${string}`;
  taskType: `0x${string}`;
  amount: bigint;
  inputsHash: `0x${string}`;
  apiId: bigint;
}

export interface JobSubmittedArgs {
  jobId: bigint;
  responseHash: `0x${string}`;
  evidenceURI: string;
}

export interface PaymentRefundedArgs {
  paymentId: bigint;
  buyer: `0x${string}`;
  amount: bigint;
}

export interface JobResultRecordedArgs {
  seller: `0x${string}`;
  success: boolean;
  amount: bigint;
}

export interface V2ListenerDeps {
  store: EvidenceStore;
  platformUrl: string;
  logger: ListenerLogger;
}

const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

/**
 * On JobCreated we create the Job row in PAID state. evidenceURI is canonical
 * (`${PLATFORM_URL}/api/evidence/${jobId}`) so it's derivable even before the
 * on-chain JobSubmitted lands.
 */
export async function handleJobCreated(
  args: JobCreatedArgs,
  deps: V2ListenerDeps,
): Promise<void> {
  try {
    await recordJobPaid(
      {
        onchainJobId: args.jobId,
        buyer: args.buyer,
        seller: args.seller,
        apiId: args.apiId,
        taskType: args.taskType === ZERO_BYTES32 ? null : args.taskType,
        amount: args.amount.toString(),
        inputsHash: args.inputsHash,
        evidenceURI: buildEvidenceURI(args.jobId, deps.platformUrl),
      },
      deps.store,
    );
    deps.logger.info(
      {
        jobId: args.jobId.toString(),
        buyer: args.buyer,
        seller: args.seller,
        taskType: args.taskType,
        amount: args.amount.toString(),
      },
      "JobCreated recorded",
    );
  } catch (err) {
    deps.logger.error(
      { jobId: args.jobId.toString(), err: errMsg(err) },
      "JobCreated handler failed",
    );
  }
}

export async function handleJobSubmitted(
  args: JobSubmittedArgs,
  deps: V2ListenerDeps,
): Promise<void> {
  try {
    await recordJobCompletion(
      args.jobId,
      {
        status: "COMPLETED",
        responseHash: args.responseHash,
      },
      deps.store,
    );
    deps.logger.info(
      {
        jobId: args.jobId.toString(),
        responseHash: args.responseHash,
        evidenceURI: args.evidenceURI,
      },
      "JobSubmitted recorded",
    );
  } catch (err) {
    deps.logger.error(
      { jobId: args.jobId.toString(), err: errMsg(err) },
      "JobSubmitted handler failed",
    );
  }
}

export async function handlePaymentRefunded(
  args: PaymentRefundedArgs,
  deps: V2ListenerDeps,
): Promise<void> {
  try {
    await recordJobCompletion(
      args.paymentId,
      { status: "REFUNDED" },
      deps.store,
    );
    deps.logger.info(
      {
        jobId: args.paymentId.toString(),
        buyer: args.buyer,
        amount: args.amount.toString(),
      },
      "PaymentRefunded recorded",
    );
  } catch (err) {
    deps.logger.error(
      { jobId: args.paymentId.toString(), err: errMsg(err) },
      "PaymentRefunded handler failed",
    );
  }
}

export function handleJobResultRecorded(
  args: JobResultRecordedArgs,
  deps: V2ListenerDeps,
): void {
  deps.logger.info(
    {
      seller: args.seller,
      success: args.success,
      amount: args.amount.toString(),
    },
    "JobResultRecorded observed (reputation updated on-chain)",
  );
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export interface StartV2ListenerOptions {
  chainId: number;
  publicClient: {
    watchContractEvent: (args: {
      address: `0x${string}`;
      abi: readonly unknown[];
      eventName: string;
      onLogs: (logs: unknown[]) => void | Promise<void>;
      onError?: (err: unknown) => void;
    }) => () => void;
  };
  deps: V2ListenerDeps;
}

export interface StopV2Listener {
  (): void;
}

export function startV2EventListener(
  opts: StartV2ListenerOptions,
): StopV2Listener {
  const escrow = CONTRACT_ADDRESSES_V2[opts.chainId];
  const registry = SELLER_REGISTRY_ADDRESSES[opts.chainId];
  if (!escrow || escrow === "0x0000000000000000000000000000000000000000") {
    throw new Error(`ApiMarketEscrowV2 not deployed for chainId=${opts.chainId}`);
  }
  if (!registry || registry === "0x0000000000000000000000000000000000000000") {
    throw new Error(`SellerRegistry not deployed for chainId=${opts.chainId}`);
  }

  const unsubs: Array<() => void> = [];

  unsubs.push(
    opts.publicClient.watchContractEvent({
      address: escrow,
      abi: ApiMarketEscrowV2Abi as readonly unknown[],
      eventName: "JobCreated",
      onLogs: async (logs) => {
        for (const log of logs) {
          const args = (log as { args: JobCreatedArgs }).args;
          await handleJobCreated(args, opts.deps);
        }
      },
      onError: (err) =>
        opts.deps.logger.error({ err: errMsg(err) }, "JobCreated watcher error"),
    }),
  );

  unsubs.push(
    opts.publicClient.watchContractEvent({
      address: escrow,
      abi: ApiMarketEscrowV2Abi as readonly unknown[],
      eventName: "JobSubmitted",
      onLogs: async (logs) => {
        for (const log of logs) {
          const args = (log as { args: JobSubmittedArgs }).args;
          await handleJobSubmitted(args, opts.deps);
        }
      },
      onError: (err) =>
        opts.deps.logger.error({ err: errMsg(err) }, "JobSubmitted watcher error"),
    }),
  );

  unsubs.push(
    opts.publicClient.watchContractEvent({
      address: escrow,
      abi: ApiMarketEscrowV2Abi as readonly unknown[],
      eventName: "PaymentRefunded",
      onLogs: async (logs) => {
        for (const log of logs) {
          const args = (log as { args: PaymentRefundedArgs }).args;
          await handlePaymentRefunded(args, opts.deps);
        }
      },
      onError: (err) =>
        opts.deps.logger.error({ err: errMsg(err) }, "PaymentRefunded watcher error"),
    }),
  );

  unsubs.push(
    opts.publicClient.watchContractEvent({
      address: registry,
      abi: SellerRegistryAbi as readonly unknown[],
      eventName: "JobResultRecorded",
      onLogs: (logs) => {
        for (const log of logs) {
          const args = (log as { args: JobResultRecordedArgs }).args;
          handleJobResultRecorded(args, opts.deps);
        }
      },
      onError: (err) =>
        opts.deps.logger.error(
          { err: errMsg(err) },
          "JobResultRecorded watcher error",
        ),
    }),
  );

  opts.deps.logger.info(
    { escrow, registry, chainId: opts.chainId },
    "V2 event listener started",
  );

  return () => {
    for (const u of unsubs) {
      try {
        u();
      } catch {
        // swallow unsub errors
      }
    }
  };
}
