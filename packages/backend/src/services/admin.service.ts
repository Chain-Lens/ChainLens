import prisma from "../config/prisma.js";
import { BadRequestError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

export async function approve(apiId: string, adminAddress: string, reason?: string) {
  const api = await prisma.apiListing.findUnique({ where: { id: apiId } });
  if (!api) throw new BadRequestError("Listing not found");
  if (api.status !== "PENDING") {
    throw new BadRequestError(`Listing is ${api.status}, cannot approve`);
  }

  await prisma.apiListing.update({
    where: { id: apiId },
    data: { status: "APPROVED" },
  });

  await prisma.adminAction.create({
    data: {
      apiId,
      action: "APPROVE",
      adminAddress: adminAddress.toLowerCase(),
      reason,
    },
  });

  logger.info({ apiId }, "Listing approved");
  return { success: true };
}

export async function reject(apiId: string, adminAddress: string, reason?: string) {
  const api = await prisma.apiListing.findUnique({ where: { id: apiId } });
  if (!api) throw new BadRequestError("Listing not found");
  if (api.status !== "PENDING") {
    throw new BadRequestError(`Listing is ${api.status}, cannot reject`);
  }

  await prisma.apiListing.update({
    where: { id: apiId },
    data: { status: "REJECTED" },
  });

  await prisma.adminAction.create({
    data: {
      apiId,
      action: "REJECT",
      adminAddress: adminAddress.toLowerCase(),
      reason,
    },
  });

  logger.info({ apiId }, "Listing rejected");
}
