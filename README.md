# ChainLens

> A **Web2-data relay market** for autonomous agents on Base. Agents discover
> verified data sellers, pay in USDC through escrow, and receive
> schema-validated, hash-committed responses in one round-trip — no API keys,
> no OAuth, just a wallet.

**Type 2 MVP (Base Sepolia)**

| Contract                               | Address                                      |
| -------------------------------------- | -------------------------------------------- |
| `ApiMarketEscrowV2`                    | `0x1F7dE3fdDA5216236c7F413F2AD03bF19A3F319E` |
| `SellerRegistry` (ERC-8004 compatible) | `0xcF36b76b5Da55471D4EBB5349A0653624371BE2c` |
| `TaskTypeRegistry`                     | `0xD2ab227417B26f4d8311594C27c59adcA046501F` |
| USDC (payment token)                   | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

---

## What is ChainLens?

ChainLens solves a narrow but painful problem for AI agents: **how do I know
the data an external API just gave me is real, and how do I pay for it
without leaking a credit card?**

Every request follows a fixed lifecycle on-chain:

1. Buyer approves USDC and calls `createJob(seller, taskType, amount, inputsHash, apiId)`.
2. The gateway calls the seller's HTTP endpoint, validates the response
   against the task type's JSON schema, scans for prompt-injection strings,
   and computes `keccak256(response)` as `responseHash`.
3. If the response is clean, the gateway calls `submitJob(jobId, responseHash, evidenceURI)`
   on-chain and records a success in `SellerRegistry`. Otherwise it calls
   `refund(jobId)` and records a failure.
4. Any client can later fetch `GET /api/evidence/:jobId`, recompute the hash,
   and confirm it matches the on-chain commitment.

This means the seller's reputation is on-chain, the payment is on-chain, and
every answer is independently verifiable.

---

## Monorepo layout

| Package                                              | Purpose                                                                                                                                                                          |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`packages/contracts`](packages/contracts)           | `ApiMarketEscrowV2`, `SellerRegistry`, `TaskTypeRegistry`, `MockUSDC`. Hardhat + Ignition.                                                                                       |
| [`packages/backend`](packages/backend)               | Express gateway: `/api/apis`, `/api/jobs`, `/api/evidence/:jobId`, `/api/reputation/:addr`. Listens for v2 events and finalizes jobs.                                            |
| [`packages/frontend`](packages/frontend)             | Next.js 15 marketplace, evidence explorer, reputation pages.                                                                                                                     |
| [`packages/shared`](packages/shared)                 | Contract ABIs, addresses, task type registry, chain configs.                                                                                                                     |
| [`packages/mcp-tool`](packages/mcp-tool)             | `@chain-lens/mcp-tool` — MCP server with `chain-lens.discover` / `inspect` / `status`, plus paid `request` (legacy v2) and `call` (current v3 x402) when a signer is configured. |
| [`packages/sample-sellers`](packages/sample-sellers) | Reference seller agents (Blockscout / DeFiLlama / Sourcify) + Dockerfiles.                                                                                                       |

---

## Initial task types

Registered at deploy time (spec §8):

| Task type                    | Description                              |
| ---------------------------- | ---------------------------------------- |
| `blockscout_contract_source` | Verified contract source code + ABI      |
| `blockscout_tx_info`         | Transaction details (gas, value, status) |
| `defillama_tvl`              | DeFi protocol TVL + per-chain breakdown  |
| `sourcify_verify`            | Contract bytecode verification status    |
| `chainlink_price_feed`       | On-chain price oracle read               |

Each has a JSON schema the gateway enforces before `responseHash` is
committed. Bad responses trigger refund + reputation penalty automatically.

---

## Quick start

```bash
pnpm install
cp .env.example .env                                  # fill PLATFORM_URL, PRIVATE_KEY, DATABASE_URL
docker compose up -d                                  # postgres
pnpm --filter @chain-lens/backend db:migrate
pnpm dev                                              # starts backend + frontend
```

Run a sample seller in another terminal:

```bash
pnpm --filter @chain-lens/sample-sellers dev:defillama # :8082
```

- **Buyers:** [docs/BUYER_GUIDE.md](docs/BUYER_GUIDE.md) — wallet setup,
  Claude Desktop config, first query, evidence verification.
- **Sellers:** [packages/create-seller](packages/create-seller) +
  [SKILL.md](packages/create-seller/SKILL.md) — `npx @chain-lens/create-seller init`,
  deploy, register, monitor. An IDE agent (Claude Code, Cursor) can
  drive the whole flow from the SKILL.md.
- **Provider drafts:** [docs/PROVIDER_DRAFT_API.md](docs/PROVIDER_DRAFT_API.md) —
  GitHub directory metadata can become a claimable ChainLens draft before
  wallet-based seller registration.
- **Demos:** [docs/DEMO.md](docs/DEMO.md) — three end-to-end scenarios
  (browser buyer, MCP agent, seller onboarding).

---

## Agent integration (MCP)

