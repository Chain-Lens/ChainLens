/**
 * ListingsRepository — narrows Prisma down to the queries the listings
 * search service actually needs. Lets the route be tested with a
 * hand-rolled fake (no Prisma generate, no DB) and gives us a single
 * place to evolve the storage backend later (e.g. read-replica, cache
 * layer) without touching service or route code.
 */

import type { PrismaClient } from "@prisma/client";

export interface ApprovedListingRow {
  onChainId: number;
  name: string;
  description: string;
  endpoint: string;
  price: string;
  category: string;
  sellerAddress: string;
}

export interface ListingsSearchFilter {
  q?: string;
  tag?: string;
}

export type ListingsOrder = "latest" | "unordered";

/** Subset of `ApiStatus` returned by approval lookups. The string union
 *  matches Prisma's enum values so the route layer can pass it through
 *  without re-mapping. `null` = no row exists yet (listener hasn't
 *  ingested the on-chain registration). */
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "REVOKED" | null;

export interface ListingsRepository {
  /** Total V3 rows regardless of approval status — used for the
   *  "X on-chain listings found, but none approved" hint on the empty
   *  state in /discover. */
  countV3(): Promise<number>;

  /** APPROVED V3 rows matching `filter`. `latest` orders by onChainId
   *  desc; `unordered` lets the service apply its own ranking. */
  findApproved(filter: ListingsSearchFilter, order: ListingsOrder): Promise<ApprovedListingRow[]>;

  /** Admin approval state for a single V3 listing. `null` distinguishes
   *  "row exists, not approved" (PENDING/etc.) from "row missing
   *  entirely" (UNLISTED — listener hasn't seen this id yet). */
  findApprovalStatus(onChainId: number): Promise<ApprovalStatus>;
}

export class PrismaListingsRepository implements ListingsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async countV3(): Promise<number> {
    return this.prisma.apiListing.count({ where: { contractVersion: "V3" } });
  }

  async findApproved(
    filter: ListingsSearchFilter,
    order: ListingsOrder,
  ): Promise<ApprovedListingRow[]> {
    const rows = await this.prisma.apiListing.findMany({
      where: {
        contractVersion: "V3",
        status: "APPROVED",
        ...(filter.q
          ? {
              OR: [
                { name: { contains: filter.q, mode: "insensitive" as const } },
                { description: { contains: filter.q, mode: "insensitive" as const } },
              ],
            }
          : {}),
        ...(filter.tag ? { category: { equals: filter.tag, mode: "insensitive" as const } } : {}),
      },
      ...(order === "latest" ? { orderBy: { onChainId: "desc" as const } } : {}),
    });

    // Drop rows missing the on-chain id — they shouldn't exist for V3
    // but the schema marks the column nullable for legacy compatibility.
    return rows
      .filter((r): r is typeof r & { onChainId: number } => typeof r.onChainId === "number")
      .map((r) => ({
        onChainId: r.onChainId,
        name: r.name,
        description: r.description,
        endpoint: r.endpoint,
        price: r.price,
        category: r.category,
        sellerAddress: r.sellerAddress,
      }));
  }

  async findApprovalStatus(onChainId: number): Promise<ApprovalStatus> {
    const row = await this.prisma.apiListing.findUnique({
      where: { contractVersion_onChainId: { contractVersion: "V3", onChainId } },
      select: { status: true },
    });
    return (row?.status as ApprovalStatus) ?? null;
  }
}
