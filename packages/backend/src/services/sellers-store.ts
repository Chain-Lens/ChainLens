import type { Prisma } from "@prisma/client";
import prisma from "../config/prisma.js";
import type {
  SellersStore,
  SellerView,
  NormalizedSellerFilter,
} from "./sellers.service.js";

function whereFrom(filter: NormalizedSellerFilter): Prisma.SellerProfileWhereInput {
  const where: Prisma.SellerProfileWhereInput = {};
  if (filter.activeOnly) where.status = "active";
  if (filter.taskType) {
    where.capabilities = {
      array_contains: filter.taskType,
    } as Prisma.JsonFilter<"SellerProfile">;
  }
  return where;
}

export const prismaSellersStore: SellersStore = {
  async list(filter) {
    const where = whereFrom(filter);
    const [rows, total] = await Promise.all([
      prisma.sellerProfile.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: filter.limit,
        skip: filter.offset,
      }),
      prisma.sellerProfile.count({ where }),
    ]);
    const items: SellerView[] = rows.map((row) => ({
      sellerAddress: row.sellerAddress as `0x${string}`,
      name: row.name,
      endpointUrl: row.endpointUrl,
      capabilities: (row.capabilities as unknown as string[]) ?? [],
      pricePerCall: row.pricePerCall.toString(),
      metadataURI: row.metadataURI,
      status: row.status,
      jobsCompleted: row.jobsCompleted,
      jobsFailed: row.jobsFailed,
      totalEarnings: row.totalEarnings.toString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
    return { items, limit: filter.limit, offset: filter.offset, total };
  },
};
