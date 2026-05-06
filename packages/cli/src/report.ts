import { homedir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import type { TelemetryEntry } from "@chain-lens/sdk";

function sanitizeAddress(addr: string): string {
  return addr.toLowerCase().replace(/[^a-f0-9x]/g, "").slice(0, 42);
}

export async function loadTelemetry(walletAddress: string): Promise<TelemetryEntry[]> {
  const filePath = join(
    homedir(),
    ".chainlens",
    "telemetry",
    `${sanitizeAddress(walletAddress)}.jsonl`,
  );
  try {
    const raw = await readFile(filePath, "utf8");
    const lines = raw.split("\n").filter((l) => l.trim().length > 0);
    return lines
      .map((line) => {
        try {
          return JSON.parse(line) as TelemetryEntry;
        } catch {
          return null;
        }
      })
      .filter((e): e is TelemetryEntry => e !== null);
  } catch {
    return [];
  }
}

export function printReport(entries: TelemetryEntry[]): void {
  if (entries.length === 0) {
    console.log("No telemetry recorded yet.");
    return;
  }

  const total = entries.length;
  const successes = entries.filter((e) => e.ok).length;
  const failures = total - successes;
  const totalSpend = entries
    .filter((e) => e.ok)
    .reduce((s, e) => s + e.amountUsdc, 0);
  const avgLatency =
    entries.reduce((s, e) => s + e.latencyMs, 0) / total;

  const byListing = new Map<number, { calls: number; spend: number; failures: number }>();
  for (const e of entries) {
    const cur = byListing.get(e.listingId) ?? { calls: 0, spend: 0, failures: 0 };
    cur.calls++;
    if (e.ok) cur.spend += e.amountUsdc;
    else cur.failures++;
    byListing.set(e.listingId, cur);
  }

  const failureKinds = new Map<string, number>();
  for (const e of entries.filter((e) => !e.ok && e.failure)) {
    const kind = e.failure!.kind;
    failureKinds.set(kind, (failureKinds.get(kind) ?? 0) + 1);
  }

  console.log("=== ChainLens Report ===");
  console.log(`Total calls:    ${total}`);
  console.log(`Successes:      ${successes}`);
  console.log(`Failures:       ${failures}`);
  console.log(`Total spend:    $${totalSpend.toFixed(6)} USDC`);
  console.log(`Avg latency:    ${avgLatency.toFixed(0)} ms`);

  if (byListing.size > 0) {
    console.log("\nBy listing:");
    for (const [id, stats] of byListing) {
      console.log(
        `  #${id}: ${stats.calls} calls, $${stats.spend.toFixed(6)} USDC, ${stats.failures} failures`,
      );
    }
  }

  if (failureKinds.size > 0) {
    console.log("\nFailure breakdown:");
    for (const [kind, count] of failureKinds) {
      console.log(`  ${kind}: ${count}`);
    }
  }
}
