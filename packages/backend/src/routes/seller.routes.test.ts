import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { requireSeller } from "../middleware/auth.js";
import { errorHandler } from "../middleware/error-handler.js";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { AppError, BadRequestError } from "../utils/errors.js";
import { env } from "../config/env.js";

// Reuse the real JWT secret the middleware was compiled against —
// overwriting process.env after the env module has already parsed is
// too late.
const SECRET = env.JWT_SECRET;

// Mirror the whitelist schema from seller.routes.ts. We test it
// standalone here so we don't drag in the prisma-bound service layer
// at test time.
const patchSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().min(1).max(2000).optional(),
    endpoint: z.string().url().optional(),
    exampleRequest: z.unknown().optional(),
    exampleResponse: z.unknown().optional(),
  })
  .strict();

function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  app.get(
    "/seller/listings",
    requireSeller,
    (req: express.Request & { sellerAddress?: string }, res) => {
      res.json({ address: req.sellerAddress });
    },
  );

  const EDITABLE = new Set([
    "name",
    "description",
    "endpoint",
    "exampleRequest",
    "exampleResponse",
  ]);
  function rejectNonEditable(
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) {
    if (!req.body || typeof req.body !== "object") return next();
    const rejected = Object.keys(req.body).filter((k) => !EDITABLE.has(k));
    if (rejected.length === 0) return next();
    next(
      new AppError(`Non-editable fields rejected: ${rejected.join(", ")}`, 400, "invalid_field"),
    );
  }

  app.patch(
    "/seller/listings/:id",
    requireSeller,
    rejectNonEditable,
    validate(patchSchema),
    (req: express.Request & { sellerAddress?: string }, res, next) => {
      try {
        if (Object.keys(req.body).length === 0) {
          throw new BadRequestError("No editable fields provided");
        }
        res.json({ id: req.params["id"], patch: req.body });
      } catch (err) {
        next(err);
      }
    },
  );

  app.use(errorHandler);
  return app;
}

function sellerToken(address: string) {
  return jwt.sign({ address, role: "seller" }, SECRET, {
    expiresIn: "1h",
  });
}

function adminToken(address: string) {
  // Same signing secret, different role — used to verify requireSeller
  // rejects cross-role tokens. An admin cookie value pasted into the
  // seller_token slot must not grant seller access.
  return jwt.sign({ address }, SECRET, { expiresIn: "1h" });
}

describe("seller routes auth + whitelist", () => {
  let server: Server;
  let base: string;

  before(async () => {
    server = buildTestApp().listen(0);
    await new Promise<void>((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  it("GET /seller/listings without cookie → 401", async () => {
    const res = await fetch(`${base}/seller/listings`);
    assert.equal(res.status, 401);
  });

  it("GET /seller/listings with seller JWT → 200 + lowercased address", async () => {
    const token = sellerToken("0xAbCDEf0000000000000000000000000000000001");
    const res = await fetch(`${base}/seller/listings`, {
      headers: { cookie: `seller_token=${token}` },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { address: string };
    assert.equal(body.address, "0xabcdef0000000000000000000000000000000001");
  });

  it("GET /seller/listings with admin-shaped JWT (no role=seller) → 401", async () => {
    const token = adminToken("0xAbCDEf0000000000000000000000000000000001");
    const res = await fetch(`${base}/seller/listings`, {
      headers: { cookie: `seller_token=${token}` },
    });
    assert.equal(res.status, 401);
  });

  it("PATCH rejects non-whitelisted fields (price, category) → 400 invalid_field with keys listed", async () => {
    const token = sellerToken("0xabcdef0000000000000000000000000000000001");
    const res = await fetch(`${base}/seller/listings/abc`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        cookie: `seller_token=${token}`,
      },
      body: JSON.stringify({ price: "1", category: "chat" }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as {
      error: { code: string; message: string };
    };
    assert.equal(body.error.code, "invalid_field");
    assert.match(body.error.message, /price/);
    assert.match(body.error.message, /category/);
  });

  it("PATCH accepts whitelisted fields and echoes them", async () => {
    const token = sellerToken("0xabcdef0000000000000000000000000000000001");
    const res = await fetch(`${base}/seller/listings/abc`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        cookie: `seller_token=${token}`,
      },
      body: JSON.stringify({
        endpoint: "https://example.com/api",
        description: "updated",
      }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { patch: Record<string, unknown> };
    assert.equal(body.patch["endpoint"], "https://example.com/api");
    assert.equal(body.patch["description"], "updated");
  });

  it("PATCH with empty body → 400", async () => {
    const token = sellerToken("0xabcdef0000000000000000000000000000000001");
    const res = await fetch(`${base}/seller/listings/abc`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        cookie: `seller_token=${token}`,
      },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  });
});
