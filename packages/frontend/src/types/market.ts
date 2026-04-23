export interface ListingMetadata {
  name?: string;
  description?: string;
  endpoint?: string;
  method?: "GET" | "POST";
  pricing?: { amount?: string; unit?: string };
  inputs_schema?: unknown;
  output_schema?: unknown;
  example_request?: unknown;
  example_response?: unknown;
  tags?: string[];
  [k: string]: unknown;
}

export interface ListingStats {
  successRate: number;
  avgLatencyMs: number;
  totalCalls: number;
  successes?: number;
  lastCalledAt?: string | null;
  windowDays: number;
}

export interface ListingDetail {
  listingId: string;
  owner: string;
  payout: string;
  active: boolean;
  metadataURI: string;
  metadata: ListingMetadata | null;
  metadataError?: string;
  stats: ListingStats;
  score: number;
  recentErrors?: {
    windowDays: number;
    totalFailures: number;
    breakdown: Record<string, number>;
  };
  adminStatus: string;
}

export interface MarketCallResponse {
  listingId: string;
  jobRef: string;
  settleTxHash: string;
  usdc: string;
  delivery: "relayed_unmodified" | "rejected_untrusted";
  safety: {
    trusted: false;
    scanned: boolean;
    schemaValid: boolean | null;
    warnings: string[];
  };
  untrusted_data: unknown;
  envelope: string;
}
