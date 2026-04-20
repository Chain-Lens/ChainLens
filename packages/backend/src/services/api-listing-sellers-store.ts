import type { Prisma, ApiListing } from "@prisma/client";
import { getAddress } from "viem";
import prisma from "../config/prisma.js";
import type {
  NormalizedSellerFilter,
  SellerListPage,
  SellerView,
  SellersStore,
} from "./sellers.service.js";

// Interim store aggregating SellerView from ApiListing while the on-chain
// SellerRegistry + event listener that populates SellerProfile is not yet
// implemented. Swap back to `prismaSellersStore` once SellerProfile is live.

export const apiListingSellersStore: SellersStore = {
  async list(filter): Promise<SellerListPage> {
    const addresses = await selectSellerAddresses(filter);
    const total = await countSellerAddresses(filter);

    if (addresses.length === 0) {
      return { items: [], total, limit: filter.limit, offset: filter.offset };
    }

    const listings = await prisma.apiListing.findMany({
      where: { sellerAddress: { in: addresses }, status: "APPROVED" },
      orderBy: { updatedAt: "desc" },
    });
    const payments = await paymentAggregates(addresses);
    const grouped = groupBySeller(listings);

    const items: SellerView[] = [];
    for (const address of addresses) {
      const sellerListings = grouped.get(address);
      if (!sellerListings || sellerListings.length === 0) continue;
      items.push(toSellerView(address, sellerListings, filter.taskType, payments.get(address)));
    }

    return { items, total, limit: filter.limit, offset: filter.offset };
  },
};

function listingFilter(filter: NormalizedSellerFilter): Prisma.ApiListingWhereInput {
  const where: Prisma.ApiListingWhereInput = { status: "APPROVED" };
  if (filter.taskType) where.category = filter.taskType;
  return where;
}

async function selectSellerAddresses(
  filter: NormalizedSellerFilter,
): Promise<string[]> {
  const groups = await prisma.apiListing.groupBy({
    by: ["sellerAddress"],
    where: listingFilter(filter),
    _max: { updatedAt: true },
    orderBy: { _max: { updatedAt: "desc" } },
    take: filter.limit,
    skip: filter.offset,
  });
  return groups.map((g) => g.sellerAddress);
}

async function countSellerAddresses(
  filter: NormalizedSellerFilter,
): Promise<number> {
  const groups = await prisma.apiListing.groupBy({
    by: ["sellerAddress"],
    where: listingFilter(filter),
  });
  return groups.length;
}

function groupBySeller(listings: ApiListing[]): Map<string, ApiListing[]> {
  const map = new Map<string, ApiListing[]>();
  for (const listing of listings) {
    const existing = map.get(listing.sellerAddress);
    if (existing) existing.push(listing);
    else map.set(listing.sellerAddress, [listing]);
  }
  return map;
}

interface PaymentAggregate {
  completed: number;
  failed: number;
  earnings: bigint;
}

async function paymentAggregates(
  addresses: string[],
): Promise<Map<string, PaymentAggregate>> {
  const payments = await prisma.paymentRequest.findMany({
    where: { seller: { in: addresses }, status: { in: ["COMPLETED", "FAILED"] } },
    select: { seller: true, status: true, amount: true },
  });
  const map = new Map<string, PaymentAggregate>();
  for (const payment of payments) {
    const agg = map.get(payment.seller) ?? { completed: 0, failed: 0, earnings: 0n };
    if (payment.status === "COMPLETED") {
      agg.completed += 1;
      try {
        agg.earnings += BigInt(payment.amount);
      } catch {
        // Non-numeric amount — skip rather than poison the aggregate.
      }
    } else if (payment.status === "FAILED") {
      agg.failed += 1;
    }
    map.set(payment.seller, agg);
  }
  return map;
}

function toSellerView(
  sellerAddress: string,
  listings: ApiListing[],
  taskType: string | undefined,
  payments: PaymentAggregate | undefined,
): SellerView {
  const primary =
    (taskType && listings.find((l) => l.category === taskType)) || listings[0];
  const capabilities = [...new Set(listings.map((l) => l.category))];
  const createdAt = listings.reduce(
    (min, l) => (l.createdAt < min ? l.createdAt : min),
    primary.createdAt,
  );
  const updatedAt = listings.reduce(
    (max, l) => (l.updatedAt > max ? l.updatedAt : max),
    primary.updatedAt,
  );
  return {
    sellerAddress: getAddress(sellerAddress as `0x${string}`),
    name: primary.name,
    endpointUrl: primary.endpoint,
    capabilities,
    pricePerCall: primary.price,
    metadataURI: null,
    status: "active",
    jobsCompleted: payments?.completed ?? 0,
    jobsFailed: payments?.failed ?? 0,
    totalEarnings: (payments?.earnings ?? 0n).toString(),
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}