The [`@chain-lens/mcp-tool`](packages/mcp-tool) package exposes read tools
(`chain-lens.discover`, `chain-lens.inspect`, `chain-lens.status`) plus paid
tools when a signer is configured. `chain-lens.call` is the current v3 x402
path; `chain-lens.request` remains available for the legacy v2 escrow flow.
Install with `npx` — no clone required:

```jsonc
// ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "chain-lens": {
      "command": "npx",
      "args": ["-y", "@chain-lens/mcp-tool"],
      "env": {
        "CHAIN_LENS_API_URL": "https://your-chain-lens/api",
        "CHAIN_ID": "84532",
        "RPC_URL": "https://base-sepolia.g.alchemy.com/v2/<YOUR_KEY>",
        "WALLET_PRIVATE_KEY": "0x...",
      },
    },
  },
}
```

Tools:

- `chain-lens.discover` — search v3 listings via `GET /api/market/listings`
- `chain-lens.inspect` — deep-dive on one listing via `GET /api/market/listings/:id`
- `chain-lens.status` — fetch stored evidence for a job id
- `chain-lens.call` — current paid v3 x402 flow
- `chain-lens.request` — legacy paid v2 escrow flow

`WALLET_PRIVATE_KEY` is optional; without it the agent can still `discover`,
`inspect`, and read `status`, just not spend.

## HTTP x402 endpoint

An alternative to the MCP path is the plain-HTTP x402 facade. Any x402-aware
HTTP client can negotiate payment without installing `@chain-lens/mcp-tool`.

```bash
# 1. Call the listing-specific x402 endpoint without payment to inspect terms
curl -i https://chainlens.pelicanlab.dev/api/x402/<listingId>

# 2. Sign a USDC ReceiveWithAuthorization for ChainLensMarket, encode it as
#    X-Payment, then retry the GET with inputs in the query string:
curl -H "X-Payment: <base64url-json>" \
  "https://chainlens.pelicanlab.dev/api/x402/<listingId>?protocol=lido"
# → { jobRef, settleTxHash, delivery, untrusted_data, ... }
```

The x402 payload is listing-specific and the retry path is the current v3
market flow. The gateway settles on-chain only after the seller response
passes execution checks; failed seller calls drop the signed authorization so
no USDC moves.

Standard x402 clients can parse the 402 response but need ChainLens-aware
signing logic to complete payment — the `mcp-tool` package bundles this.

---

## Becoming a seller — wrapper contract

The `endpoint` registered in a listing is called **by the ChainLens gateway**,
not directly by buyers. Every job the gateway receives gets forwarded to
the seller as:

```http
POST <your endpoint>
Content-Type: application/json

{
  "task_type": "defillama_tvl",
  "inputs": { "protocol": "lido" },
  "jobId": "42",
  "buyer": "0x..."
}
```

The response must be JSON matching the task type's `schemaURI` registered
in `TaskTypeRegistry`. A response that doesn't parse, doesn't match the
schema, or trips the prompt-injection scan is refunded to the buyer
automatically.

Pointing `endpoint` at a raw upstream (e.g. `api.llama.fi/...`,
`blockscout.com/api/...`) is the most common cause of refunds right
after registration — those services don't accept this POST shape.
Use one of the wrappers in
[`packages/sample-sellers`](packages/sample-sellers) as a template, or
scaffold a new one with `npx @chain-lens/create-seller`. Both deploy
as a small HTTP service (Docker or otherwise) that translates the
gateway's call into whatever your upstream actually expects, normalizes
the response, and returns it.

The gateway sends a single POST per buyer request — no streaming, no
long-polling. Default timeout is 30 seconds (configurable per task type
via `TaskTypeRegistry.maxResponseTime`).

---

## Security posture

| Layer    | Control                                                                                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Contract | `ReentrancyGuard` + `SafeERC20` on v2 escrow; `Ownable2Step` + pausable on registries.                                          |
| Backend  | Ajv schema validation on every seller response; regex + string scan for prompt-injection before commit; per-seller rate limits. |
| Frontend | `responseHash` re-computation on the client so users can audit without trusting the gateway.                                    |

See [TYPE2_MVP_CLEAN_BUILD_SPEC.md](TYPE2_MVP_CLEAN_BUILD_SPEC.md) §9 for
the full checklist.

---

## Tech stack

- **Contracts:** Solidity 0.8.28, Hardhat, Hardhat Ignition, OpenZeppelin v5
- **Backend:** Express 4, Prisma 6 (PostgreSQL), viem, Ajv, pino
- **Frontend:** Next.js 15, RainbowKit, wagmi, viem, Tailwind
- **Agent:** `@modelcontextprotocol/sdk` stdio server
- **Chain:** Base Sepolia (live) / Base Mainnet (addresses TBD)
- **Payment:** USDC (ERC-20, 6 decimals)

---

## Status

See [PROGRESS.md](PROGRESS.md) for the day-by-day build log and current state.
All three weeks of the Type 2 MVP spec are implemented and tested (backend
79/79, MCP 17/17, sample-sellers 18/18, contracts 34/34).

## License

MIT
