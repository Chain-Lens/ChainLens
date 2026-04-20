import { readFile, readdir } from "node:fs/promises";
import { decryptKey, type KeystoreV3 } from "../crypto/keystore.js";
import { startDaemon } from "../daemon/server.js";
import { buildPolicy } from "../daemon/policy.js";
import { createLimitEnforcer } from "../daemon/limit-enforcer.js";
import { createApprovalPrompt } from "../daemon/approval-prompt.js";
import { loadConfig, atomicToUsdc } from "../config.js";
import { keystoreDir, keystoreFilePath, socketPath } from "../paths.js";
import { promptSecret } from "../prompt.js";
import { fileExists } from "./shared.js";

const DEFAULT_TTL_MS = 60 * 60 * 1000;

export async function runUnlock(argv: string[]): Promise<void> {
  const { address, ttlMs } = parseArgs(argv);
  const target = await resolveKeystore(address);
  const password = await promptSecret(`Password for ${target.address}: `);
  const privateKey = decryptKey(target.keystore, password);

  const config = await loadConfig();
  const limits = createLimitEnforcer(config.limits);
  const approvalPrompt = createApprovalPrompt();
  const policy = buildPolicy({
    limits,
    approvalTimeoutSec: config.approvalTimeoutSec,
    prompt: approvalPrompt,
  });

  const sock = socketPath();
  const daemon = await startDaemon({
    privateKey,
    socketPath: sock,
    ttlMs,
    policy,
    onEvent: (event) => {
      if (event.type === "listening") {
        process.stdout.write(
          `\n  Unlocked ${event.address}\n` +
            `  Socket:  ${event.socketPath}\n` +
            `  TTL:     ${formatDuration(event.ttlMs)}\n` +
            `  Limits:  ${atomicToUsdc(config.limits.maxPerTxAtomic)}/tx, ${atomicToUsdc(config.limits.maxPerHourAtomic)}/hr (USDC)\n` +
            `  Approve: ${config.approvalTimeoutSec}s timeout, default DENY\n\n` +
            `  export CHAIN_LENS_SIGN_SOCKET=${event.socketPath}\n\n` +
            `  Press Ctrl-C to lock, or run 'chain-lens-sign lock' from another shell.\n`,
        );
      }
      if (event.type === "denied") {
        process.stderr.write(`  [denied] ${event.code}: ${event.message}\n`);
      }
      if (event.type === "closed") {
        process.stdout.write(`\n  Locked (${event.reason}).\n`);
      }
    },
  });

  await daemon.closed;
}

interface ResolvedKeystore {
  address: `0x${string}`;
  path: string;
  keystore: KeystoreV3;
}

async function resolveKeystore(requested?: string): Promise<ResolvedKeystore> {
  if (requested) return loadKeystore(requested);
  const available = await listKeystoreAddresses();
  if (available.length === 0) {
    throw new Error(
      `No keystores found in ${keystoreDir()}. Run 'chain-lens-sign init' or 'chain-lens-sign import' first.`,
    );
  }
  if (available.length > 1) {
    const list = available.map((a) => `    ${a}`).join("\n");
    throw new Error(
      `Multiple keystores found — pick one:\n${list}\n\nUsage: chain-lens-sign unlock <address>`,
    );
  }
  return loadKeystore(available[0]);
}

async function loadKeystore(address: string): Promise<ResolvedKeystore> {
  const path = keystoreFilePath(address);
  if (!(await fileExists(path))) {
    throw new Error(`No keystore for ${address} at ${path}.`);
  }
  const raw = await readFile(path, "utf8");
  const keystore = JSON.parse(raw) as KeystoreV3;
  const addressHex = `0x${keystore.address.toLowerCase()}` as `0x${string}`;
  return { address: addressHex, path, keystore };
}

async function listKeystoreAddresses(): Promise<string[]> {
  try {
    const files = await readdir(keystoreDir());
    return files.filter((f) => f.endsWith(".json")).map((f) => `0x${f.slice(0, -5)}`);
  } catch {
    return [];
  }
}

interface UnlockArgs {
  address?: string;
  ttlMs: number;
}

function parseArgs(argv: string[]): UnlockArgs {
  let address: string | undefined;
  let ttlMs = DEFAULT_TTL_MS;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--ttl") {
      const raw = argv[++i];
      if (!raw) throw new Error("--ttl requires a value (e.g. 30m, 1h, 60s).");
      ttlMs = parseDuration(raw);
      continue;
    }
    if (a.startsWith("--ttl=")) {
      ttlMs = parseDuration(a.slice("--ttl=".length));
      continue;
    }
    if (a.startsWith("0x") && a.length === 42) {
      address = a;
      continue;
    }
    throw new Error(`Unknown argument: ${a}`);
  }
  return { address, ttlMs };
}

function parseDuration(input: string): number {
  const m = /^(\d+)(s|m|h)?$/.exec(input.trim());
  if (!m) throw new Error(`Invalid duration: '${input}' (expected e.g. 30m, 1h, 60s).`);
  const value = Number(m[1]);
  const unit = m[2] ?? "s";
  const mult = unit === "s" ? 1_000 : unit === "m" ? 60_000 : 3_600_000;
  return value * mult;
}

function formatDuration(ms: number): string {
  if (ms >= 3_600_000 && ms % 3_600_000 === 0) return `${ms / 3_600_000}h`;
  if (ms >= 60_000 && ms % 60_000 === 0) return `${ms / 60_000}m`;
  return `${Math.round(ms / 1000)}s`;
}
