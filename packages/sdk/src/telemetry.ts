import { homedir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import type { FailureMetadata } from "./types.js";

export interface TelemetryEntry {
  ts: number;
  listingId: number;
  amountUsdc: number;
  latencyMs: number;
  ok: boolean;
  failure?: FailureMetadata;
  txHash?: string;
  paramsHash?: string;
}

export interface TelemetryConfig {
  enabled: boolean;
  upload: boolean;
  bufferMaxEntries: number;
  gatewayUrl: string;
  walletAddress: string;
}

export class TelemetryRecorder {
  private readonly cfg: TelemetryConfig;

  constructor(cfg: TelemetryConfig) {
    this.cfg = cfg;
  }

  async record(entry: TelemetryEntry): Promise<void> {
    if (!this.cfg.enabled) return;

    const line = JSON.stringify(entry) + "\n";
    const dir = join(homedir(), ".chainlens", "telemetry");
    const filePath = join(dir, `${sanitizeAddress(this.cfg.walletAddress)}.jsonl`);

    try {
      await mkdir(dir, { recursive: true });
      await appendFile(filePath, line, "utf8");
    } catch {
      // non-blocking — ignore write failures
    }

    if (this.cfg.upload) {
      void this.uploadAsync(entry);
    }
  }

  private async uploadAsync(entry: TelemetryEntry): Promise<void> {
    try {
      await fetch(`${this.cfg.gatewayUrl}/v1/telemetry/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: [entry] }),
      });
    } catch {
      // fire-and-forget, ignore errors
    }
  }
}

export function hashParams(params: unknown): string {
  const json = params != null ? JSON.stringify(params) : "";
  return createHash("sha256").update(json, "utf8").digest("hex").slice(0, 16);
}

function sanitizeAddress(addr: string): string {
  return addr.toLowerCase().replace(/[^a-f0-9x]/g, "").slice(0, 42);
}
