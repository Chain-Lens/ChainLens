import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type {
  EvidenceStore,
  EvidenceView,
} from "../services/evidence.service.js";

/**
 * Integration test for /api/evidence/:jobId that stubs the prisma-backed
 * store. We mount the same handler logic without relying on the lazy
 * Prisma singleton (which would require DATABASE_URL at runtime).
 */
function buildTestApp(store: EvidenceStore) {
  const app = express();
  app.get("/api/evidence/:jobId", async (req, res, next) => {
    try {
      const raw = req.params.jobId;
      if (!/^\d+$/.test(raw)) {
        res.status(400).json({ error: "invalid_job_id" });
        return;
      }
      const onchainJobId = BigInt(raw);
      const evidence = await store.findByOnchainId(onchainJobId);
      if (!evidence) {
        res.status(404).json({ error: "evidence_not_found" });
        return;
      }
      res.json(evidence);
    } catch (err) {
      next(err);
    }
  });
  return app;
}

const VIEW: EvidenceView = {
  onchainJobId: "42",
  buyer: "0xbuyer",
  seller: "0xseller",
  apiId: "7",
  taskType: "blockscout_contract_source",
  amount: "0.100000",
  inputs: { contract_address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984" },
  inputsHash: "0xinputs",
  response: { source_code: "contract UNI {}" },
  responseHash: "0xresp",
  evidenceURI: "http://localhost:3001/api/evidence/42",
  status: "COMPLETED",
  errorReason: null,
  createdAt: "2026-04-19T10:00:00.000Z",
  completedAt: "2026-04-19T10:00:05.000Z",
};

describe("GET /api/evidence/:jobId", () => {
  let server: Server;
  let baseUrl: string;
  const storeState: { view: EvidenceView | null } = { view: null };
  const store: EvidenceStore = {
    async create() {},
    async complete() {},
    async findByOnchainId() {
      return storeState.view;
    },
  };

  before(async () => {
    const app = buildTestApp(store);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("returns 400 on a non-numeric job id", async () => {
    const res = await fetch(`${baseUrl}/api/evidence/not-a-number`);
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "invalid_job_id" });
  });

  it("returns 404 when the evidence is not in storage", async () => {
    storeState.view = null;
    const res = await fetch(`${baseUrl}/api/evidence/999`);
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: "evidence_not_found" });
  });

  it("returns the evidence payload as JSON", async () => {
    storeState.view = VIEW;
    const res = await fetch(`${baseUrl}/api/evidence/42`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), VIEW);
  });

  it("accepts uint256-range job ids that exceed Number.MAX_SAFE_INTEGER", async () => {
    const big = "99999999999999999999";
    storeState.view = { ...VIEW, onchainJobId: big };
    const res = await fetch(`${baseUrl}/api/evidence/${big}`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as EvidenceView;
    assert.equal(body.onchainJobId, big);
  });
});
