import { Prisma } from "@prisma/client";
import prisma from "../config/prisma.js";
import { ConflictError, NotFoundError } from "../utils/errors.js";

export type ProviderDraftInput = {
  providerSlug: string;
  name: string;
  description: string;
  category: string;
  website: string;
  docs?: string;
  sourceAttestation: string;
  directoryMetadata?: Prisma.InputJsonValue;
  directoryVerified?: boolean;
  sourceRepoUrl?: string;
  sourcePrUrl?: string;
  sourceCommit?: string;
  reviewedAt?: Date;
  lastSyncedAt?: Date;
};

export type ProviderDraftListingPatch = {
  listingUrl?: string;
  listingOnChainId?: number;
};

function normalizeAddress(address: string) {
  return address.toLowerCase();
}

function metadataForDraft(input: ProviderDraftInput): Prisma.InputJsonValue {
  return (
    input.directoryMetadata ?? {
      slug: input.providerSlug,
      name: input.name,
      description: input.description,
      category: input.category,
      website: input.website,
      docs: input.docs ?? null,
      source_attestation: input.sourceAttestation,
    }
  );
}

export async function upsertDirectoryDraft(input: ProviderDraftInput) {
  const directoryMetadata = metadataForDraft(input);
  const provenance = {
    directoryVerified: input.directoryVerified ?? true,
    sourceRepoUrl: input.sourceRepoUrl,
    sourcePrUrl: input.sourcePrUrl,
    sourceCommit: input.sourceCommit,
    reviewedAt: input.reviewedAt,
    lastSyncedAt: input.lastSyncedAt ?? new Date(),
  };

  return prisma.providerDraft.upsert({
    where: { providerSlug: input.providerSlug },
    create: {
      providerSlug: input.providerSlug,
      name: input.name,
      description: input.description,
      category: input.category,
      website: input.website,
      docs: input.docs,
      sourceAttestation: input.sourceAttestation,
      directoryMetadata,
      ...provenance,
    },
    update: {
      name: input.name,
      description: input.description,
      category: input.category,
      website: input.website,
      docs: input.docs,
      sourceAttestation: input.sourceAttestation,
      directoryMetadata,
      ...provenance,
    },
  });
}

export async function getDirectoryDraft(providerSlug: string) {
  const draft = await prisma.providerDraft.findUnique({
    where: { providerSlug },
  });

  if (!draft) {
    throw new NotFoundError("Provider draft not found");
  }

  return draft;
}

export async function claimDirectoryDraft(providerSlug: string, sellerAddress: string) {
  const draft = await getDirectoryDraft(providerSlug);
  const claimedBy = draft.claimedBy ? normalizeAddress(draft.claimedBy) : null;
  const seller = normalizeAddress(sellerAddress);

  if (claimedBy && claimedBy !== seller) {
    throw new ConflictError("Provider draft is already claimed by another seller");
  }

  return prisma.providerDraft.update({
    where: { providerSlug },
    data: {
      claimedBy: seller,
      claimedAt: draft.claimedAt ?? new Date(),
      status: draft.status === "LISTED" ? "LISTED" : "CLAIMED",
    },
  });
}

export async function updateClaimedDraftListing(
  providerSlug: string,
  sellerAddress: string,
  patch: ProviderDraftListingPatch,
) {
  const draft = await getDirectoryDraft(providerSlug);
  const seller = normalizeAddress(sellerAddress);

  if (!draft.claimedBy || normalizeAddress(draft.claimedBy) !== seller) {
    throw new ConflictError("Provider draft must be claimed by this seller first");
  }

  return prisma.providerDraft.update({
    where: { providerSlug },
    data: {
      ...patch,
      status: "LISTED",
    },
  });
}

export async function listDraftsBySeller(sellerAddress: string) {
  return prisma.providerDraft.findMany({
    where: { claimedBy: normalizeAddress(sellerAddress) },
    orderBy: { updatedAt: "desc" },
  });
}
