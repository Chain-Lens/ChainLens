#!/usr/bin/env node
import { runCli } from "./cli.js";

runCli(process.argv.slice(2)).catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`chainlens-seller: ${msg}\n`);
  process.exit(1);
});
