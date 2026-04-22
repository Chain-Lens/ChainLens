import { Router } from "express";
import apiRoutes from "./api.routes.js";
import paymentRoutes from "./payment.routes.js";
import adminRoutes from "./admin.routes.js";
import authRoutes from "./auth.routes.js";
import sellerAuthRoutes from "./seller-auth.routes.js";
import sellerRoutes from "./seller.routes.js";
import x402Routes from "./x402.routes.js";
import executeRoutes from "./execute.routes.js";
import evidenceRoutes from "./evidence.routes.js";
import reputationRoutes from "./reputation.routes.js";
import jobsRoutes from "./jobs.routes.js";
import jobExecuteRoutes from "./job-execute.routes.js";
import taskTypeRoutes from "./task-type.routes.js";

const router = Router();

router.use("/apis", apiRoutes);
router.use("/", paymentRoutes);
router.use("/admin", adminRoutes);
router.use("/auth", authRoutes);
router.use("/seller/auth", sellerAuthRoutes);
router.use("/seller", sellerRoutes);
router.use("/x402", x402Routes);
router.use("/execute", executeRoutes);
router.use("/evidence", evidenceRoutes);
router.use("/reputation", reputationRoutes);
router.use("/jobs/execute", jobExecuteRoutes);
router.use("/jobs", jobsRoutes);
router.use("/task-types", taskTypeRoutes);

// Health check
router.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

export { router as routes };
