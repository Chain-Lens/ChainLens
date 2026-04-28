import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { SiweMessage } from "siwe";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { UnauthorizedError } from "../utils/errors.js";
import { validate } from "../middleware/validate.js";

const router = Router();

// Separate nonce store from admin's — keeps the two flows from
// sharing single-use nonces.
const nonces = new Map<string, number>();

setInterval(
  () => {
    const now = Date.now();
    for (const [nonce, expiry] of nonces) {
      if (expiry < now) nonces.delete(nonce);
    }
  },
  5 * 60 * 1000,
);

function generateNonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

router.get("/nonce", (_req: Request, res: Response) => {
  const nonce = generateNonce();
  nonces.set(nonce, Date.now() + 5 * 60 * 1000);
  res.json({ nonce });
});

const verifySchema = z.object({
  message: z.string().min(1),
  signature: z.string().min(1),
});

router.post(
  "/verify",
  validate(verifySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { message, signature } = req.body as z.infer<typeof verifySchema>;

      const siweMessage = new SiweMessage(message);
      const { data: fields, error } = await siweMessage.verify({ signature });

      if (error) {
        return next(new UnauthorizedError("Invalid signature"));
      }

      if (!nonces.has(fields.nonce)) {
        return next(new UnauthorizedError("Invalid or expired nonce"));
      }
      nonces.delete(fields.nonce);

      const address = fields.address.toLowerCase();

      const token = jwt.sign({ address, role: "seller" }, env.JWT_SECRET, { expiresIn: "24h" });

      res.cookie("seller_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 24 * 60 * 60 * 1000,
      });

      res.json({ address });
    } catch (err) {
      next(err);
    }
  },
);

router.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie("seller_token");
  res.json({ success: true });
});

router.get("/me", (req: Request, res: Response) => {
  const token = req.cookies?.seller_token;
  if (!token) return res.json({ authenticated: false });

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as {
      address: string;
      role?: string;
    };
    if (payload.role !== "seller") {
      return res.json({ authenticated: false });
    }
    res.json({ authenticated: true, address: payload.address });
  } catch {
    res.json({ authenticated: false });
  }
});

export default router;
