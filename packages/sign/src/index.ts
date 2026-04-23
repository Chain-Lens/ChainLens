#!/usr/bin/env node
import { runAddress } from "./commands/address.js";
import { runImport } from "./commands/import.js";
import { runInit } from "./commands/init.js";
import { runLock } from "./commands/lock.js";
import { runSendTx } from "./commands/send-tx.js";
import { runStatus } from "./commands/status.js";
import { runUnlock } from "./commands/unlock.js";

const USAGE = `chain-lens-sign — encrypted wallet keystore + signing daemon

Usage:
  chain-lens-sign init                 Generate a new wallet and encrypt with password
  chain-lens-sign import               Import an existing private key (prompted)
  chain-lens-sign address              Print addresses of all stored keystores

  chain-lens-sign unlock [addr]        Decrypt keystore, start signing daemon (foreground)
                       [--ttl 1h]       TTL before auto-lock (e.g. 30m, 2h, 7200s). Default 1h.
  chain-lens-sign status               Print unlocked address and TTL remaining
  chain-lens-sign lock                 Stop the running daemon

  chain-lens-sign send-tx              Sign + broadcast a transaction via the daemon
                       --rpc <url>       (required) JSON-RPC endpoint
                       --to  <0x...>     (required) recipient
                       --value <wei>     (default 0)
                       --data  <0x...>   (default 0x)
                       --chain-id <n>    (default: eth_chainId)
                       --no-wait         skip waiting for receipt

  chain-lens-sign --help               Show this help

Paths
  Keystores:       $CHAIN_LENS_HOME/keystore   (default ~/.chain-lens/keystore)
  Daemon socket:   $CHAIN_LENS_SIGN_SOCKET     (default ~/.chain-lens/sign.sock)

NOTE: 0.0.x alpha. Keep the unlock terminal visible; it is the approval console
for MCP/x402 signing prompts.
`;

type Handler = (argv: string[]) => Promise<void>;

const COMMANDS: Record<string, Handler> = {
  init: () => runInit(),
  import: () => runImport(),
  address: () => runAddress(),
  unlock: (argv) => runUnlock(argv),
  lock: () => runLock(),
  status: () => runStatus(),
  "send-tx": (argv) => runSendTx(argv),
};

async function main(): Promise<void> {
  const command = process.argv[2];
  const rest = process.argv.slice(3);

  if (!command || command === "--help" || command === "-h" || command === "help") {
    process.stdout.write(USAGE);
    return;
  }

  const handler = COMMANDS[command];
  if (!handler) {
    process.stderr.write(`Unknown command: ${command}\n\n${USAGE}`);
    process.exit(2);
  }
  await handler(rest);
}

main().catch((err) => {
  process.stderr.write(`chain-lens-sign: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
