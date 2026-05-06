/**
 * Submits the on-chain `settle()` call. Wrapped behind an interface so
 * tests can drive the listing-call service through a stub that resolves
 * to a fixed tx hash (or throws to exercise the failure branch).
 */

import type { PublicClient, WalletClient } from "viem";
import { ChainLensMarketAbi } from "@chain-lens/shared";
import type { PaymentAuth } from "../utils/payment.js";

export interface SettlementService {
  /** Dry-run the settle() call via eth_call. Throws SettlementPreflightError
   *  if the simulation would revert (bad signature, insufficient balance, used
   *  nonce, etc.). Call this before touching the seller to avoid free compute. */
  simulateSettlement(args: {
    listingId: bigint;
    jobRef: `0x${string}`;
    payment: PaymentAuth;
  }): Promise<void>;

  settle(args: {
    listingId: bigint;
    jobRef: `0x${string}`;
    payment: PaymentAuth;
  }): Promise<`0x${string}`>;

  /** Best-effort post-settle observability. Implementations can wait on
   *  the receipt and log status; not awaited by the caller. Kept on the
   *  same interface so tests can opt out by injecting a no-op. */
  watchReceipt(txHash: `0x${string}`, ctx: { listingId: string; jobRef: `0x${string}` }): void;
}

export class SettlementPreflightError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "SettlementPreflightError";
  }
}

type WriteContractFn = (call: () => Promise<`0x${string}`>) => Promise<`0x${string}`>;

interface Logger {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
}

export class OnChainSettlementService implements SettlementService {
  constructor(
    private readonly walletClient: WalletClient,
    private readonly publicClient: PublicClient,
    private readonly enqueueWrite: WriteContractFn,
    private readonly marketAddress: () => `0x${string}`,
    private readonly logger: Logger,
  ) {}

  async simulateSettlement(args: {
    listingId: bigint;
    jobRef: `0x${string}`;
    payment: PaymentAuth;
  }): Promise<void> {
    try {
      await this.publicClient.simulateContract({
        address: this.marketAddress(),
        abi: ChainLensMarketAbi,
        functionName: "settle",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        account: (this.walletClient as any).account,
        args: [
          args.listingId,
          args.jobRef,
          args.payment.buyer,
          BigInt(args.payment.amount),
          BigInt(args.payment.validAfter),
          BigInt(args.payment.validBefore),
          args.payment.nonce,
          args.payment.v,
          args.payment.r,
          args.payment.s,
        ],
      });
    } catch (e) {
      throw new SettlementPreflightError(e instanceof Error ? e.message : String(e), e);
    }
  }

  async settle(args: {
    listingId: bigint;
    jobRef: `0x${string}`;
    payment: PaymentAuth;
  }): Promise<`0x${string}`> {
    // viem requires `account` + `chain` for WalletClient.writeContract. The
    // injected wallet has both bound; cast keeps the service interface
    // narrow without re-declaring the entire WriteContractParameters shape.
    return this.enqueueWrite(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.walletClient as any).writeContract({
        address: this.marketAddress(),
        abi: ChainLensMarketAbi,
        functionName: "settle",
        args: [
          args.listingId,
          args.jobRef,
          args.payment.buyer,
          BigInt(args.payment.amount),
          BigInt(args.payment.validAfter),
          BigInt(args.payment.validBefore),
          args.payment.nonce,
          args.payment.v,
          args.payment.r,
          args.payment.s,
        ],
      }),
    );
  }

  watchReceipt(txHash: `0x${string}`, ctx: { listingId: string; jobRef: `0x${string}` }): void {
    void (async () => {
      try {
        const rcpt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
        this.logger.info(
          {
            listingId: ctx.listingId,
            jobRef: ctx.jobRef,
            txHash,
            status: rcpt.status,
            gasUsed: rcpt.gasUsed.toString(),
          },
          "settlement confirmed",
        );
      } catch (e) {
        this.logger.warn({ txHash, err: String(e) }, "settle receipt wait failed");
      }
    })();
  }
}
