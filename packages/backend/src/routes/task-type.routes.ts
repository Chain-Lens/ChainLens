import { Router, type Request, type Response, type NextFunction } from "express";
import { getAllTaskTypesWithConfig } from "../services/task-type.service.js";

const router = Router();

// GET /api/task-types - list all TaskTypeRegistry entries
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const enabledOnly = req.query.enabled_only !== "false";
    const items = await getAllTaskTypesWithConfig();
    const filtered = enabledOnly ? items.filter((i) => i.enabled) : items;
    res.json({ items: filtered });
  } catch (err) {
    next(err);
  }
});

export default router;
