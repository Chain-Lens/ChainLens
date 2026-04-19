import { readDeployState } from "./deploy.js";

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

const STATUS_HELP = `chainlens-seller status [options]

Options:
  --wallet <0x...>   Seller payout address (required).
  --gateway <url>    Backend URL (default: \$CHAINLENS_API_URL or http://localhost:3001/api).

Reports on-chain reputation (jobsCompleted / jobsFailed / totalEarnings)
plus a liveness check against the deployed /health endpoint if a
.chainlens-deploy.json is present.
`;

function normalize(raw: string): string {
  return raw.replace(/\/+$/, "");
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

  if (!wallet) throw new Error(`status: --wallet is required\n\n${STATUS_HELP}`);
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    throw new Error(`status: --wallet "${wallet}" is not a 0x-prefixed 20-byte address`);
  }

  const gatewayUrl = normalize(
    gateway ?? deps.env.CHAINLENS_API_URL ?? "http://localhost:3001/api",
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
    const msg =
      typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: unknown }).error)
        : typeof body === "string"
          ? body
          : res.statusText;
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
    deps.stdout(`Reputation: ${reputation.error}\n`);
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
    deps.stdout(`Health: no .chainlens-deploy.json — skip\n`);
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
