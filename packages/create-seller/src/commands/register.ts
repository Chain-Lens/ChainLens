import { basename } from "node:path";
import { readDeployState } from "./deploy.js";

export interface RegisterOptions {
  name: string;
  description: string;
  taskType: string;
  priceUsdcWei: string;
  sellerAddress: string;
  endpoint: string;
  gatewayUrl: string;
}

export interface RegisterDeps {
  cwd: string;
  env: NodeJS.ProcessEnv;
  fetch: typeof fetch;
  readDeployState: (cwd: string) => Promise<{ url: string } | null>;
  stdout: (msg: string) => void;
}

const VALID_TASK_TYPES = new Set([
  "blockscout_contract_source",
  "blockscout_tx_info",
  "defillama_tvl",
  "sourcify_verify",
  "chainlink_price_feed",
]);

const USDC_DECIMALS = 6;

export const DEFAULT_PUBLIC_GATEWAY = "https://chainlens.pelicanlab.dev/api";

const REGISTER_HELP = `chain-lens-seller register [options]

Options:
  --task-type <id>      Task type (required unless set in package.json).
  --price <usdc>        Price per call in USDC (e.g. 0.05). Required.
  --wallet <0x...>      Payout PUBLIC address (0x-prefixed, 20 bytes).
                        NEVER pass a private key here — this value is
                        registered on-chain and receives USDC payouts.
                        Falls back to \$CHAIN_LENS_PAYOUT_ADDRESS.
  --name <string>       Listing name (default: directory basename).
  --description <text>  Listing description.
  --endpoint <url>      Seller URL (default: read from .chain-lens-deploy.json).
  --gateway <url>       Backend URL. Falls back to \$CHAIN_LENS_API_URL,
                        then ${DEFAULT_PUBLIC_GATEWAY}.

Valid task types:
  blockscout_contract_source, blockscout_tx_info, defillama_tvl,
  sourcify_verify, chainlink_price_feed
`;

export function parsePriceToWei(price: string): string {
  // USDC has 6 decimals. Accept "0.05" → "50000", "1" → "1000000", "1.000001" → "1000001".
  if (!/^\d+(\.\d+)?$/.test(price)) {
    throw new Error(`register: --price "${price}" is not a valid decimal number`);
  }
  const [whole, frac = ""] = price.split(".");
  if (frac.length > USDC_DECIMALS) {
    throw new Error(
      `register: --price has ${frac.length} fraction digits, USDC supports at most ${USDC_DECIMALS}`,
    );
  }
  const padded = (frac + "0".repeat(USDC_DECIMALS)).slice(0, USDC_DECIMALS);
  const asString = (whole + padded).replace(/^0+(?=\d)/, "");
  return asString === "" ? "0" : asString;
}

export function normalizeGatewayUrl(raw: string): string {
  return raw.replace(/\/+$/, "");
}

export async function parseRegisterArgs(
  argv: string[],
  deps: Pick<RegisterDeps, "cwd" | "env" | "readDeployState">,
): Promise<RegisterOptions> {
  let name: string | null = null;
  let description: string | null = null;
  let taskType: string | null = null;
  let price: string | null = null;
  let wallet: string | null = null;
  let endpoint: string | null = null;
  let gatewayUrl: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const val = () => argv[++i];
    if (arg === "--name") name = val() ?? null;
    else if (arg === "--description") description = val() ?? null;
    else if (arg === "--task-type") taskType = val() ?? null;
    else if (arg === "--price") price = val() ?? null;
    else if (arg === "--wallet") wallet = val() ?? null;
    else if (arg === "--endpoint") endpoint = val() ?? null;
    else if (arg === "--gateway") gatewayUrl = val() ?? null;
    else if (arg === "--help" || arg === "-h") throw new Error(REGISTER_HELP);
    else throw new Error(`register: unexpected argument "${arg}"\n\n${REGISTER_HELP}`);
  }

  if (!taskType) throw new Error(`register: --task-type is required\n\n${REGISTER_HELP}`);
  if (!VALID_TASK_TYPES.has(taskType)) {
    throw new Error(
      `register: --task-type must be one of:\n  ${[...VALID_TASK_TYPES].join("\n  ")}`,
    );
  }
  if (!price) throw new Error(`register: --price is required`);
  if (!wallet) wallet = deps.env.CHAIN_LENS_PAYOUT_ADDRESS ?? null;
  if (!wallet) {
    throw new Error(
      `register: payout address required. Pass --wallet 0x... or set $CHAIN_LENS_PAYOUT_ADDRESS.\n` +
        `NOTE: this is your PUBLIC wallet address (the one that receives USDC), NOT a private key.\n\n${REGISTER_HELP}`,
    );
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    throw new Error(
      `register: wallet "${wallet}" is not a 0x-prefixed 20-byte address. ` +
        `This must be a PUBLIC address (starts with 0x, 42 chars total) — never a private key.`,
    );
  }

  const priceUsdcWei = parsePriceToWei(price);

  if (!endpoint) {
    const state = await deps.readDeployState(deps.cwd);
    if (!state) {
      throw new Error(
        `register: --endpoint not given and no ${".chain-lens-deploy.json"} in cwd — run \`chain-lens-seller deploy\` first or pass --endpoint explicitly`,
      );
    }
    endpoint = state.url;
  }
  try {
    new URL(endpoint);
  } catch {
    throw new Error(`register: --endpoint "${endpoint}" is not a valid URL`);
  }

  if (!name) name = basename(deps.cwd);
  if (!description) description = `ChainLens seller for ${taskType}`;

  gatewayUrl = normalizeGatewayUrl(
    gatewayUrl ?? deps.env.CHAIN_LENS_API_URL ?? DEFAULT_PUBLIC_GATEWAY,
  );

  return {
    name,
    description,
    taskType,
    priceUsdcWei,
    sellerAddress: wallet,
    endpoint,
    gatewayUrl,
  };
}

export async function runRegister(
  opts: RegisterOptions,
  deps: Pick<RegisterDeps, "fetch" | "stdout">,
): Promise<unknown> {
  const payload = {
    name: opts.name,
    description: opts.description,
    endpoint: opts.endpoint,
    price: opts.priceUsdcWei,
    sellerAddress: opts.sellerAddress,
    category: opts.taskType,
  };

  deps.stdout(
    `Registering ${opts.name}\n  task=${opts.taskType} price=${opts.priceUsdcWei} wei (USDC)\n  endpoint=${opts.endpoint}\n  gateway=${opts.gatewayUrl}\n`,
  );

  const url = `${opts.gatewayUrl}/apis/register`;
  let res: Response;
  try {
    res = await deps.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw new Error(
      `register: could not reach gateway at ${url}. Check --gateway / $CHAIN_LENS_API_URL and your network.`,
      { cause: err },
    );
  }

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }

  if (!res.ok) {
    throw new Error(
      `register: gateway responded ${res.status}\n${typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2)}`,
    );
  }

  deps.stdout(
    `\nRegistered. Awaiting admin approval + automated probe (see /marketplace).\n${JSON.stringify(parsed, null, 2)}\n`,
  );
  return parsed;
}

export async function registerCommand(args: string[]): Promise<void> {
  const deps: RegisterDeps = {
    cwd: process.cwd(),
    env: process.env,
    fetch: globalThis.fetch.bind(globalThis),
    readDeployState,
    stdout: (m) => process.stdout.write(m),
  };
  const opts = await parseRegisterArgs(args, deps);
  await runRegister(opts, deps);
}
