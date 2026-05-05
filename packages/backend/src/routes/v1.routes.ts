/**
 * SDK-friendly v1 API adapter routes.
 *
 * These routes present the same backend logic as /api/market/... but with
 * a stable, SDK-oriented request/response shape. The underlying services
 * are shared with the legacy API to keep a single execution path.
 *
 * Mounted at /v1 in app.ts (NOT under /api — intentional flat namespace).
 */

import { Router, Request, Response, NextFunction } from "express";
import {
  listingCallService,
  listingDetailService,
  listingsSearchService,
} from "./market.routes.js";
import { parsePayment, type PaymentAuth } from "../utils/payment.js";
import { resolveListingRuntimeConfig } from "../services/market-chain.service.js";
import type { CallResult } from "../services/listing-call.service.js";
import { scoreListing } from "../services/call-log.service.js";

function atomicToUsdc(atomic: string | null | undefined): number {
  if (!atomic) return 0;
  return Number(BigInt(atomic)) / 1_000_000;
}

const router = Router();

// ──────────────────────────────────────────────────────────────────────
// GET /v1/listings/:id — SDK listing detail
// ──────────────────────────────────────────────────────────────────────
// Returns a flat, SDK-friendly shape from the same ListingDetailService.

router.get("/listings/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = BigInt(req.params["id"] as string);
    const detail = await listingDetailService.getDetail(id);

    const runtime =
      detail.metadata ? resolveListingRuntimeConfig(detail.metadata) : null;

    res.json({
      listingId: Number(detail.listingId),
      name: detail.metadata?.name ?? null,
      description: detail.metadata?.description ?? null,
      endpoint: detail.metadata?.endpoint ?? null,
      method: detail.metadata?.method ?? "GET",
      priceAtomic: runtime?.priceAtomic ?? null,
      maxLatencyMs: runtime?.maxLatencyMs ?? 5000,
      taskCategory: runtime?.taskCategory ?? "general",
      outputSchema: runtime?.outputSchema ?? null,
      payout: detail.payout,
      owner: detail.owner,
      active: detail.active,
      adminStatus: detail.adminStatus,
      stats: detail.stats,
    });
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────────────────────────────
// POST /v1/call — SDK pay-and-call
// ──────────────────────────────────────────────────────────────────────
// Accepts SDK EIP-3009 auth shape and returns ok/failure response.

router.post("/call", async (req: Request, res: Response, next: NextFunction) => {
  const body = req.body as {
    listingId?: unknown;
    params?: unknown;
    auth?: unknown;
  };

  const rawId = body.listingId;
  if (typeof rawId !== "number" && typeof rawId !== "string") {
    res.status(400).json({ ok: false, error: "listingId required" });
    return;
  }
  const listingIdStr = String(rawId);

  let payment: PaymentAuth;
  try {
    payment = parsePayment(body.auth);
  } catch (e) {
    res.status(400).json({
      ok: false,
      error: "invalid auth",
      detail: e instanceof Error ? e.message : String(e),
    });
    return;
  }

  try {
    const result = await listingCallService.execute({
      listingIdStr,
      inputs: body.params ?? {},
      payment,
    });
    sendV1CallResult(res, result);
  } catch (err) {
    next(err);
  }
});

/** Map the service result union to the SDK wire format. */
function sendV1CallResult(res: Response, result: CallResult): void {
  switch (result.kind) {
    case "ok":
      res.status(200).json({
        ok: true,
        response: result.ok.body,
        settlement: {
          txHash: result.ok.settleTxHash,
          blockNumber: 0,
        },
        amount: null,
        fee: null,
        net: null,
        jobRef: result.ok.jobRef,
      });
      return;

    case "schema_mismatch":
      res.status(200).json({
        ok: false,
        failure: {
          kind: "schema_mismatch",
          hint: result.reason,
          host: result.host,
        },
      });
      return;

    case "seller_call_failed":
      res.status(200).json({
        ok: false,
        failure: {
          kind: result.reason === "timeout" ? "timeout" : "gateway_error",
          hint: result.detail,
          endpoint: result.endpoint,
        },
      });
      return;

    case "seller_non_2xx":
      res.status(200).json({
        ok: false,
        failure: {
          kind: result.status >= 500 ? "http_5xx" : result.status === 429 ? "rate_limit"
            : result.status === 401 || result.status === 403 ? "auth" : "http_4xx",
          hint: `seller returned HTTP ${result.status}`,
          providerStatus: result.status,
        },
      });
      return;

    case "response_rejected":
      res.status(200).json({
        ok: false,
        failure: {
          kind: "gateway_error",
          hint: result.rejectionReason,
          host: result.host,
        },
      });
      return;

    case "bad_listing_id":
      res.status(400).json({ ok: false, error: "listingId must be a decimal integer" });
      return;

    case "listing_not_found":
      res.status(404).json({ ok: false, error: "listing not found" });
      return;

    case "listing_inactive":
      res.status(410).json({ ok: false, error: "listing inactive" });
      return;

    case "not_approved":
      res.status(403).json({ ok: false, error: "listing not approved", adminStatus: result.adminStatus });
      return;

    case "amount_below_price":
      res.status(402).json({
        ok: false,
        failure: {
          kind: "gateway_error",
          hint: `amount ${result.provided} below listing price ${result.required}`,
        },
      });
      return;

    case "payment_preflight_failed":
      res.status(200).json({
        ok: false,
        failure: { kind: "auth", hint: result.detail },
      });
      return;

    case "metadata_error":
    case "metadata_invalid":
    case "settle_failed":
      res.status(200).json({
        ok: false,
        failure: { kind: "gateway_error", hint: result.kind },
      });
      return;
  }
}

// ──────────────────────────────────────────────────────────────────────
// POST /v1/recommend — task-aware listing recommendations
// ──────────────────────────────────────────────────────────────────────
// Ranking weights: 0.40 relevance, 0.30 success_rate_adj,
//                  0.15 latency_score, 0.15 cost_score.

router.post("/recommend", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as { task?: unknown; maxResults?: unknown };
    const task = typeof body.task === "string" ? body.task.toLowerCase() : "";
    const maxResults = typeof body.maxResults === "number" ? Math.min(body.maxResults, 20) : 5;

    const result = await listingsSearchService.search({
      sort: "score",
      limit: 100,
    });

    const scored = result.items.map((item) => {
      const meta = item.metadata;
      const runtime = resolveListingRuntimeConfig(meta);
      const stats = item.stats;

      // Relevance: keyword overlap between task and listing text fields
      const textBlob = [
        meta.name ?? "",
        meta.description ?? "",
        runtime.taskCategory,
        ...(meta.tags ?? []),
      ]
        .join(" ")
        .toLowerCase();
      const taskWords = task.split(/\s+/).filter(Boolean);
      const matchCount = taskWords.filter((w) => textBlob.includes(w)).length;
      const relevance = taskWords.length > 0 ? matchCount / taskWords.length : 0.5;

      // Success rate (Thompson sampling draw)
      const successRateAdj = scoreListing(stats);

      // Latency score: invert normalized latency (lower = better)
      const p50 = stats.avgLatencyMs;
      const latencyScore = p50 > 0 ? Math.max(0, 1 - p50 / 10_000) : 0.5;

      // Cost score: invert normalized price (cheaper = better), cap at $1 USDC
      const priceUsdc = atomicToUsdc(runtime.priceAtomic);
      const costScore = priceUsdc > 0 ? Math.max(0, 1 - priceUsdc) : 1.0;

      const composite =
        0.4 * relevance + 0.3 * successRateAdj + 0.15 * latencyScore + 0.15 * costScore;

      return {
        listingId: Number(item.listingId),
        name: meta.name ?? null,
        score: composite,
        stats: {
          successRate: stats.successRate,
          p50LatencyMs: stats.avgLatencyMs,
          p95LatencyMs: stats.avgLatencyMs,
          avgCostUsdc: priceUsdc,
          sampleSize: stats.totalCalls,
        },
      };
    });

    scored.sort((a, b) => b.score - a.score);

    res.json({ listings: scored.slice(0, maxResults) });
  } catch (err) {
    next(err);
  }
});

export default router;
