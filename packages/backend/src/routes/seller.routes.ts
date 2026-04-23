import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as apiService from "../services/api.service.js";
import {
  requireSeller,
  type SellerAuthenticatedRequest,
} from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { AppError, BadRequestError } from "../utils/errors.js";
import { assertSafeOutboundUrl } from "../utils/network.js";
import { logger } from "../utils/logger.js";
import { scanResponse } from "../services/injection-filter.service.js";
import { validateResponseShape } from "../services/response-schema.service.js";

const EDITABLE_KEYS = new Set([
  "name",
  "description",
  "endpoint",
  "exampleRequest",
  "exampleResponse",
]);

// Pre-zod gate that returns `invalid_field` (not the generic
// VALIDATION_ERROR) with the rejected keys listed. This is what a
// client sees when they try to PATCH a locked field like `price`.
function rejectNonEditableKeys(req: Request, _res: Response, next: NextFunction) {
  if (!req.body || typeof req.body !== "object") return next();
  const rejected = Object.keys(req.body).filter(
    (k) => !EDITABLE_KEYS.has(k),
  );
  if (rejected.length === 0) return next();
  next(
    new AppError(
      `Non-editable fields rejected: ${rejected.join(", ")}`,
      400,
      "invalid_field",
    ),
  );
}

const router = Router();

const preflightSchema = z.object({
  endpoint: z.string().url(),
  method: z.enum(["GET", "POST"]).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  output_schema: z.record(z.string(), z.unknown()),
});

// POST /seller/preflight — registration-time self-test for a prospective
// listing. Public on purpose: sellers need this before they have a stored
// listing or seller-auth JWT. SSRF protections still apply via
// assertSafeOutboundUrl.
router.post(
  "/preflight",
  validate(preflightSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const startedAt = Date.now();
      const { endpoint, method = "GET", payload = {}, output_schema } =
        req.body as z.infer<typeof preflightSchema>;
      const safeUrl = await assertSafeOutboundUrl(endpoint);

      const fetchOptions: RequestInit = {
        method,
        signal: AbortSignal.timeout(8000),
        redirect: "error",
      };

      if (method === "POST") {
        fetchOptions.headers = { "Content-Type": "application/json" };
        fetchOptions.body = JSON.stringify(payload);
      } else if (Object.keys(payload).length > 0) {
        for (const [key, value] of Object.entries(payload)) {
          safeUrl.searchParams.set(key, String(value));
        }
      }

      let status: number | null = null;
      let body: unknown = null;
      let error: string | null = null;
      let schemaValid: boolean | null = null;
      let warnings: string[] = [];

      try {
        const response = await fetch(safeUrl, fetchOptions);
        status = response.status;
        const text = await response.text();
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }

        const scan = scanResponse(body);
        if (!scan.clean) {
          warnings.push(scan.reason ?? "response_rejected");
          error = scan.reason ?? "response_rejected";
        }

        const schemaCheck = validateResponseShape(body, {
          endpoint,
          method,
          output_schema,
        });
        schemaValid = schemaCheck.applicable ? schemaCheck.valid : null;
        if (schemaCheck.applicable && !schemaCheck.valid) {
          warnings.push(
            `schema_validation_failed: ${schemaCheck.reason ?? "unknown"}`,
          );
          error =
            error ??
            `schema_validation_failed: ${schemaCheck.reason ?? "unknown"}`;
        }
      } catch (err) {
        error = err instanceof Error ? err.message : "Request failed";
      }

      res.json({
        status,
        body,
        error,
        latencyMs: Date.now() - startedAt,
        safety: {
          scanned: true,
          schemaValid,
          warnings,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

router.use(requireSeller);

// GET /seller/listings — seller's own listings with `endpoint` included.
// sellerAddress is taken from JWT, never from the request body/query.
router.get(
  "/listings",
  async (req: SellerAuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const apis = await apiService.listBySellerWithEndpoint(req.sellerAddress!);
      res.json(apis);
    } catch (err) {
      next(err);
    }
  },
);

// Whitelist of fields a seller can self-edit. Price/category/taskType
// are locked by design (see BACKLOG v0.1.1 #6) — buyers price-shop off
// listing state and category determines on-chain task routing, so post-
// approval edits to either would break existing jobs. `.strict()` turns
// any field outside the whitelist (e.g. `price`) into a 400 instead of
// a silent no-op.
const patchSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().min(1).max(2000).optional(),
    endpoint: z.string().url().optional(),
    exampleRequest: z.unknown().optional(),
    exampleResponse: z.unknown().optional(),
  })
  .strict();

// PATCH /seller/listings/:id — partial update. Returns the listing
// whether or not anything actually changed (the service returns
// `changed: false` for a no-op body, which we swallow here — the
// route surface stays simple).
router.patch(
  "/listings/:id",
  rejectNonEditableKeys,
  validate(patchSchema),
  async (req: SellerAuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.params["id"] as string;
      const patch = req.body as z.infer<typeof patchSchema>;

      if (Object.keys(patch).length === 0) {
        throw new BadRequestError("No editable fields provided");
      }

      if (patch.endpoint) {
        await assertSafeOutboundUrl(patch.endpoint);
      }

      const updated = await apiService.updateByOwner(
        id,
        req.sellerAddress!,
        patch,
      );

      if (updated.changed) {
        logger.info(
          { apiId: id, seller: req.sellerAddress, fields: Object.keys(patch) },
          "Seller self-edited listing",
        );
      }

      const { changed: _changed, ...listing } = updated;
      res.json(listing);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /seller/listings/:id — owner-scoped delete.
router.delete(
  "/listings/:id",
  async (req: SellerAuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await apiService.deleteApi(
        req.params["id"] as string,
        req.sellerAddress!,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
