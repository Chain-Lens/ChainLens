import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { JobStatus } from "@prisma/client";
import { listJobs } from "../services/jobs.service.js";
import { prismaJobsStore } from "../services/jobs-store.js";

const router = Router();

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

const querySchema = z.object({
  buyer: z.string().regex(ADDRESS_RE).optional(),
  seller: z.string().regex(ADDRESS_RE).optional(),
  taskType: z.string().min(1).max(128).optional(),
  status: z.nativeEnum(JobStatus).optional(),
  limit: z.coerce.number().int().optional(),
  offset: z.coerce.number().int().optional(),
});

// GET /api/jobs
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_query", details: parsed.error.flatten() });
      return;
    }
    const page = await listJobs(parsed.data, prismaJobsStore);
    res.json(page);
  } catch (err) {
    next(err);
  }
});

export default router;
