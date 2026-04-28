import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import cookieParser from "cookie-parser";
import express from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env, adminAddresses } from "../config/env.js";
import { requireAdmin, requireSeller } from "./auth.js";
import { errorHandler } from "./error-handler.js";
import { validate } from "./validate.js";
import { BadRequestError } from "../utils/errors.js";

const SECRET = env.JWT_SECRET;
const TEST_ADMIN = "0xAbCDEf0000000000000000000000000000000001";
const TEST_SELLER = "0x1234567890abcdef1234567890ABCDEF12345678";

function adminToken(address: string) {
  return jwt.sign({ address }, SECRET, { expiresIn: "1h" });
}

function sellerToken(address: string, role = "seller") {
  return jwt.sign({ address, role }, SECRET, { expiresIn: "1h" });
}

function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  app.get("/admin-only", requireAdmin, (req, res) => {
    res.json({ address: req.adminAddress });
  });

  app.get("/seller-only", requireSeller, (req, res) => {
    res.json({ address: req.sellerAddress });
  });

  app.post(
    "/validated",
    validate(
      z.object({
        name: z.string().min(1),
        count: z.number().int().positive(),
      }),
    ),
    (req, res) => {
      res.json(req.body);
    },
  );

  app.get("/app-error", (_req, _res, next) => {
    next(new BadRequestError("Broken input"));
  });

  app.get("/crash", () => {
    throw new Error("boom");
  });

  app.use(errorHandler);
  return app;
}

describe("common middleware", () => {
  let server: Server;
  let base: string;
  const originalAdminAddresses = [...adminAddresses];

  before(async () => {
    adminAddresses.splice(0, adminAddresses.length, TEST_ADMIN.toLowerCase());
    server = buildTestApp().listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    adminAddresses.splice(0, adminAddresses.length, ...originalAdminAddresses);
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  it("accepts an admin token when the address is allowlisted case-insensitively", async () => {
    const res = await fetch(`${base}/admin-only`, {
      headers: { cookie: `admin_token=${adminToken(TEST_ADMIN)}` },
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as { address: string };
    assert.equal(body.address, TEST_ADMIN);
  });

  it("rejects an admin token whose address is not allowlisted", async () => {
    const res = await fetch(`${base}/admin-only`, {
      headers: {
        cookie: `admin_token=${adminToken("0x9999999999999999999999999999999999999999")}`,
      },
    });

    assert.equal(res.status, 401);
    const body = (await res.json()) as { error: { code: string; message: string } };
    assert.equal(body.error.code, "UNAUTHORIZED");
    assert.match(body.error.message, /authorized admin/i);
  });

  it("rejects a seller cookie that does not carry the seller role", async () => {
    const res = await fetch(`${base}/seller-only`, {
      headers: { cookie: `seller_token=${sellerToken(TEST_SELLER, "admin")}` },
    });

    assert.equal(res.status, 401);
    const body = (await res.json()) as { error: { code: string; message: string } };
    assert.equal(body.error.code, "UNAUTHORIZED");
    assert.match(body.error.message, /seller session/i);
  });

  it("normalizes a seller address to lowercase on success", async () => {
    const res = await fetch(`${base}/seller-only`, {
      headers: { cookie: `seller_token=${sellerToken(TEST_SELLER)}` },
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as { address: string };
    assert.equal(body.address, TEST_SELLER.toLowerCase());
  });

  it("returns validation details when body parsing fails schema validation", async () => {
    const res = await fetch(`${base}/validated`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "", count: 0 }),
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as {
      error: { code: string; message: string; details: Array<{ path: string[] }> };
    };
    assert.equal(body.error.code, "VALIDATION_ERROR");
    assert.equal(body.error.message, "Validation error");
    assert.equal(body.error.details.length, 2);
  });

  it("serializes AppError instances with their explicit status and code", async () => {
    const res = await fetch(`${base}/app-error`);

    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: { code: string; message: string } };
    assert.equal(body.error.code, "BAD_REQUEST");
    assert.equal(body.error.message, "Broken input");
  });

  it("maps unexpected errors to a generic 500 response", async () => {
    const res = await fetch(`${base}/crash`);

    assert.equal(res.status, 500);
    const body = (await res.json()) as { error: { code: string; message: string } };
    assert.equal(body.error.code, "INTERNAL_ERROR");
    assert.equal(body.error.message, "Internal server error");
  });
});
