import { readDeployState } from "./deploy.js";
import { DEFAULT_PUBLIC_GATEWAY, deriveWebUrl } from "./register.js";

export interface StatusOptions {
  sellerAddress: string;
  gatewayUrl: string;
  webUrl: string;
  healthUrl: string | null;
}

export interface ListingView {
  id: string;
  onChainId: number | null;
  name: string;
  price: string;
  category: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "REVOKED" | string;
  createdAt: string;
  _count: { payments: number };
  rejectionReason?: string | null;
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

Reports:
  - Listings (name / status / onChainId / price / sales) from the gateway.
  - On-chain reputation (jobsCompleted / jobsFailed / totalEarnings).
  - /health ping of the deployed seller if .chain-lens-deploy.json is present.

Prints the web-dashboard URL at the end — endpoint URLs are only visible
there after Sign in with this wallet (public API omits them by design).
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
  const webUrl = deriveWebUrl(gatewayUrl, deps.env);
  const deployState = await deps.readDeployState(deps.cwd);
  const healthUrl = deployState ? `${normalize(deployState.url)}/health` : null;

  return { sellerAddress: wallet, gatewayUrl, webUrl, healthUrl };
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

// GET /apis/seller/:address — public endpoint, no auth needed. Endpoint
// URL is omitted by the backend (it's only visible through the auth'd
// /seller/listings path used by the web dashboard); we still get
// name/status/onChainId/price/sales which is enough to answer "did my
// listing get approved?" from the terminal.
export async function fetchListings(
  opts: Pick<StatusOptions, "sellerAddress" | "gatewayUrl">,
  deps: Pick<StatusDeps, "fetch">,
): Promise<ListingView[] | { error: string; status?: number }> {
  const res = await deps.fetch(
    `${opts.gatewayUrl}/apis/seller/${opts.sellerAddress}`,
  );
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    return { error: extractErrorMessage(body, res.statusText), status: res.status };
  }
  if (!Array.isArray(body)) {
    return { error: "listings: unexpected response shape", status: res.status };
  }
  return body as ListingView[];
}

// Renders a USDC price (6-decimal wei string from the backend) back to
// a human-readable decimal. Trims trailing zeros so "50000" → "0.05"
// instead of "0.050000".
function formatPriceUsdc(priceWei: string): string {
  if (!/^\d+$/.test(priceWei)) return priceWei;
  const padded = priceWei.padStart(7, "0");
  const whole = padded.slice(0, -6);
  const frac = padded.slice(-6).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

export function renderListingsTable(items: ListingView[]): string {
  if (items.length === 0) {
    return "  (no listings registered with this wallet)\n";
  }
  const rows = items.map((l) => ({
    name: l.name,
    status: l.status,
    onChainId: l.onChainId == null ? "—" : String(l.onChainId),
    price: `${formatPriceUsdc(l.price)} USDC`,
    sales: String(l._count?.payments ?? 0),
  }));
  const headers = {
    name: "NAME",
    status: "STATUS",
    onChainId: "ONCHAIN_ID",
    price: "PRICE",
    sales: "SALES",
  };
  const widths = {
    name: Math.max(headers.name.length, ...rows.map((r) => r.name.length)),
    status: Math.max(headers.status.length, ...rows.map((r) => r.status.length)),
    onChainId: Math.max(
      headers.onChainId.length,
      ...rows.map((r) => r.onChainId.length),
    ),
    price: Math.max(headers.price.length, ...rows.map((r) => r.price.length)),
    sales: Math.max(headers.sales.length, ...rows.map((r) => r.sales.length)),
  };
  const line = (r: typeof headers) =>
    `  ${r.name.padEnd(widths.name)}  ${r.status.padEnd(widths.status)}  ${r.onChainId.padEnd(widths.onChainId)}  ${r.price.padEnd(widths.price)}  ${r.sales.padEnd(widths.sales)}\n`;
  let out = line(headers);
  for (const r of rows) out += line(r);
  // Surface the most recent rejection reason below the table, if any.
  const rejected = items.find(
    (l) => l.status === "REJECTED" && l.rejectionReason,
  );
  if (rejected) {
    out += `  ↳ latest rejection (${rejected.name}): ${rejected.rejectionReason}\n`;
  }
  return out;
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
): Promise<{
  reputation: ReputationView | { error: string };
  listings: ListingView[] | { error: string };
  health: HealthView | null;
}> {
  deps.stdout(`Seller: ${opts.sellerAddress}\nGateway: ${opts.gatewayUrl}\n\n`);

  const listings = await fetchListings(opts, deps);
  if ("error" in listings) {
    const status =
      "status" in listings && listings.status ? ` (${listings.status})` : "";
    deps.stdout(`Listings: ${listings.error}${status}\n\n`);
  } else {
    deps.stdout(`Listings (${listings.length})\n`);
    deps.stdout(renderListingsTable(listings));
    deps.stdout(`\n`);
  }

  const reputation = await fetchReputation(opts, deps);
  if ("error" in reputation) {
    const status = "status" in reputation && reputation.status ? ` (${reputation.status})` : "";
    deps.stdout(`Reputation: ${reputation.error}${status}\n\n`);
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

  // Endpoint URL is only visible to the authed seller on the web; the
  // listings table above deliberately omits it (public API, same reason).
  // Point the user at /seller so they can verify the stored URL matches
  // what they registered.
  deps.stdout(
    `\nWeb dashboard: ${opts.webUrl}/seller  (connect wallet → Sign in as seller to view/edit endpoint)\n`,
  );

  return { reputation, listings, health };
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
