import { Router } from "express";
import apiRoutes from "./api.routes.js";
import paymentRoutes from "./payment.routes.js";
import adminRoutes from "./admin.routes.js";
import authRoutes from "./auth.routes.js";
import x402Routes from "./x402.routes.js";
import executeRoutes from "./execute.routes.js";
import evidenceRoutes from "./evidence.routes.js";
import reputationRoutes from "./reputation.routes.js";
import jobsRoutes from "./jobs.routes.js";

const router = Router();

router.use("/apis", apiRoutes);
router.use("/", paymentRoutes);
router.use("/admin", adminRoutes);
router.use("/auth", authRoutes);
router.use("/x402", x402Routes);
router.use("/execute", executeRoutes);
router.use("/evidence", evidenceRoutes);
router.use("/reputation", reputationRoutes);
router.use("/jobs", jobsRoutes);

// Health check
router.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

export { router as routes };
