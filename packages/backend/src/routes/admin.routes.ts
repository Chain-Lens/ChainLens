import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as adminService from "../services/admin.service.js";
import { requireAdmin, type AuthenticatedRequest } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import prisma from "../config/prisma.js";

const router = Router();

router.use(requireAdmin);

const testApiSchema = z.object({
  payload: z.record(z.string(), z.unknown()).optional(),
  method: z.string().trim().min(1).optional(),
});

// GET /admin/apis - All APIs with call counts
router.get(
  "/apis",
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const apis = await prisma.apiListing.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          category: true,
          status: true,
          price: true,
          sellerAddress: true,
          createdAt: true,
          _count: { select: { payments: { where: { status: "COMPLETED" } } } },
        },
      });
      res.json(apis);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /admin/apis/:id - Admin force-delete any API
router.delete(
  "/apis/:id",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      await prisma.apiListing.delete({ where: { id: req.params["id"] as string } });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
);

// POST /admin/apis/:id/test - Test seller endpoint
router.post(
  "/apis/:id/test",
  validate(testApiSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const api = await (await import("../services/api.service.js")).getById(
        req.params["id"] as string
      );

      const startedAt = Date.now();
      let status: number | null = null;
      let body: unknown = null;
      let error: string | null = null;

      try {
        const { payload: requestPayload, method: requestMethod } =
          req.body as z.infer<typeof testApiSchema>;
        const payload = requestPayload ?? api.exampleRequest ?? {};
        const hasBody = Object.keys(payload as object).length > 0;
        const method = requestMethod?.toUpperCase() || (hasBody ? "POST" : "GET");

        const fetchOptions: RequestInit = {
          method,
          signal: AbortSignal.timeout(8000),
        };

        if (method !== "GET" && method !== "HEAD") {
          fetchOptions.headers = { "Content-Type": "application/json" };
          fetchOptions.body = JSON.stringify(payload);
        }

        const response = await fetch(api.endpoint, fetchOptions);
        status = response.status;
        const text = await response.text();
        try { body = JSON.parse(text); } catch { body = text; }
      } catch (err) {
        error = err instanceof Error ? err.message : "Request failed";
      }

      res.json({
        status,
        body,
        error,
        latencyMs: Date.now() - startedAt,
      });
    } catch (err) {
      next(err);
    }
  }
);

const approveSchema = z.object({
  reason: z.string().optional(),
});

// POST /admin/apis/:id/approve
router.post(
  "/apis/:id/approve",
  validate(approveSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await adminService.approve(
        req.params.id as string,
        req.adminAddress!,
        req.body.reason
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

const rejectSchema = z.object({
  reason: z.string().optional(),
});

// POST /admin/apis/:id/reject
router.post(
  "/apis/:id/reject",
  validate(rejectSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      await adminService.reject(
        req.params.id as string,
        req.adminAddress!,
        req.body.reason
      );
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
