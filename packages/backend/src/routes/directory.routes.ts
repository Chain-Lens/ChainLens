import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { requireSeller, type SellerAuthenticatedRequest } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { BadRequestError, ForbiddenError } from "../utils/errors.js";
import * as providerDraftService from "../services/provider-draft.service.js";

const router = Router();

const providerSlugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);

const draftSchema = z
  .object({
    providerSlug: providerSlugSchema,
    name: z.string().min(1).max(200),
    description: z.string().min(1).max(2000),
    category: z.string().min(1).max(80).default("general"),
    website: z.string().url(),
    docs: z.string().url().optional(),
    sourceAttestation: z.string().url(),
    directoryMetadata: z.record(z.string(), z.unknown()).optional(),
    directoryVerified: z.boolean().optional(),
    sourceRepoUrl: z.string().url().optional(),
    sourcePrUrl: z.string().url().optional(),
    sourceCommit: z.string().min(7).max(80).optional(),
    reviewedAt: z.coerce.date().optional(),
    lastSyncedAt: z.coerce.date().optional(),
  })
  .strict();

const listingPatchSchema = z
  .object({
    listingUrl: z.string().url().optional(),
    listingOnChainId: z.number().int().nonnegative().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one listing field is required",
  });

function requireDirectoryIngestToken(req: Request, _res: Response, next: NextFunction) {
  if (!env.DIRECTORY_INGEST_TOKEN) {
    return next();
  }

  const token = req.header("x-chainlens-directory-token");
  if (token !== env.DIRECTORY_INGEST_TOKEN) {
    return next(new ForbiddenError("Invalid directory ingest token"));
  }

  next();
}

function providerSlugFromParams(req: Request) {
  const slug = req.params["providerSlug"];
  const parsed = providerSlugSchema.safeParse(slug);

  if (!parsed.success) {
    throw new BadRequestError("Invalid provider slug");
  }

  return parsed.data;
}

router.post(
  "/drafts",
  requireDirectoryIngestToken,
  validate(draftSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const draft = await providerDraftService.upsertDirectoryDraft(req.body);
      res.status(201).json(draft);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/drafts/mine",
  requireSeller,
  async (req: SellerAuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const drafts = await providerDraftService.listDraftsBySeller(req.sellerAddress!);
      res.json(drafts);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/drafts/:providerSlug",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const draft = await providerDraftService.getDirectoryDraft(providerSlugFromParams(req));
      res.json(draft);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/drafts/:providerSlug/claim",
  requireSeller,
  async (req: SellerAuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const draft = await providerDraftService.claimDirectoryDraft(
        providerSlugFromParams(req),
        req.sellerAddress!,
      );
      res.json(draft);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  "/drafts/:providerSlug/listing",
  requireSeller,
  validate(listingPatchSchema),
  async (req: SellerAuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const draft = await providerDraftService.updateClaimedDraftListing(
        providerSlugFromParams(req),
        req.sellerAddress!,
        req.body,
      );
      res.json(draft);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
