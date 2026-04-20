import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { executeJob } from "../services/job-execution.service.js";

const router = Router();

const bodySchema = z.object({
  jobId: z.string().regex(/^\d+$/),
  seller: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  taskType: z.string().min(1).max(128),
  inputs: z.record(z.string(), z.unknown()),
  amount: z.string().regex(/^\d+$/),
  apiId: z.string().regex(/^\d+$/).optional(),
});

router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
      return;
    }

    const { jobId, seller, taskType, inputs, amount, apiId } = parsed.data;
    const result = await executeJob({
      jobId: BigInt(jobId),
      seller: seller as `0x${string}`,
      taskType,
      inputs,
      amount: BigInt(amount),
      apiId: apiId ? BigInt(apiId) : undefined,
    });
    res.status(202).json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
