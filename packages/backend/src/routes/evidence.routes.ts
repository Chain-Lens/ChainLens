import { Router, type Request, type Response, type NextFunction } from "express";
import { getEvidence } from "../services/evidence.service.js";
import { prismaEvidenceStore } from "../services/evidence-store.js";

const router = Router();

// GET /api/evidence/:jobId
// Returns the recorded job evidence for a given on-chain job id. jobId is
// taken from the escrow contract's uint256 and may exceed Number.MAX_SAFE_INTEGER,
// so it is parsed as BigInt.
router.get("/:jobId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const raw = req.params.jobId;
    if (typeof raw !== "string" || !/^\d+$/.test(raw)) {
      res.status(400).json({ error: "invalid_job_id" });
      return;
    }
    const onchainJobId = BigInt(raw);
    // PostgreSQL BIGINT max is 2^63-1; anything larger can't exist in DB
    if (onchainJobId > BigInt("9223372036854775807")) {
      res.status(404).json({ error: "evidence_not_found" });
      return;
    }
    const evidence = await getEvidence(onchainJobId, prismaEvidenceStore);
    if (!evidence) {
      res.status(404).json({ error: "evidence_not_found" });
      return;
    }
    res.json(evidence);
  } catch (err) {
    next(err);
  }
});

export default router;
