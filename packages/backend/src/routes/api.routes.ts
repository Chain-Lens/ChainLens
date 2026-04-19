import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as apiService from "../services/api.service.js";
import { validate } from "../middleware/validate.js";
import { ApiStatus } from "@chain-lens/shared";
import { BadRequestError } from "../utils/errors.js";
import { assertSafeOutboundUrl } from "../utils/network.js";

const router = Router();

// GET /apis - List approved APIs (public)
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const category = req.query.category as string | undefined;
    const search = req.query.search as string | undefined;
    const status = req.query.status as string | undefined;

    if (status && status !== ApiStatus.APPROVED) {
      throw new BadRequestError("Only approved APIs are publicly listable");
    }

    const apis = await apiService.listApproved({ category, search });
    res.json(apis);
  } catch (err) {
    next(err);
  }
});

// GET /apis/:id - Get API detail
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const api = await apiService.getById(req.params.id as string);
    // Don't expose endpoint to public
    const { endpoint, ...publicApi } = api;
    res.json(publicApi);
  } catch (err) {
    next(err);
  }
});

const registerSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  endpoint: z.string().url(),
  price: z.string().regex(/^\d+$/, "Price must be a positive integer in wei"),
  sellerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  category: z.string().optional(),
  exampleRequest: z.unknown().optional(),
  exampleResponse: z.unknown().optional(),
});

const deleteSchema = z.object({
  sellerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

// GET /apis/seller/:address - List APIs by seller address
router.get(
  "/seller/:address",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const address = req.params.address as string;
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        res.status(400).json({ error: { message: "Invalid address" } });
        return;
      }
      const apis = await apiService.listBySeller(address);
      res.json(apis);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /apis/:id - Delete API (seller only, approved or rejected)
router.delete(
  "/:id",
  validate(deleteSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sellerAddress } = req.body as z.infer<typeof deleteSchema>;
      const result = await apiService.deleteApi(req.params.id as string, sellerAddress);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// POST /apis/register - Register new API (seller)
router.post(
  "/register",
  validate(registerSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await assertSafeOutboundUrl(req.body.endpoint);
      const api = await apiService.register(req.body as z.infer<typeof registerSchema>);
      res.status(201).json(api);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
