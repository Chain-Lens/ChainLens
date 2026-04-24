import prisma from "../config/prisma.js";
import { ApiStatus } from "@chain-lens/shared";
import { ForbiddenError, NotFoundError } from "../utils/errors.js";

export const SELLER_EDITABLE_FIELDS = [
  "name",
  "description",
  "endpoint",
  "exampleRequest",
  "exampleResponse",
] as const;
export type SellerEditableField = (typeof SELLER_EDITABLE_FIELDS)[number];

export const APIS_DEFAULT_LIMIT = 20;
export const APIS_MAX_LIMIT = 100;

export interface ListApprovedFilters {
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ListApprovedPage<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

function normalizeListFilters(filters: ListApprovedFilters) {
  const limit = Math.min(
    Math.max(Math.floor(filters.limit ?? APIS_DEFAULT_LIMIT), 1),
    APIS_MAX_LIMIT,
  );
  const offset = Math.max(Math.floor(filters.offset ?? 0), 0);
  return { limit, offset };
}

export async function listApproved(filters: ListApprovedFilters = {}) {
  const where: Record<string, unknown> = { status: ApiStatus.APPROVED };

  if (filters.category) {
    where.category = filters.category;
  }

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { description: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  const { limit, offset } = normalizeListFilters(filters);

  const [items, total] = await Promise.all([
    prisma.apiListing.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        onChainId: true,
        name: true,
        description: true,
        price: true,
        category: true,
        sellerAddress: true,
        status: true,
        exampleRequest: true,
        exampleResponse: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.apiListing.count({ where }),
  ]);

  return { items, total, limit, offset };
}

export async function listByStatus(status: ApiStatus) {
  return prisma.apiListing.findMany({
    where: { status },
    orderBy: { createdAt: "desc" },
  });
}

export async function getById(id: string) {
  const api = await prisma.apiListing.findUnique({ where: { id } });
  if (!api) throw new NotFoundError("API not found");
  return api;
}

export async function register(data: {
  name: string;
  description: string;
  endpoint: string;
  price: string;
  sellerAddress: string;
  category?: string;
  exampleRequest?: unknown;
  exampleResponse?: unknown;
}) {
  return prisma.apiListing.create({
    data: {
      name: data.name,
      description: data.description,
      endpoint: data.endpoint,
      price: data.price,
      sellerAddress: data.sellerAddress.toLowerCase(),
      category: data.category || "general",
      exampleRequest: data.exampleRequest as never,
      exampleResponse: data.exampleResponse as never,
    },
  });
}

export async function listBySeller(sellerAddress: string) {
  const apis = await prisma.apiListing.findMany({
    where: {
      sellerAddress: sellerAddress.toLowerCase(),
      contractVersion: "V3",
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      onChainId: true,
      name: true,
      description: true,
      price: true,
      category: true,
      sellerAddress: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { payments: { where: { status: "COMPLETED" } } } },
      adminActions: {
        where: { action: "REJECT" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { reason: true },
      },
    },
  });

  return apis.map(({ adminActions, ...api }) => ({
    ...api,
    rejectionReason: adminActions[0]?.reason ?? null,
  }));
}

export async function deleteApi(id: string, sellerAddress: string) {
  const api = await prisma.apiListing.findUnique({ where: { id } });
  if (!api) throw new NotFoundError("API not found");
  if (api.sellerAddress.toLowerCase() !== sellerAddress.toLowerCase()) {
    throw new NotFoundError("API not found");
  }
  await prisma.adminAction.deleteMany({ where: { apiId: id } });
  await prisma.paymentRequest.deleteMany({ where: { apiId: id } });
  await prisma.apiListing.delete({ where: { id } });
  return { success: true };
}

export async function getNextOnChainId(): Promise<number> {
  const max = await prisma.apiListing.aggregate({
    _max: { onChainId: true },
  });
  return (max._max.onChainId ?? 0) + 1;
}

export async function updateStatus(
  id: string,
  status: ApiStatus,
  onChainId?: number
) {
  return prisma.apiListing.update({
    where: { id },
    data: { status, ...(onChainId !== undefined ? { onChainId } : {}) },
  });
}

// Same shape as listBySeller, but includes `endpoint` — gated by
// seller auth in the route layer, never exposed on public /apis.
export async function listBySellerWithEndpoint(sellerAddress: string) {
  const apis = await prisma.apiListing.findMany({
    where: {
      sellerAddress: sellerAddress.toLowerCase(),
      contractVersion: "V3",
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      onChainId: true,
      name: true,
      description: true,
      endpoint: true,
      price: true,
      category: true,
      sellerAddress: true,
      status: true,
      exampleRequest: true,
      exampleResponse: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { payments: { where: { status: "COMPLETED" } } } },
      adminActions: {
        where: { action: "REJECT" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { reason: true },
      },
    },
  });

  return apis.map((row) => {
    const { adminActions, ...api } = row;
    return { ...api, rejectionReason: adminActions[0]?.reason ?? null };
  });
}

export interface SellerUpdateInput {
  name?: string;
  description?: string;
  endpoint?: string;
  exampleRequest?: unknown;
  exampleResponse?: unknown;
}

// Owner-scoped partial update. Whitelisting happens at the route layer
// (the zod schema is the single source of truth for which fields are
// editable); this function trusts its caller on field set but still
// enforces ownership. Writes an AdminAction row with the diff so audits
// can trace seller-initiated changes on APPROVED listings.
export async function updateByOwner(
  id: string,
  sellerAddress: string,
  patch: SellerUpdateInput
) {
  const existing = await prisma.apiListing.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("API not found");
  if (existing.sellerAddress.toLowerCase() !== sellerAddress.toLowerCase()) {
    throw new ForbiddenError("Not the listing owner");
  }

  const diff: Record<string, { from: unknown; to: unknown }> = {};
  const data: Record<string, unknown> = {};
  for (const [key, next] of Object.entries(patch)) {
    if (next === undefined) continue;
    const prev = (existing as Record<string, unknown>)[key];
    if (JSON.stringify(prev) === JSON.stringify(next)) continue;
    data[key] = next;
    diff[key] = { from: prev ?? null, to: next ?? null };
  }

  if (Object.keys(data).length === 0) {
    return {
      ...existing,
      rejectionReason: null as string | null,
      changed: false as const,
    };
  }

  const [updated] = await prisma.$transaction([
    prisma.apiListing.update({
      where: { id },
      data,
    }),
    prisma.adminAction.create({
      data: {
        apiId: id,
        action: "SELF_EDIT",
        adminAddress: sellerAddress.toLowerCase(),
        reason: JSON.stringify(diff),
      },
    }),
  ]);

  return { ...updated, rejectionReason: null as string | null, changed: true as const };
}
