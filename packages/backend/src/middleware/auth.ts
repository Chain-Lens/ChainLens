import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env, adminAddresses } from "../config/env.js";
import { UnauthorizedError } from "../utils/errors.js";

export interface AuthenticatedRequest extends Request {
  adminAddress?: string;
}

export interface SellerAuthenticatedRequest extends Request {
  sellerAddress?: string;
}

export function requireAdmin(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) {
  const token = req.cookies?.admin_token;

  if (!token) {
    return next(new UnauthorizedError("Authentication required"));
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { address: string };

    if (!adminAddresses.includes(payload.address.toLowerCase())) {
      return next(new UnauthorizedError("Not an authorized admin"));
    }

    req.adminAddress = payload.address;
    next();
  } catch {
    next(new UnauthorizedError("Invalid or expired session"));
  }
}

// Mirrors requireAdmin but for seller auth. The `role` claim is what
// prevents an admin JWT (same signing secret, same shape) from being
// pasted into the `seller_token` cookie to impersonate a seller, and
// vice versa.
export function requireSeller(
  req: SellerAuthenticatedRequest,
  _res: Response,
  next: NextFunction
) {
  const token = req.cookies?.seller_token;

  if (!token) {
    return next(new UnauthorizedError("Authentication required"));
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as {
      address: string;
      role?: string;
    };

    if (payload.role !== "seller" || !payload.address) {
      return next(new UnauthorizedError("Invalid seller session"));
    }

    req.sellerAddress = payload.address.toLowerCase();
    next();
  } catch {
    next(new UnauthorizedError("Invalid or expired session"));
  }
}
