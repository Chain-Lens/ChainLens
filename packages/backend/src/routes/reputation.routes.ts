import { Router, type Request, type Response, type NextFunction } from "express";
import {
  getSellerReputation,
  defaultReputationDeps,
  type ReputationDeps,
} from "../services/reputation.service.js";

const router = Router();

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

let depsPromise: Promise<ReputationDeps> | null = null;
function getDeps(): Promise<ReputationDeps> {
  if (!depsPromise) depsPromise = defaultReputationDeps();
  return depsPromise;
}

// GET /api/reputation/:sellerAddress
router.get(
  "/:sellerAddress",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const raw = req.params.sellerAddress;
      if (typeof raw !== "string" || !ADDRESS_RE.test(raw)) {
        res.status(400).json({ error: "invalid_address" });
        return;
      }
      const address = raw as `0x${string}`;
      const deps = await getDeps();
      const reputation = await getSellerReputation(address, deps);
      if (!reputation) {
        res.status(404).json({ error: "seller_not_registered" });
        return;
      }
      res.json(reputation);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
