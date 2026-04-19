import type { Prisma } from "@prisma/client";
import prisma from "../config/prisma.js";
import type { EvidenceView } from "./evidence.service.js";
import type { JobsStore, NormalizedJobFilter } from "./jobs.service.js";

function whereFrom(filter: NormalizedJobFilter): Prisma.JobWhereInput {
  const where: Prisma.JobWhereInput = {};
  if (filter.buyer) where.buyer = filter.buyer;
  if (filter.seller) where.seller = filter.seller;
  if (filter.taskType) where.taskType = filter.taskType;
  if (filter.status) where.status = filter.status;
  return where;
}

export const prismaJobsStore: JobsStore = {
  async list(filter) {
    const where = whereFrom(filter);
    const [rows, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: filter.limit,
        skip: filter.offset,
      }),
      prisma.job.count({ where }),
    ]);
    const items: EvidenceView[] = rows.map((row) => ({
      onchainJobId: row.onchainJobId.toString(),
      buyer: row.buyer,
      seller: row.seller,
      apiId: row.apiId.toString(),
      taskType: row.taskType,
      amount: row.amount.toString(),
      inputs: row.inputs,
      inputsHash: row.inputsHash,
      response: row.response,
      responseHash: row.responseHash,
      evidenceURI: row.evidenceURI,
      status: row.status,
      errorReason: row.errorReason,
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
    }));
    return { items, limit: filter.limit, offset: filter.offset, total };
  },
};
