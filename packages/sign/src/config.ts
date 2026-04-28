// User config for sign daemon policy (spending limits, approval timeout).
// Location: $CHAIN_LENS_HOME/config.json (default ~/.chain-lens/config.json).
// Missing file is OK — defaults below apply.
//
// File format (decimal strings for USDC, seconds for timeout):
//   {
//     "limits": { "maxPerTxUSDC": "5.00", "maxPerHourUSDC": "50.00" },
//     "approvalTimeoutSec": 30
//   }
//
// Why decimal: humans edit this file; "50000" atomic units is error-prone
// next to "5000000" (one is 0.05, one is 5, typo = 100x loss).

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { chainLensHome } from "./paths.js";

export const USDC_DECIMALS = 6;

export interface SignConfig {
  limits: {
    /** Max USDC (atomic units, 6 decimals) that a single tx may move. */
    maxPerTxAtomic: bigint;
    /** Max USDC (atomic units) across any rolling 60-minute window. */
    maxPerHourAtomic: bigint;
  };
  /** Seconds to wait for user approval in TTY before auto-deny. */
  approvalTimeoutSec: number;
}

export const DEFAULT_CONFIG: SignConfig = {
  limits: {
    maxPerTxAtomic: usdcToAtomic("5.00"),
    maxPerHourAtomic: usdcToAtomic("50.00"),
  },
  approvalTimeoutSec: 30,
};

export function configPath(): string {
  return join(chainLensHome(), "config.json");
}

export async function loadConfig(): Promise<SignConfig> {
  let raw: string;
  try {
    raw = await readFile(configPath(), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return DEFAULT_CONFIG;
    throw err;
  }
  return parseConfig(raw);
}

export function parseConfig(raw: string): SignConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`config.json: invalid JSON — ${(err as Error).message}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("config.json: top-level must be an object");
  }
  const input = parsed as Record<string, unknown>;
  const limitsIn = (input.limits ?? {}) as Record<string, unknown>;
  const timeoutIn = input.approvalTimeoutSec;

  const maxPerTxStr = coerceStr(limitsIn.maxPerTxUSDC, "limits.maxPerTxUSDC") ?? "5.00";
  const maxPerHourStr = coerceStr(limitsIn.maxPerHourUSDC, "limits.maxPerHourUSDC") ?? "50.00";

  const approvalTimeoutSec =
    typeof timeoutIn === "number" && Number.isFinite(timeoutIn) && timeoutIn > 0
      ? Math.floor(timeoutIn)
      : DEFAULT_CONFIG.approvalTimeoutSec;

  return {
    limits: {
      maxPerTxAtomic: usdcToAtomic(maxPerTxStr),
      maxPerHourAtomic: usdcToAtomic(maxPerHourStr),
    },
    approvalTimeoutSec,
  };
}

/** Decimal USDC string → atomic bigint (6 decimals). "5.00" → 5000000n. */
export function usdcToAtomic(decimal: string): bigint {
  if (!/^\d+(\.\d+)?$/.test(decimal)) {
    throw new Error(`invalid USDC decimal: '${decimal}' (expected e.g. "5.00")`);
  }
  const [whole, frac = ""] = decimal.split(".");
  if (frac.length > USDC_DECIMALS) {
    throw new Error(`USDC has ${USDC_DECIMALS} decimals, got ${frac.length} in '${decimal}'`);
  }
  const padded = frac.padEnd(USDC_DECIMALS, "0");
  return BigInt(whole) * 10n ** BigInt(USDC_DECIMALS) + BigInt(padded);
}

/** Inverse, for log/prompt output. 5000000n → "5.00". */
export function atomicToUsdc(atomic: bigint): string {
  const base = 10n ** BigInt(USDC_DECIMALS);
  const whole = atomic / base;
  const frac = atomic % base;
  const fracStr = frac.toString().padStart(USDC_DECIMALS, "0").replace(/0+$/, "");
  return fracStr.length === 0 ? `${whole}.00` : `${whole}.${fracStr.padEnd(2, "0")}`;
}

function coerceStr(v: unknown, field: string): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw new Error(`${field}: must be a string, got ${typeof v}`);
  return v;
}
