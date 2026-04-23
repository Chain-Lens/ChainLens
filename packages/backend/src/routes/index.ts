import { Router } from "express";
import adminRoutes from "./admin.routes.js";
import authRoutes from "./auth.routes.js";
import sellerAuthRoutes from "./seller-auth.routes.js";
import sellerRoutes from "./seller.routes.js";
import marketRoutes from "./market.routes.js";
import healthRoutes from "./health.routes.js";

const router = Router();

router.use("/admin", adminRoutes);
router.use("/auth", authRoutes);
router.use("/seller/auth", sellerAuthRoutes);
router.use("/seller", sellerRoutes);
router.use("/market", marketRoutes);
router.use("/health", healthRoutes);

export { router as routes };
