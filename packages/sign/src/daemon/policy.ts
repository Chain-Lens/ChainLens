// Composes the three 0.0.3 gates (decoder → limits → prompt) into a single
// `SignTxPolicy` callable that server.ts invokes before signing.
//
// Order matters:
//   1. decode — if unknown target/selector, refuse immediately (no prompt leak).
//   2. limits — per-tx + rolling-hour. Fast reject without bothering the user.
//   3. prompt — final human gate. Only reached for recognized + in-budget txs.
//   4. commit — recorded in limit window only AFTER server signs successfully
//     (policy returns a `commit` thunk the server calls post-sign).

import type { SignTxPolicy, SignTxDecision } from "./server.js";
import { decodeTx } from "./tx-decoder.js";
import { decodeTypedData } from "./typed-data-decoder.js";
import type { LimitEnforcer } from "./limit-enforcer.js";
import { atomicToUsdc } from "../config.js";
import type {
  DecodedSpend,
  PromptContext,
  PromptResult,
} from "./approval-prompt.js";

export interface PolicyOptions {
  limits: LimitEnforcer;
  approvalTimeoutSec: number;
  prompt: (ctx: PromptContext) => Promise<PromptResult>;
}

export function buildPolicy(opts: PolicyOptions): SignTxPolicy {
  return async (tx) => {
    const decoded = decodeTx(tx as Parameters<typeof decodeTx>[0]);

    if (decoded.kind === "unknown") {
      const selectorLabel = decoded.selector ?? "(no calldata)";
      const targetLabel = decoded.target ?? "(no target — contract deploy)";
      return deny(
        "unknown_target",
        `refusing: unrecognized target/selector (${targetLabel} ${selectorLabel}). ` +
          `0.0.3 daemon only signs USDC approve/transfer and Escrow pay/createJob. ` +
          `Use the WALLET_PRIVATE_KEY path for unsupported calls, or wait for allowlist in 0.0.4.`,
      );
    }

    return checkLimitsAndPrompt(opts, decoded);
  };
}

export function buildTypedDataPolicy(opts: PolicyOptions): SignTxPolicy {
  return async (typedData) => {
    const decoded = decodeTypedData(typedData);

    if (decoded.kind === "unknown") {
      return deny(
        "unknown_target",
        `refusing: unrecognized typed-data request (${decoded.reason}). ` +
          `0.0.4 daemon only signs USDC ReceiveWithAuthorization typed data.`,
      );
    }

    return checkLimitsAndPrompt(opts, decoded);
  };
}

async function checkLimitsAndPrompt(
  opts: PolicyOptions,
  decoded: Exclude<DecodedSpend, { kind: "unknown" }>,
): Promise<SignTxDecision> {
  const check = opts.limits.check(decoded.amountAtomic);
  if (!check.ok) {
    const which = check.reason === "per-tx-exceeded" ? "per-tx" : "per-hour";
    return deny(
      "limit_exceeded",
      `refusing: ${which} limit exceeded — ` +
        `offending ${atomicToUsdc(check.offendingAtomic)} USDC > cap ${atomicToUsdc(check.limitAtomic)} USDC. ` +
        `Edit ~/.chain-lens/config.json to raise.`,
    );
  }

  const result = await opts.prompt({
    decoded,
    remainingHourAtomic: check.remainingHourAtomic,
    timeoutSec: opts.approvalTimeoutSec,
  });
  if (!result.approved) {
    const code =
      result.reason === "timeout"
        ? "timeout"
        : result.reason === "no-tty"
          ? "no_tty"
          : "denied";
    const verb = result.reason === "timeout" ? "did not respond" : "denied";
    return deny(code, `user ${verb} approval`);
  }
  return {
    type: "allow",
    commit: () => opts.limits.record(decoded.amountAtomic),
  };
}

function deny(
  code: "unknown_target" | "limit_exceeded" | "denied" | "timeout" | "no_tty",
  message: string,
): SignTxDecision {
  return { type: "deny", code, message };
}
