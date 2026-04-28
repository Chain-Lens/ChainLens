import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { SiweMessage } from "siwe";
import jwt from "jsonwebtoken";
import { env, adminAddresses } from "../config/env.js";
import { UnauthorizedError } from "../utils/errors.js";
import { validate } from "../middleware/validate.js";

const router = Router();

// In-memory nonce store (nonce -> expiry timestamp)
const nonces = new Map<string, number>();

// Clean expired nonces every 5 minutes
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

// GET /auth/nonce
router.get("/nonce", (_req: Request, res: Response) => {
  const nonce = generateNonce();
  nonces.set(nonce, Date.now() + 5 * 60 * 1000); // 5분 유효
  res.json({ nonce });
});

// POST /auth/verify
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

      // Nonce 검증 (replay attack 방지)
      if (!nonces.has(fields.nonce)) {
        return next(new UnauthorizedError("Invalid or expired nonce"));
      }
      nonces.delete(fields.nonce);

      // Admin 주소 검증
      const address = fields.address.toLowerCase();
      if (!adminAddresses.includes(address)) {
        return next(new UnauthorizedError("Not an authorized admin"));
      }

      // JWT 발급
      const token = jwt.sign({ address }, env.JWT_SECRET, { expiresIn: "24h" });

      res.cookie("admin_token", token, {
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

// POST /auth/logout
router.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie("admin_token");
  res.json({ success: true });
});

// GET /auth/me
router.get("/me", (req: Request, res: Response) => {
  const token = req.cookies?.admin_token;
  if (!token) return res.json({ authenticated: false });

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { address: string };
    res.json({ authenticated: true, address: payload.address });
  } catch {
    res.json({ authenticated: false });
  }
});

export default router;
