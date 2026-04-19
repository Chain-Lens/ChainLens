import { readDeployState } from "./deploy.js";
import { DEFAULT_PUBLIC_GATEWAY } from "./register.js";

export interface StatusOptions {
  sellerAddress: string;
  gatewayUrl: string;
  healthUrl: string | null;
}

export interface StatusDeps {
  cwd: string;
  env: NodeJS.ProcessEnv;
  fetch: typeof fetch;
  readDeployState: (cwd: string) => Promise<{ url: string } | null>;
  stdout: (msg: string) => void;
}

export interface ReputationView {
  jobsCompleted: string;
  jobsFailed: string;
  totalEarnings: string;
  reputationBps?: string;
  [k: string]: unknown;
}

export interface HealthView {
  ok: boolean;
  status?: number;
  body?: unknown;
  error?: string;
}

const STATUS_HELP = `chain-lens-seller status [options]

Options:
  --wallet <0x...>   Seller payout PUBLIC address. Falls back to
                     \$CHAIN_LENS_PAYOUT_ADDRESS. Never a private key.
  --gateway <url>    Backend URL. Falls back to \$CHAIN_LENS_API_URL,
                     then ${DEFAULT_PUBLIC_GATEWAY}.

Reports on-chain reputation (jobsCompleted / jobsFailed / totalEarnings)
plus a liveness check against the deployed /health endpoint if a
.chain-lens-deploy.json is present.
`;

function normalize(raw: string): string {
  return raw.replace(/\/+$/, "");
}

function extractErrorMessage(body: unknown, fallback: string): string {
  if (typeof body === "string" && body.length > 0) return body;
  if (typeof body !== "object" || body === null) return fallback;
  const rec = body as Record<string, unknown>;
  const candidate = rec.error ?? rec.message ?? rec.detail;
  if (typeof candidate === "string") return candidate;
  if (candidate && typeof candidate === "object") {
    const nested = candidate as Record<string, unknown>;
    if (typeof nested.message === "string") return nested.message;
    return JSON.stringify(candidate);
  }
  return JSON.stringify(body);
}

export async function parseStatusArgs(
  argv: string[],
  deps: Pick<StatusDeps, "cwd" | "env" | "readDeployState">,
): Promise<StatusOptions> {
  let wallet: string | null = null;
  let gateway: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--wallet") wallet = argv[++i] ?? null;
    else if (arg === "--gateway") gateway = argv[++i] ?? null;
    else if (arg === "--help" || arg === "-h") throw new Error(STATUS_HELP);
    else throw new Error(`status: unexpected argument "${arg}"\n\n${STATUS_HELP}`);
  }

  if (!wallet) wallet = deps.env.CHAIN_LENS_PAYOUT_ADDRESS ?? null;
  if (!wallet) {
    throw new Error(
      `status: payout address required. Pass --wallet 0x... or set $CHAIN_LENS_PAYOUT_ADDRESS.\n\n${STATUS_HELP}`,
    );
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    throw new Error(`status: wallet "${wallet}" is not a 0x-prefixed 20-byte address`);
  }

  const gatewayUrl = normalize(
    gateway ?? deps.env.CHAIN_LENS_API_URL ?? DEFAULT_PUBLIC_GATEWAY,
  );
  const deployState = await deps.readDeployState(deps.cwd);
  const healthUrl = deployState ? `${normalize(deployState.url)}/health` : null;

  return { sellerAddress: wallet, gatewayUrl, healthUrl };
}

export async function fetchReputation(
  opts: Pick<StatusOptions, "sellerAddress" | "gatewayUrl">,
  deps: Pick<StatusDeps, "fetch">,
): Promise<ReputationView | { error: string; status?: number }> {
  const res = await deps.fetch(`${opts.gatewayUrl}/reputation/${opts.sellerAddress}`);
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg = extractErrorMessage(body, res.statusText);
    return { error: msg, status: res.status };
  }
  return body as ReputationView;
}

export async function fetchHealth(
  url: string,
  deps: Pick<StatusDeps, "fetch">,
): Promise<HealthView> {
  try {
    const res = await deps.fetch(url);
    let body: unknown;
    try {
      body = await res.clone().json();
    } catch {
      body = await res.text();
    }
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function runStatus(
  opts: StatusOptions,
  deps: Pick<StatusDeps, "fetch" | "stdout">,
): Promise<{ reputation: ReputationView | { error: string }; health: HealthView | null }> {
  deps.stdout(`Seller: ${opts.sellerAddress}\nGateway: ${opts.gatewayUrl}\n\n`);

  const reputation = await fetchReputation(opts, deps);
  if ("error" in reputation) {
    const status = "status" in reputation && reputation.status ? ` (${reputation.status})` : "";
    deps.stdout(`Reputation: ${reputation.error}${status}\n`);
  } else {
    deps.stdout(
      `Reputation\n` +
        `  jobsCompleted: ${reputation.jobsCompleted}\n` +
        `  jobsFailed:    ${reputation.jobsFailed}\n` +
        `  totalEarnings: ${reputation.totalEarnings} (USDC, 6 decimals)\n` +
        (reputation.reputationBps ? `  reputationBps: ${reputation.reputationBps}\n` : "") +
        `\n`,
    );
  }

  let health: HealthView | null = null;
  if (opts.healthUrl) {
    health = await fetchHealth(opts.healthUrl, deps);
    deps.stdout(
      `Health (${opts.healthUrl})\n` +
        (health.ok
          ? `  ok ${health.status} ${typeof health.body === "object" ? JSON.stringify(health.body) : ""}\n`
          : health.error
            ? `  unreachable: ${health.error}\n`
            : `  not ok: ${health.status}\n`),
    );
  } else {
    deps.stdout(`Health: no .chain-lens-deploy.json — skip\n`);
  }

  return { reputation, health };
}

export async function statusCommand(args: string[]): Promise<void> {
  const deps: StatusDeps = {
    cwd: process.cwd(),
    env: process.env,
    fetch: globalThis.fetch.bind(globalThis),
    readDeployState,
    stdout: (m) => process.stdout.write(m),
  };
  const opts = await parseStatusArgs(args, deps);
  await runStatus(opts, deps);
}
