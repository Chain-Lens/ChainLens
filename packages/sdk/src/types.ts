export interface ChainLensConfig {
  /** Base URL of the Gateway. Default: https://chainlens.pelicanlab.dev/api */
  gatewayUrl?: string;

  /** Wallet adapter — must be able to sign EIP-3009 typed data. */
  wallet: WalletAdapter;

  /** Off-chain budget enforcement. */
  budget?: {
    perCallMaxUsdc?: number;
    dailyMaxUsdc?: number;
    monthlyMaxUsdc?: number;
  };

  /** Local telemetry config. */
  telemetry?: {
    /** Default: true */
    enabled?: boolean;
    /** Upload to Gateway. Default: false (explicit opt-in). */
    upload?: boolean;
    /** Max entries in local JSONL buffer. Default: 1000. */
    bufferMaxEntries?: number;
  };

  /** Auto-fallback on provider failure. */
  fallback?: {
    enabled: boolean;
    /** Total attempts including primary. Default: 2. */
    maxAttempts?: number;
  };

  /** Chain ID. 84532 = Base Sepolia, 8453 = Base Mainnet. */
  chainId: 84532 | 8453;
}

export interface WalletAdapter {
  address(): Promise<`0x${string}`>;
  signTypedData(typedData: TypedData): Promise<{ v: number; r: `0x${string}`; s: `0x${string}` }>;
  sendTransaction(tx: TxRequest): Promise<`0x${string}`>;
}

export interface TypedData {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: `0x${string}`;
  };
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown>;
}

export interface TxRequest {
  to: `0x${string}`;
  data?: `0x${string}`;
  value?: bigint;
}

export interface CallOptions {
  fallback?: boolean;
  maxUsdc?: number;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export interface CallResult<T = unknown> {
  ok: true;
  data: T;
  listingId: number;
  amountUsdc: number;
  feeUsdc: number;
  netUsdc: number;
  settlement: {
    txHash: `0x${string}`;
    blockNumber: number;
  };
  latencyMs: number;
  attemptIndex: number;
}

export interface RankedListing {
  listingId: number | null;
  name: string | null;
  score: number;
  reasons: string[];
  source: "chainlens" | "coinbase_bazaar" | "fixture";
  verifiedByChainLens: boolean;
  resource?: string;
  network?: string;
  asset?: string;
  payTo?: string;
  stats: {
    successRate: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    avgCostUsdc: number;
    sampleSize: number;
  };
}

export interface FailureMetadata {
  kind:
    | "schema_mismatch"
    | "http_4xx"
    | "http_5xx"
    | "timeout"
    | "auth"
    | "rate_limit"
    | "gateway_error"
    | "budget"
    | "sign"
    | "resolve"
    | "unknown";
  hint: string;
  providerStatus?: number;
  evaluatorLayer?: 1 | 2 | 3 | 4;
  rawProviderError?: string;
}

export interface ListingInfo {
  listingId: number;
  name: string | null;
  priceAtomic: string | null;
  maxLatencyMs: number;
  taskCategory: string;
  outputSchema: unknown | null;
  payout: string;
  active: boolean;
}

export interface BudgetConfig {
  perCallMaxUsdc: number;
  dailyMaxUsdc: number;
  monthlyMaxUsdc: number;
}
