import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { listSellers } from "../services/sellers.service.js";
import { prismaSellersStore } from "../services/sellers-store.js";

const router = Router();

const querySchema = z.object({
  task_type: z.string().min(1).max(128).optional(),
  active_only: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  limit: z.coerce.number().int().optional(),
  offset: z.coerce.number().int().optional(),
});

// GET /api/sellers
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "invalid_query", details: parsed.error.flatten() });
      return;
    }
    const page = await listSellers(
      {
        taskType: parsed.data.task_type,
        activeOnly: parsed.data.active_only,
        limit: parsed.data.limit,
        offset: parsed.data.offset,
      },
      prismaSellersStore,
    );
    res.json(page);
  } catch (err) {
    next(err);
  }
});

export default router;
