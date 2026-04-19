---
name: chain-lens-seller-onboarding
description: End-to-end: scaffold, deploy, and register a ChainLens seller so agents can pay it in USDC for data. Use when the user says "make my API a ChainLens seller", "onboard me to ChainLens", "register my wrapper with ChainLens", or similar.
---

# ChainLens seller onboarding skill

You are helping the user turn an API (theirs or a third-party's) into a
**ChainLens seller** — a paid data endpoint that agents discover on-chain
and call through the ChainLens gateway. The CLI that drives every step
is `@chain-lens/create-seller`. Your job is to orchestrate the four
commands below in order, confirming destructive or paid steps with the
user before running them.

## When to invoke

Trigger on requests like:

- "Register my API as a ChainLens seller."
- "Make my DeFiLlama wrapper available on ChainLens."
- "Onboard me as a seller — I want to receive USDC for API calls."

Do **not** invoke this skill for buyer-side work (that is the
`@chain-lens/mcp-tool` path — see `docs/BUYER_GUIDE.md`).

## Prerequisites to confirm with the user up front

Ask for each before running anything if it isn't already obvious from
the conversation:

1. **Working directory.** The project must live **outside any
   pnpm/yarn/npm workspace root.** A workspace manager will hijack
   `pnpm install` in the scaffolded project and skip writing its
   `node_modules`. A good home is `~/my-seller` or
   `~/Code/chain-lens-sellers/...`. Never scaffold inside another
   monorepo.
2. **Task type.** One of: `blockscout_contract_source`,
   `blockscout_tx_info`, `defillama_tvl`, `sourcify_verify`,
   `chainlink_price_feed`. If the user's API doesn't fit one, stop and
   tell them — custom task types need a contract-level registration
   that this CLI doesn't cover.
3. **Payout wallet address.** 0x-prefixed 20-byte **public** address on
   Base that will receive USDC. This is a PUBLIC address, NOT a private
   key — `register` / `status` never ask for a signing key. Never invent
   one — always ask. The CLI also reads `$CHAIN_LENS_PAYOUT_ADDRESS` as a
   fallback, so if the user mentions they've set that env var you can
   skip this prompt.
4. **Price per call (USDC).** Human-readable, e.g. `0.05`. The CLI
   converts to 6-decimal wei.
5. **Gateway URL.** The CLI defaults to the public MVP
   (`https://chainlens.pelicanlab.dev/api`) — no flag needed for typical
   onboarding. Only ask / pass `--gateway` (or set `$CHAIN_LENS_API_URL`)
   if the user is running ChainLens locally (`http://localhost:3001/api`)
   or has a self-hosted backend.
6. **Vercel account.** The deploy step uses their local `vercel` CLI
   login. If `vercel whoami` fails, ask the user to run `vercel login`
   — **do not attempt to log in on their behalf**.

Install the CLI once globally so subsequent steps can use the short
`chain-lens-seller` bin directly:

```bash
npm install -g @chain-lens/create-seller
```

The one-shot `npx -p @chain-lens/create-seller chain-lens-seller <cmd>`
form also works. **`npx chain-lens-seller <cmd>` alone will 404** — the
registry has no package of that name; the string is just a bin shipped
inside `@chain-lens/create-seller`.

## The four-command flow

### 1. Scaffold (only if they don't have a project yet)

```bash
npm create chain-lens-seller@latest <name> -- \
  --task-type <task_type> \
  --port 3000
```

Equivalent one-shot without the `npm create` shim:
`npx -p @chain-lens/create-seller create-chain-lens-seller <name> --task-type <task_type> --port 3000`.

Creates `./<name>/` with `src/handler.ts`, `src/server.ts`, Vercel
config, and a `README.md`. After running, **stop and ask the user to
fill in `src/handler.ts`** — the stub returns placeholder data. Do not
auto-implement the handler unless the user asks; each task type has a
specific JSON schema the gateway enforces, and guessing the wrong shape
causes automatic refunds.

If the user already has a working HTTP endpoint on a different stack
(Fastify, Hono, Next.js route, etc.), skip this step — as long as it
answers `POST /` with `{ task_type, inputs }` and returns matching
JSON, that's enough. They can skip straight to step 3 with
`--endpoint`.

### 2. Deploy to Vercel (inside the project dir)

```bash
cd <name>
chain-lens-seller deploy
```

Wraps `vercel --prod --yes`. Writes the resulting URL to
`.chain-lens-deploy.json`. If `vercel` isn't installed or the user isn't
logged in, stop and surface the real error — don't paper over it.

After deploy, smoke-test before registering:

```bash
curl -sS "$(jq -r .url .chain-lens-deploy.json)/health"
```

Expect `{"status":"ok","seller":"<name>","capabilities":["<task_type>"]}`.
If the health check fails, fix the deployment first — registering a
dead endpoint wastes admin review time.

**Very common failure at this step: Vercel deployment protection.** New
Vercel projects have **Vercel Authentication** enabled by default, which
returns `HTTP 401` on every deployment. The gateway's automated probe
fails → the seller is stuck `PENDING` forever, and every buyer call is
auto-refunded. If the curl above returns 401, stop and tell the user to
disable protection:

1. Open the Vercel dashboard → Project → **Settings** → **Deployment
   Protection**.
2. Set **Vercel Authentication** to **Disabled** and save.
3. Re-run the curl. Expect 200.

Do **not** try to automate this — the setting lives in the Vercel
dashboard, and the user must consent (it makes the endpoint public).

### 3. Register with the gateway

```bash
chain-lens-seller register \
  --task-type <task_type> \
  --price <usdc_amount> \
  --wallet <0x...> \
  [--endpoint <url>]     # defaults to .chain-lens-deploy.json
  [--gateway <url>]      # defaults to $CHAIN_LENS_API_URL
```

The CLI POSTs to `/apis/register` on the gateway. The seller then sits
in `PENDING` while the automated probe runs (schema validation +
prompt-injection scan) and an admin approves.

### 4. Monitor

```bash
chain-lens-seller status --wallet <0x...>
```

Prints `jobsCompleted` / `jobsFailed` / `totalEarnings` from the
gateway's reputation endpoint, and pings `/health` on the deployed
seller if `.chain-lens-deploy.json` is present.

## Secrets and safety

- **Never put a private key into the seller project.** The seller is a
  public HTTP endpoint; it does not sign transactions. The payout
  wallet is recorded on-chain at register time and never exposed to
  the seller process.
- **Never run `vercel login` for the user.** It opens a browser and
  mints an auth token — the user must do that themselves.
- **Don't invent a wallet address.** If the user doesn't give you one,
  ask. A typo at register time means USDC payouts go to an address
  they don't control.
- **Confirm before the paid / public steps** (`deploy`, `register`) —
  `init` and `status` are safe to run without confirmation.

## Troubleshooting

| Symptom | Cause | Action |
| --- | --- | --- |
| `pnpm dev` → `tsx: not found` | Scaffolded inside a pnpm/yarn/npm workspace — parent workspace hijacked install and skipped the project's own `node_modules`. | Move the project outside the workspace, `rm -rf node_modules`, `pnpm install`, retry. |
| `npx chain-lens-seller <cmd>` → **E404 Not Found** | `chain-lens-seller` is a bin name, not a package on npm. | `npm i -g @chain-lens/create-seller` then `chain-lens-seller <cmd>`, or `npx -p @chain-lens/create-seller chain-lens-seller <cmd>`. Never try to install `chain-lens-seller` directly. |
| `vercel CLI not found` | Local `vercel` missing | Tell user to `npm i -g vercel && vercel login`; do not install silently. |
| `vercel is not logged in` | Never ran `vercel login`, or token expired | Tell the user to run `vercel login` in this shell; **do not run it on their behalf** (opens browser, mints a long-lived token — must be user-initiated). |
| `/health` returns `HTTP 401` after deploy | Vercel Authentication (deployment protection) enabled on the project — default for new Vercel projects. | Tell the user to open the Vercel dashboard → Settings → Deployment Protection → set **Vercel Authentication** to **Disabled**. Cannot be automated; requires user consent in dashboard. |
| Seller stuck `PENDING` on the gateway | Automated probe can't reach `/health` (usually Vercel auth-wall) or handler returns invalid JSON. | First confirm `/health` is publicly 200 (see Vercel protection row above). Then verify handler output matches the task-type schema in `@chain-lens/shared`. |
| Vercel build: `TS6059 ... is not under 'rootDir' 'src'` | Known bug in create-seller ≤ 0.0.2 templates — `tsconfig.json` had `rootDir: "src"` while `include` listed `api/`. | In the scaffolded project delete the `"rootDir": "src"` line in `tsconfig.json`, then change `package.json` `start` → `"node dist/src/index.js"`. Fixed in 0.0.3. |
| `Could not find a deployment URL in vercel output` | User not logged in or project not linked | Ask user to run `vercel link` in the dir, then retry. |
| Register 400 `invalid_address` | `--wallet` is malformed | Re-prompt for the address. |
| Register 400 on `category` / `task_type` | Typoed task type | Re-check against the list of valid task types. |
| Register 500 | Gateway down or DB unreachable | Surface the gateway URL; ask user to check backend logs. |
| `status` → `seller_not_registered` (404) | Admin hasn't approved yet, or wrong wallet | Wait and re-run; confirm wallet matches `--wallet` from register step. |

## Non-goals for this skill

- Publishing your `mcp-tool` / `shared` packages to npm — that's a
  separate developer task, not part of seller onboarding.
- Setting `CHAIN_LENS_API_URL` / gateway authentication on the buyer
  side — that's `docs/BUYER_GUIDE.md`.
- Writing the handler logic against a specific upstream API — the
  human implements that in `src/handler.ts`. You can offer to help
  once asked, but respect the task-type schema in
  `@chain-lens/shared/task-types`.
