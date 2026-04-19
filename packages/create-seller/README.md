# @chainlens/create-seller

CLI for scaffolding, deploying, and registering a
[ChainLens](https://github.com/lejuho/ChainLens) seller — a data wrapper
that agents pay in USDC to call.

```bash
# 1. Scaffold a new seller project
npx @chainlens/create-seller init my-seller

# 2. Implement your task handler in src/handler.ts, then deploy
cd my-seller
npx @chainlens/create-seller deploy

# 3. Register the deployed endpoint with the gateway
npx @chainlens/create-seller register \
  --task-type defillama_tvl \
  --price 0.05 \
  --wallet 0xYourPayoutAddress
```

## Commands

| Command | Purpose |
| --- | --- |
| `init <name>` | Copy a minimal Express seller template into `./<name>/` with `task_type`, `port`, and handler stub pre-filled. |
| `deploy` | Wrap `vercel --prod`. Requires `vercel login` once, then the CLI reads the production URL from Vercel's output. |
| `register` | POST to `<gateway>/api/sellers/register` with the deployed URL, capabilities, and price-per-call. |
| `status` | GET `<gateway>/api/reputation/<seller>` for jobsCompleted/jobsFailed counters. |

## Intended for agent orchestration

This CLI is designed so an IDE agent (Claude Code, Cursor, Aider, etc.)
can drive the full onboarding with a single prompt. See
[SKILL.md](SKILL.md) for the agent-facing skill contract.

## Prerequisites

- Node.js 20+ and pnpm/npm.
- A Vercel account (for `deploy`) — [vercel.com/signup](https://vercel.com/signup).
- The payout wallet address you want to receive USDC on (Base).

## License

MIT
