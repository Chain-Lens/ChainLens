// Per-tx approval prompt shown in the unlock TTY.
//
// Design choices:
//   - Default (Enter, blank input, timeout) = DENY. Explicit "y" required.
//     We're a security tool; silent accept defeats the purpose.
//   - Timeout defaults to config.approvalTimeoutSec; auto-deny at expiry.
//   - Prompts are serialized via a promise chain — two concurrent sign-tx
//     requests can't race on the same TTY.
//   - If stdin/stderr are not TTYs (piped, detached), auto-deny immediately.
//     Safer than prompting into the void.

import { createInterface, type Interface } from "node:readline";
import { atomicToUsdc } from "../config.js";
import type { DecodedTx } from "./tx-decoder.js";
import type { DecodedTypedData } from "./typed-data-decoder.js";

export type DecodedSpend = DecodedTx | DecodedTypedData;

export interface PromptContext {
  decoded: DecodedSpend;
  remainingHourAtomic: bigint;
  timeoutSec: number;
}

export type PromptResult =
  | { approved: true }
  | { approved: false; reason: "denied" | "timeout" | "no-tty" };

type PromptFn = (ctx: PromptContext) => Promise<PromptResult>;

export function createApprovalPrompt(opts?: {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  isTTY?: boolean;
}): PromptFn {
  const input = opts?.input ?? process.stdin;
  const output = opts?.output ?? process.stderr;
  const isTTY =
    opts?.isTTY ??
    (Boolean((process.stdin as NodeJS.ReadStream).isTTY) &&
      Boolean((process.stderr as NodeJS.WriteStream).isTTY));

  let chain: Promise<unknown> = Promise.resolve();

  return function prompt(ctx: PromptContext): Promise<PromptResult> {
    const next = chain.then(() => askOne(ctx, input, output, isTTY));
    chain = next.catch(() => undefined);
    return next;
  };
}

async function askOne(
  ctx: PromptContext,
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
  isTTY: boolean,
): Promise<PromptResult> {
  if (!isTTY) {
    output.write(
      "\n  sign-tx refused: no TTY attached for approval prompt.\n" +
        "  (set CHAIN_LENS_SIGN_NO_PROMPT=1 to allow unsafe no-prompt mode — 0.0.3 does not.)\n",
    );
    return { approved: false, reason: "no-tty" };
  }

  output.write("\n" + renderSummary(ctx) + "\n");
  output.write(`  approve? [y/N] (auto-deny in ${ctx.timeoutSec}s) > `);

  const rl = createInterface({ input, output, terminal: false });

  return new Promise<PromptResult>((resolve) => {
    let settled = false;
    const finish = (r: PromptResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rl.removeAllListeners("line");
      rl.close();
      resolve(r);
    };

    const timer = setTimeout(() => {
      output.write("\n  (timed out — denied)\n");
      finish({ approved: false, reason: "timeout" });
    }, ctx.timeoutSec * 1000);

    rl.once("line", (raw) => {
      const answer = raw.trim().toLowerCase();
      if (answer === "y" || answer === "yes") {
        finish({ approved: true });
      } else {
        finish({ approved: false, reason: "denied" });
      }
    });
  });
}

function renderSummary(ctx: PromptContext): string {
  const { decoded, remainingHourAtomic } = ctx;
  const lines: string[] = ["  ── sign-tx approval ──"];

  if (decoded.kind === "unknown") {
    lines.push("  kind:       unknown (refused before prompt — this shouldn't render)");
    return lines.join("\n");
  }

  const kindLabel: Record<typeof decoded.kind, string> = {
    approve: "USDC approve",
    transfer: "USDC transfer",
    pay: "Escrow.pay",
    createJob: "Escrow.createJob",
    receiveWithAuthorization: "USDC ReceiveWithAuthorization",
  };

  lines.push(`  kind:       ${kindLabel[decoded.kind]}`);
  lines.push(`  target:     ${decoded.target}`);
  lines.push(`  to/seller:  ${decoded.counterparty}`);
  lines.push(`  amount:     ${atomicToUsdc(decoded.amountAtomic)} USDC`);
  if (decoded.valueWei > 0n) {
    lines.push(`  value:      ${decoded.valueWei} wei (native)`);
  }
  lines.push(`  hour left:  ${atomicToUsdc(remainingHourAtomic)} USDC`);
  return lines.join("\n");
}
