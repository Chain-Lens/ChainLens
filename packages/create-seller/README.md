# @chain-lens/create-seller

CLI for scaffolding, deploying, and registering a
[ChainLens](https://github.com/Chain-Lens/ChainLens) seller — a data wrapper
that agents pay in USDC to call.

## Before you start

> ⚠ **Run these commands in a plain directory, NOT inside a pnpm/yarn/npm
> workspace.** Workspace managers will detect the parent root and skip
> installing the scaffolded project's own `node_modules`, which breaks
> `pnpm dev`. A good home is `~/my-seller` or `~/Code/chain-lens-sellers/...`.

You will also need a Vercel account
([vercel.com/signup](https://vercel.com/signup)) — the `deploy` step uses
your local `vercel` CLI, which is **not bundled** with this package (see
[Why isn't vercel bundled?](#why-isnt-vercel-bundled)).

## Quickstart

```bash
# 0. One-time setup — install both CLIs and log into Vercel.
npm i -g @chain-lens/create-seller vercel
vercel login                                        # opens browser, pick your email

# 1. Scaffold (run from ~/ or similar, NOT inside a monorepo).
chain-lens-seller init my-seller --task-type defillama_tvl
cd my-seller
pnpm install                                        # or npm install / yarn

# 2. Implement your task handler in src/handler.ts.
#    The stub returns placeholder data — registering without editing it
#    means buyers will get garbage and the gateway will refund them.
pnpm dev                                            # local smoke test at :3000/health

# 3. Deploy to Vercel. `chain-lens-seller deploy` will check that
#    vercel is installed and logged in, then run `vercel --prod --yes`.
chain-lens-seller deploy

# 3a. IMPORTANT: disable Vercel deployment protection for this project.
#     New Vercel projects default to "Vercel Authentication" = enabled,
#     which puts every deployment behind a 401 auth-wall. That breaks the
#     gateway's /health probe AND every buyer call, so the seller cannot
#     function at all. See "Disable Vercel deployment protection" below
#     for a one-time click-through in the Vercel dashboard.

# 4. Register with the ChainLens gateway.
#    --wallet is your PUBLIC payout address (0x...), NEVER a private key.
#    --gateway defaults to https://chainlens.pelicanlab.dev/api — override with
#    --gateway <url> or $CHAIN_LENS_API_URL for self-hosted backends.
chain-lens-seller register \
  --task-type defillama_tvl \
  --price 0.05 \
  --wallet 0xYourPayoutAddress

# 5. Monitor jobs + health.
chain-lens-seller status --wallet 0xYourPayoutAddress
```

> Tip: if you'll run `register` / `status` a lot, set
> `export CHAIN_LENS_PAYOUT_ADDRESS=0x...` in your shell once and drop the
> `--wallet` flag. The CLI also reads `$CHAIN_LENS_API_URL` for custom
> gateways.

> One-shot alternative without global install:
> `npx -p @chain-lens/create-seller chain-lens-seller <cmd>`
> Note that `npx chain-lens-seller ...` alone 404s — `chain-lens-seller` is
> a bin name, not a package name on the registry.

## Commands

| Command | Purpose |
| --- | --- |
| `init <name>` | Copy a minimal Express seller template into `./<name>/` with `task_type`, `port`, and handler stub pre-filled. |
| `deploy` | Check `vercel --version` + `vercel whoami`, then run `vercel --prod --yes`. Saves the production URL to `.chain-lens-deploy.json`. |
| `register` | POST to `<gateway>/apis/register` with the deployed URL, task type, and price-per-call. `--wallet` is the public payout address (falls back to `$CHAIN_LENS_PAYOUT_ADDRESS`). `--gateway` defaults to the public MVP, or `$CHAIN_LENS_API_URL`. |
| `status` | GET `<gateway>/reputation/<seller>` + `<deployed-url>/health` for jobsCompleted/jobsFailed + uptime. Same wallet/gateway resolution as `register`. |

## Disable Vercel deployment protection

Every new Vercel project ships with **Vercel Authentication** enabled by
default. This makes every deployment (preview and production) return
`HTTP 401` unless the caller is a logged-in Vercel team member — which
means:

- The ChainLens gateway's automated `/health` probe fails, so your seller
  never leaves `PENDING`.
- Every paid buyer call gets `401` and is auto-refunded.

One-time fix (per project):

1. Open the project in the Vercel dashboard → **Settings** →
   **Deployment Protection**
   (`https://vercel.com/<team>/<project>/settings/deployment-protection`).
2. Find **Vercel Authentication** and toggle it to **Disabled**.
3. Save.

Verify with:

```bash
curl -i "$(jq -r .url .chain-lens-deploy.json)/health"
# HTTP/2 200 + {"status":"ok","seller":"...","capabilities":["..."]}
```

If your team policy forbids disabling protection on public endpoints,
you'll need a "Protection Bypass for Automation" token — ChainLens does
not currently support that path, so the only workable option today is
**Disabled**.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `pnpm dev` → `tsx: not found` | Scaffolded inside a pnpm/yarn/npm workspace — parent workspace hijacked install and skipped this project's `node_modules`. | Move the project outside the workspace (`mv my-seller ~/my-seller`), `rm -rf node_modules`, `pnpm install`. |
| `npx chain-lens-seller <cmd>` → **E404 Not Found** | `chain-lens-seller` is a bin name, not a package on npm. | `npm i -g @chain-lens/create-seller` then `chain-lens-seller <cmd>`, or `npx -p @chain-lens/create-seller chain-lens-seller <cmd>`. |
| `chain-lens-seller deploy` → `vercel CLI not found` | Vercel CLI not installed globally. | `npm i -g vercel`. |
| `chain-lens-seller deploy` → `vercel is not logged in` | Never ran `vercel login`, or token expired. | Run `vercel login` in this shell, then retry. |
| `/health` returns `HTTP 401` after deploy | Vercel Authentication (deployment protection) enabled on the project — default for new Vercel projects. | Disable it: see [Disable Vercel deployment protection](#disable-vercel-deployment-protection) above. |
| Seller stays `PENDING` forever on the gateway | Automated probe can't reach `/health` (usually Vercel auth-wall) or handler returns invalid JSON. | First check `/health` is publicly 200. Then verify your `src/handler.ts` output matches the task type schema. |
| Vercel build: `TS6059: File '...api/index.ts' is not under 'rootDir' 'src'` | Known bug in `create-seller` ≤ 0.0.2 templates. | In the scaffolded project, open `tsconfig.json` and delete the `"rootDir": "src"` line. Then change the `start` script in `package.json` to `"node dist/src/index.js"`. Fixed in 0.0.3. |
| `register` → `400 invalid_address` | `--wallet` is malformed or missing `0x`. | Paste a valid 0x-prefixed 20-byte address. |
| `register` → `400 invalid task_type` | Typoed task type. | Use one of `blockscout_contract_source`, `blockscout_tx_info`, `defillama_tvl`, `sourcify_verify`, `chainlink_price_feed`. |
| `status` → `seller_not_registered` (404) | Admin hasn't approved yet, or wrong wallet. | Wait and retry; double-check the wallet matches what you passed to `register`. |

## Intended for agent orchestration

This CLI is designed so an IDE agent (Claude Code, Cursor, Aider, etc.)
can drive the full onboarding with a single prompt. See
[SKILL.md](SKILL.md) for the agent-facing skill contract.

## Why isn't vercel bundled?

Tempting to make `npm i -g @chain-lens/create-seller` also drag in Vercel so
`deploy` works out-of-the-box, but:

- `vercel` is ~150 MB of transitive deps — doubles install time and disk
  usage for every user, even those who already have it globally.
- Bundling pins a single `vercel` version. When Vercel rev-bumps their CLI
  (breaking flags / auth tokens), you'd need a create-seller release to
  pick it up. Keeping it as a sibling install lets users upgrade on their
  own cadence.
- `vercel login` opens a browser and mints a long-lived token. Doing that
  during a package install (via `postinstall`) is a security smell — users
  can't audit what's opening the browser, and scripts can't prove they
  aren't phishing. It should stay an explicit, user-initiated step.

The CLI checks `vercel --version` and `vercel whoami` before every
`deploy` and prints a clear install/login hint if either is missing.

## Prerequisites

- Node.js 20+ and pnpm/npm.
- A Vercel account — [vercel.com/signup](https://vercel.com/signup).
- The `vercel` CLI installed and logged in (`npm i -g vercel && vercel login`).
- The payout wallet address you want to receive USDC on (Base Sepolia for
  the public MVP, Base Mainnet when addresses go live).

## License

MIT
