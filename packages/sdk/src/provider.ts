import type { WalletAdapter } from "./types.js";
import { ChainLensResolveError, ChainLensGatewayError } from "./errors.js";

export interface ClaimableResult {
  totalUsdc: number;
  atomicBalance: string;
}

export interface ListingDashboard {
  listingId: number;
  name: string | null;
  totalEarnedUsdc: number;
  claimableUsdc: number;
  callCount: number;
  successRate: number;
  p50LatencyMs: number;
}

export class ProviderClient {
  constructor(
    private readonly gatewayUrl: string,
    private readonly wallet: WalletAdapter,
  ) {}

  async claimable(): Promise<ClaimableResult> {
    const address = await this.wallet.address();
    const res = await fetch(
      `${this.gatewayUrl}/v1/provider/claimable?address=${address}`,
    );
    if (!res.ok) {
      throw new ChainLensGatewayError(
        `claimable fetch failed: ${res.status}`,
        res.status,
      );
    }
    return res.json() as Promise<ClaimableResult>;
  }

  async claim(): Promise<{ txHash: `0x${string}` } | { skipped: true }> {
    const claimable = await this.claimable();
    if (BigInt(claimable.atomicBalance) === 0n) {
      return { skipped: true };
    }
    const address = await this.wallet.address();
    const res = await fetch(`${this.gatewayUrl}/v1/provider/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ChainLensGatewayError(`claim failed: ${res.status} ${body}`, res.status);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    return { txHash: data.txHash as `0x${string}` };
  }

  async listingDashboard(listingId: number): Promise<ListingDashboard> {
    const address = await this.wallet.address();
    const res = await fetch(
      `${this.gatewayUrl}/v1/provider/listing/${listingId}?address=${address}`,
    );
    if (!res.ok) {
      if (res.status === 403) {
        throw new ChainLensResolveError(`Not authorized to view listing ${listingId}`);
      }
      throw new ChainLensGatewayError(
        `dashboard fetch failed: ${res.status}`,
        res.status,
      );
    }
    return res.json() as Promise<ListingDashboard>;
  }
}
