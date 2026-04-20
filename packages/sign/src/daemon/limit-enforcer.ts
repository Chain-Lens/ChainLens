// Spending-limit enforcement for the sign daemon.
//
// Two limits (both in USDC atomic units):
//   - maxPerTxAtomic:   single-tx cap
//   - maxPerHourAtomic: rolling 60-minute window sum (signed txs only)
//
// The window is in-memory. Daemon restart resets it — intentional: a lock/unlock
// cycle is a legitimate "new session", and durable per-hour tracking would need
// its own persistence layer (out of 0.0.3 scope).

const HOUR_MS = 60 * 60 * 1000;

export interface Limits {
  maxPerTxAtomic: bigint;
  maxPerHourAtomic: bigint;
}

export interface LimitCheckOk {
  ok: true;
  /** Remaining hour budget after this tx would be signed. */
  remainingHourAtomic: bigint;
}

export interface LimitCheckBlocked {
  ok: false;
  reason: "per-tx-exceeded" | "per-hour-exceeded";
  /** Which limit was hit. */
  limitAtomic: bigint;
  /** The offending amount (per-tx) or the projected total (per-hour). */
  offendingAtomic: bigint;
}

export type LimitCheck = LimitCheckOk | LimitCheckBlocked;

export interface LimitEnforcer {
  /** Check without recording — caller records after successful approval + sign. */
  check(amountAtomic: bigint, now?: number): LimitCheck;
  /** Record a signed spend. Caller MUST invoke this after sign success. */
  record(amountAtomic: bigint, now?: number): void;
  /** For logging: current hour usage (atomic). */
  windowSum(now?: number): bigint;
}

export function createLimitEnforcer(limits: Limits): LimitEnforcer {
  // Sorted by `at` ascending; prune from head on each check/record.
  const window: { at: number; amount: bigint }[] = [];

  function prune(now: number): void {
    const cutoff = now - HOUR_MS;
    while (window.length > 0 && window[0].at < cutoff) window.shift();
  }

  function sumWindow(): bigint {
    let s = 0n;
    for (const e of window) s += e.amount;
    return s;
  }

  return {
    check(amountAtomic, now = Date.now()): LimitCheck {
      prune(now);
      if (amountAtomic > limits.maxPerTxAtomic) {
        return {
          ok: false,
          reason: "per-tx-exceeded",
          limitAtomic: limits.maxPerTxAtomic,
          offendingAtomic: amountAtomic,
        };
      }
      const projected = sumWindow() + amountAtomic;
      if (projected > limits.maxPerHourAtomic) {
        return {
          ok: false,
          reason: "per-hour-exceeded",
          limitAtomic: limits.maxPerHourAtomic,
          offendingAtomic: projected,
        };
      }
      return { ok: true, remainingHourAtomic: limits.maxPerHourAtomic - projected };
    },
    record(amountAtomic, now = Date.now()): void {
      prune(now);
      window.push({ at: now, amount: amountAtomic });
    },
    windowSum(now = Date.now()): bigint {
      prune(now);
      return sumWindow();
    },
  };
}
