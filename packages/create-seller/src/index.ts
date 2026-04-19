#!/usr/bin/env node
import { runCli } from "./cli.js";

runCli(process.argv.slice(2)).catch((err) => {
  process.stderr.write(`chain-lens-seller: ${formatErrorChain(err)}\n`);
  process.exit(1);
});

function formatErrorChain(err: unknown): string {
  const lines: string[] = [];
  let current: unknown = err;
  let depth = 0;
  while (current != null && depth < 6) {
    const msg = current instanceof Error ? current.message : String(current);
    const code =
      typeof current === "object" && current !== null && "code" in current
        ? ` [${(current as { code: unknown }).code}]`
        : "";
    lines.push(depth === 0 ? `${msg}${code}` : `  caused by: ${msg}${code}`);
    current =
      current instanceof Error && "cause" in current ? (current as Error).cause : undefined;
    depth++;
  }
  return lines.join("\n");
}
