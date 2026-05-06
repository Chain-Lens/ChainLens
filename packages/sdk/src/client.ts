import type { ChainLensConfig, CallOptions, CallResult, RankedListing } from "./types.js";
import { BudgetController } from "./budget.js";
import { TelemetryRecorder } from "./telemetry.js";
import { executeCall } from "./call.js";
import { fetchRecommendations } from "./recommend.js";
import { ProviderClient } from "./provider.js";
import { ChainLensCallError } from "./errors.js";
import type { FailureMetadata } from "./types.js";

const DEFAULT_GATEWAY = "https://chainlens.pelicanlab.dev";

const RETRYABLE_KINDS: ReadonlySet<FailureMetadata["kind"]> = new Set([
  "http_5xx",
  "timeout",
  "schema_mismatch",
]);

export class ChainLens {
  private readonly cfg: ChainLensConfig & { gatewayUrl: string };
  private budget: BudgetController | null = null;
  private telemetry: TelemetryRecorder | null = null;
  private walletAddress: string | null = null;
  readonly provider: ProviderClient;

  constructor(cfg: ChainLensConfig) {
    this.cfg = { gatewayUrl: DEFAULT_GATEWAY, ...cfg };
    this.provider = new ProviderClient(this.cfg.gatewayUrl, cfg.wallet);
  }

  private async init(): Promise<{ budget: BudgetController; telemetry: TelemetryRecorder }> {
    if (!this.walletAddress) {
      this.walletAddress = await this.cfg.wallet.address();
    }
    if (!this.budget) {
      this.budget = new BudgetController(this.walletAddress, this.cfg.budget);
    }
    if (!this.telemetry) {
      this.telemetry = new TelemetryRecorder({
        enabled: this.cfg.telemetry?.enabled ?? true,
        upload: this.cfg.telemetry?.upload ?? false,
        bufferMaxEntries: this.cfg.telemetry?.bufferMaxEntries ?? 1000,
        gatewayUrl: this.cfg.gatewayUrl,
        walletAddress: this.walletAddress,
      });
    }
    return { budget: this.budget, telemetry: this.telemetry };
  }

  async call<T = unknown>(
    listingId: number,
    params: unknown,
    options: CallOptions = {},
  ): Promise<CallResult<T>> {
    const { budget, telemetry } = await this.init();

    const maxAttempts =
      options.fallback !== false && this.cfg.fallback?.enabled
        ? (this.cfg.fallback.maxAttempts ?? 2)
        : 1;

    let lastErr: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const result = await executeCall(this.cfg, budget, telemetry, listingId, params, options);
        return { ...result, attemptIndex: attempt } as CallResult<T>;
      } catch (err) {
        lastErr = err;
        if (
          attempt < maxAttempts - 1 &&
          err instanceof ChainLensCallError &&
          RETRYABLE_KINDS.has(err.failure.kind)
        ) {
          continue;
        }
        break;
      }
    }

    throw lastErr;
  }

  async recommend(task: string, maxResults = 5): Promise<RankedListing[]> {
    return fetchRecommendations(this.cfg.gatewayUrl, task, maxResults);
  }

  async currentSpend(): Promise<{ dailyUsdc: number; monthlyUsdc: number }> {
    const { budget } = await this.init();
    return budget.currentSpend();
  }
}
