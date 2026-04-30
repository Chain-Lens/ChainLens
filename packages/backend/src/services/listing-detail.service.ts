/**
 * Listing detail orchestration. Owns the read-path of
 * /api/market/listings/:id — combines on-chain state, off-chain metadata,
 * stats, and admin status into the response shape. Each collaborator is
 * injected so tests can run without RPC, HTTP, or DB.
 */

import { getAddress } from "viem";
import type { ListingsRepository, ApprovalStatus } from "../repositories/listing.repository.js";
import type {
  ListingMetadata,
  OnChainListing,
} from "./market-chain.service.js";
import type { ListingStats, RecentErrors } from "./call-log.service.js";
import { scoreListing } from "./call-log.service.js";

export type ListingReader = (id: bigint) => Promise<OnChainListing>;
export type MetadataResolver = (uri: string) => Promise<ListingMetadata>;
export type ListingStatsFn = (id: number) => Promise<ListingStats>;
export type RecentErrorsFn = (id: number) => Promise<RecentErrors>;

export interface ListingDetailResponse {
  listingId: string;
  owner: string;
  payout: string;
  active: boolean;
  metadataURI: string;
  metadata: ListingMetadata | null;
  metadataError?: string;
  stats: ListingStats;
  score: number;
  recentErrors: RecentErrors;
  /** "APPROVED" | "PENDING" | "REJECTED" | "REVOKED" | "UNLISTED" */
  adminStatus: string;
}

export class ListingDetailService {
  constructor(
    private readonly repo: ListingsRepository,
    private readonly readListing: ListingReader,
    private readonly resolveMetadata: MetadataResolver,
    private readonly getStats: ListingStatsFn,
    private readonly getRecentErrors: RecentErrorsFn,
  ) {}

  async getDetail(id: bigint): Promise<ListingDetailResponse> {
    const listing = await this.readListing(id);
    const meta = await this.tryResolveMetadata(listing.metadataURI);

    const [stats, recentErrors, approval] = await Promise.all([
      this.getStats(Number(id)),
      this.getRecentErrors(Number(id)),
      this.repo.findApprovalStatus(Number(id)),
    ]);

    return {
      listingId: id.toString(),
      owner: getAddress(listing.owner),
      payout: getAddress(listing.payout),
      active: listing.active,
      metadataURI: listing.metadataURI,
      metadata: meta.value,
      ...(meta.error ? { metadataError: meta.error } : {}),
      stats,
      score: scoreListing(stats),
      recentErrors,
      adminStatus: adminStatusLabel(approval),
    };
  }

  private async tryResolveMetadata(
    uri: string,
  ): Promise<{ value: ListingMetadata | null; error?: string }> {
    try {
      return { value: await this.resolveMetadata(uri) };
    } catch (e) {
      return { value: null, error: e instanceof Error ? e.message : String(e) };
    }
  }
}

/** UNLISTED = listener hasn't ingested yet. Sellers + admins see this
 *  until the next ListingRegistered event is processed. */
function adminStatusLabel(approval: ApprovalStatus): string {
  return approval ?? "UNLISTED";
}
