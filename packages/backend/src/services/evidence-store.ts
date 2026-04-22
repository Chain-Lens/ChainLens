import type { Prisma } from "@prisma/client";
import prisma from "../config/prisma.js";
import type { EvidenceStore } from "./evidence.service.js";

/**
 * Prisma-backed implementation of EvidenceStore. Kept in its own module so
 * unit tests can import evidence.service.ts without pulling the Prisma
 * runtime (and therefore without requiring DATABASE_URL).
 */
export const prismaEvidenceStore: EvidenceStore = {
  async create(data) {
    await prisma.job.create({
      data: {
        onchainJobId: data.onchainJobId,
        escrowAddress: data.escrowAddress.toLowerCase(),
        buyer: data.buyer.toLowerCase(),
        seller: data.seller.toLowerCase(),
        apiId: data.apiId,
        taskType: data.taskType ?? null,
        amount: data.amount as Prisma.Decimal | string | number,
        inputs: (data.inputs ?? null) as Prisma.InputJsonValue,
        inputsHash: data.inputsHash,
        evidenceURI: data.evidenceURI,
        status: data.status ?? "PAID",
      },
    });
  },
  // `update` lost its bare unique-by-onchainJobId after we switched to
  // a compound (escrowAddress, onchainJobId) unique, so writes here use
  // updateMany. The compound unique still guarantees at most one match,
  // just with looser Prisma typing. Note we scope to current escrow
  // only — stale rows from a prior escrow redeploy stay untouched.
  async complete(onchainJobId, patch) {
    await prisma.job.updateMany({
      where: { onchainJobId },
      data: {
        status: patch.status,
        ...(patch.response !== undefined
          ? { response: (patch.response ?? null) as Prisma.InputJsonValue }
          : {}),
        ...(patch.responseHash !== undefined
          ? { responseHash: patch.responseHash ?? null }
          : {}),
        ...(patch.errorReason !== undefined
          ? { errorReason: patch.errorReason ?? null }
          : {}),
        completedAt: new Date(),
      },
    });
  },
  async findByOnchainId(onchainJobId) {
    const row = await prisma.job.findFirst({ where: { onchainJobId } });
    if (!row) return null;
    return {
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
    };
  },
};
