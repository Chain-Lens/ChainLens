import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as adminService from "../services/admin.service.js";
import { requireAdmin, type AuthenticatedRequest } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import prisma from "../config/prisma.js";
import { scanResponse } from "../services/injection-filter.service.js";
import { assertSafeOutboundUrl } from "../utils/network.js";
import {
  refundJob,
  setTaskTypeEnabled,
  isSellerRegisteredOnChain,
  getSellerInfo,
  getSellerStats,
} from "../services/on-chain.service.js";
import {
  clearTaskTypeListCache,
  taskTypeId as computeTaskTypeId,
} from "../services/task-type.service.js";
import { BadRequestError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

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
        const safeUrl = await assertSafeOutboundUrl(api.endpoint);

        const fetchOptions: RequestInit = {
          method,
          signal: AbortSignal.timeout(8000),
          redirect: "error",
        };

        if (method !== "GET" && method !== "HEAD") {
          fetchOptions.headers = { "Content-Type": "application/json" };
          fetchOptions.body = JSON.stringify(payload);
        }

        const response = await fetch(safeUrl, fetchOptions);
        status = response.status;
        const text = await response.text();
        try { body = JSON.parse(text); } catch { body = text; }

        const scan = scanResponse(body);
        if (!scan.clean) {
          error = scan.reason ?? "response_rejected";
        }
      } catch (err) {
        error = err instanceof Error ? err.message : "Request failed";
      }

      res.json({
        status,
        body,
        error,
        injectionFree: error === null,
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

// GET /admin/sellers
// Aggregates unique seller addresses from ApiListing and enriches each with
// on-chain SellerRegistry state (registered/active/stats). N+1 reads are fine
// at MVP scale; swap to multicall3 when the seller set grows.
router.get(
  "/sellers",
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const distinct = await prisma.apiListing.findMany({
        distinct: ["sellerAddress"],
        select: { sellerAddress: true },
      });
      const addresses = distinct.map((d) => d.sellerAddress as `0x${string}`);

      const items = await Promise.all(
        addresses.map(async (address) => {
          const listingCount = await prisma.apiListing.count({
            where: { sellerAddress: address },
          });
          let registered = false;
          let active = false;
          let name: string | null = null;
          let jobsCompleted = 0;
          let jobsFailed = 0;
          let earningsUsdcAtomic = "0";
          try {
            registered = await isSellerRegisteredOnChain(address);
            if (registered) {
              const info = await getSellerInfo(address);
              if (info) {
                active = info.active;
                name = info.name;
              }
              const stats = await getSellerStats(address);
              jobsCompleted = Number(stats.completed);
              jobsFailed = Number(stats.failed);
              earningsUsdcAtomic = stats.earnings.toString();
            }
          } catch (err) {
            // On-chain read failures shouldn't hide the seller from the list;
            // just show it as unregistered / missing stats.
            logger.warn(
              { err, address },
              "Admin seller enrichment read failed",
            );
          }
          return {
            address,
            listingCount,
            registered,
            active,
            name,
            jobsCompleted,
            jobsFailed,
            earningsUsdcAtomic,
          };
        }),
      );
      res.json({ items });
    } catch (err) {
      next(err);
    }
  },
);

const taskTypeToggleSchema = z.object({
  enabled: z.boolean(),
});

// POST /admin/task-types/:name/toggle
// Calls TaskTypeRegistry.setEnabled on-chain. Requires the backend wallet
// to be the contract owner (Ownable2Step). Clears the /api/task-types
// cache so the frontend dropdown reflects the change within seconds
// rather than after TTL expiry.
router.post(
  "/task-types/:name/toggle",
  validate(taskTypeToggleSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const name = req.params["name"] as string;
      const { enabled } = req.body as z.infer<typeof taskTypeToggleSchema>;
      const id = computeTaskTypeId(name);
      const hash = await setTaskTypeEnabled({ taskTypeId: id, enabled });
      clearTaskTypeListCache();
      logger.info(
        { taskType: name, enabled, hash, admin: req.adminAddress },
        "Admin toggled task type",
      );
      res.json({ taskType: name, enabled, txHash: hash });
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/jobs/:jobId/refund
// Escrow.refund() is onlyGateway, and the gateway wallet is this backend.
// Admin triggers via an authenticated REST call; we call refund on-chain.
// State transitions to REFUNDED will also flow through the PaymentRefunded
// event listener, so the DB write here is idempotent with that path.
//
// Works even when we have no DB row for this job — e.g. the listener
// dropped the JobCreated event (unique-constraint collision after an
// escrow redeploy) and the on-chain escrow still holds the buyer's
// funds. The contract's refund() itself reverts on completed/refunded,
// so we keep short-circuit guards only when a row exists; when absent
// we trust the on-chain state check.
router.post(
  "/jobs/:jobId/refund",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const jobId = req.params["jobId"] as string;
      if (!/^\d+$/.test(jobId)) {
        throw new BadRequestError("jobId must be a positive integer");
      }
      const onchainJobId = BigInt(jobId);
      const existing = await prisma.job.findFirst({
        where: { onchainJobId },
      });
      if (existing?.status === "REFUNDED") {
        throw new BadRequestError(`job ${jobId} is already refunded`);
      }
      if (existing?.status === "COMPLETED") {
        throw new BadRequestError(
          `job ${jobId} is completed, cannot refund`,
        );
      }

      const hash = await refundJob({ jobId: onchainJobId });
      logger.info(
        { jobId, hash, admin: req.adminAddress, orphan: !existing },
        existing
          ? "Admin-triggered refund submitted on-chain"
          : "Admin-triggered refund submitted on-chain for orphan job (no DB row)",
      );
      res.json({ jobId, txHash: hash, orphan: !existing });
    } catch (err) {
      next(err);
    }
  },
);

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
