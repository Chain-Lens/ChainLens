#!/usr/bin/env node
import { runAddress } from "./commands/address.js";
import { runImport } from "./commands/import.js";
import { runInit } from "./commands/init.js";

const USAGE = `chain-lens-sign — encrypted wallet keystore for ChainLens

Usage:
  chain-lens-sign init       Generate a new wallet and encrypt with password
  chain-lens-sign import     Import an existing private key (prompted)
  chain-lens-sign address    Print addresses of all stored keystores
  chain-lens-sign --help     Show this help

Keystores are stored at $CHAIN_LENS_HOME/keystore (default: ~/.chain-lens/keystore).
Format: geth keystore v3 — compatible with cast, foundry, ethers, web3.js.

NOTE: 0.0.x alpha. Signing, session daemon, and MCP integration land in later
releases; for now this CLI only manages encrypted keystore files.
`;

const COMMANDS: Record<string, () => Promise<void>> = {
  init: runInit,
  import: runImport,
  address: runAddress,
};

async function main(): Promise<void> {
  const command = process.argv[2];

  if (!command || command === "--help" || command === "-h" || command === "help") {
    process.stdout.write(USAGE);
    return;
  }

  const handler = COMMANDS[command];
  if (!handler) {
    process.stderr.write(`Unknown command: ${command}\n\n${USAGE}`);
    process.exit(2);
  }
  await handler();
}

main().catch((err) => {
  process.stderr.write(`chain-lens-sign: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
