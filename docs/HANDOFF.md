# ChainLens Handoff — 2026-04-23

Context for picking up the v3 x402 marketplace work mid-stream. Written
for a fresh session (Sonnet) to become productive without re-reading
hundreds of Opus turns.

---

## Positioning (the frame every decision hangs on)

- **ChainLens = agent-first API search engine + x402 payment rails.** Not
  a trustless oracle.
- **Trust model: centralized honest operator + reputation-driven
  dispute.** We run Gateway, we're accountable. No slashing / stakes yet.
- **Moats we're building toward** (see `docs/BACKLOG.md` §"Search engine
  roadmap"): wallet-first auth, prompt-injection hardening, determinism/
  replay, context-efficiency SLA, crypto-economic redress.
- **Explicitly rejected** (don't re-propose without new evidence):
  generic tool integration (Perplexity-style), wallet provisioning
  (ceded to Privy/Dynamic), ad-driven score boost, cross-session
  auto-profiling.
- **MCP is the primary agent channel.** HTTP `/api/market/*` is the
  foundation; MCP wraps it. Both ship, MCP carries the Claude-ecosystem
  integration story.

---

## Current state (2026-04-23)

### On-chain

- **`ChainLensMarket`** at [`0x45bB56fDB0E6bb14d178E417b67Ed7B3323ffFf7`](https://sepolia.basescan.org/address/0x45bB56fDB0E6bb14d178E417b67Ed7B3323ffFf7) on Base Sepolia (chain 84532).
- Whitelisted gateways: `0x622F1399…5b8A` (user-designated), `0xD21d…Db580` (backend `PRIVATE_KEY`).
- All fees default to 0. `registrationFeeToken` defaults to USDC.

### Repo

- Branch: `main`.
- Tests: **backend 109/109**, **mcp-tool 45/45**. Both green.
- `docs/RFC-v3.md`: architecture decision of record.
- `docs/BACKLOG.md`: current work queue + "Search engine roadmap (agent-first)" section (captured strategic discussion).

### Operational must-dos when pulling on a new machine

1. `pnpm install` at repo root.
2. `pnpm -r build` (shared compiles first — MCP/backend/frontend depend on its dist).
3. `cd packages/backend && pnpm db:push` — **required after this branch** because Phase 2c migrated `ApiListing` to `@@unique([contractVersion, onChainId])` and added `contractVersion` column. Non-destructive on existing data.
4. Backend `.env`: needs `DATABASE_URL, PRIVATE_KEY (0xD21d... or whitelisted addr), RPC_URL, JWT_SECRET, CONTRACT_ADDRESS (v2 legacy)`. `CHAIN_LENS_MARKET_ADDRESS` optional (falls back to `@chain-lens/shared` constant).
5. Frontend `.env.local`: needs `NEXT_PUBLIC_CHAIN_LENS_MARKET_ADDRESS=0x45bB56fDB0E6bb14d178E417b67Ed7B3323ffFf7`.

---

## Commit trajectory (newest → oldest, v3 only)

| #   | Commit                                                                                  | Summary                                                                                                          |
| --- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 7   | `feat(backend): admin-only GET /admin/call-logs for listing triage`                     | Raw CallLog triage endpoint (admin-only, buyer visible)                                                          |
| 6   | `feat(backend): market listener + admin approval gate + /health liveness (Phase 2c)`    | `ListingRegistered` → DB PENDING; approval filter on `/listings`, `/:id`, `/call`; `/health` liveness classifier |
| 5   | `feat(backend): chain-lens.inspect MCP tool + recent error breakdown (Phase 2b-v2)`     | 7-day error bucket in `/listings/:id`; new `chain-lens.inspect` MCP tool                                         |
| 4   | `feat: weighted-random ranking + rich discover (Phase 2b-v1)`                           | Laplace smoothing + weighted random shuffle; `chain-lens.discover` rewritten for v3 endpoint                     |
| 3   | `feat(backend): call logging + per-listing stats for v3 ranking (Phase 2a)`             | `CallLog` model, `logCall`/`getListingStats`, stats in listings response                                         |
| 2   | `feat: v3 x402 marketplace — ChainLensMarket + Gateway proxy + MCP call tool` (Phase 1) | Single-contract deploy, `/api/market/*` routes, `chain-lens.call` tool, frontend register form                   |
| 1   | `feat(seller): SIWE auth + authenticated listing edit (v0.1.1 #5, #6)`                  | Pre-session seller dashboard work (not mine — was user's uncommitted WIP)                                        |

---

## Architecture map (where stuff lives)

### Contract (`packages/contracts`)

- `contracts/ChainLensMarket.sol` — single v3 contract (~300 L)
- `contracts/ApiMarketEscrowV2.sol` etc. — v2 legacy, frozen, left deployed
- `ignition/modules/ChainLensMarket.ts` — deploy module
- `ignition/deployments/chain-lens-market-20260422/` — deploy record

### Shared (`packages/shared`)

- ABIs in `src/abi/` — `ChainLensMarketAbi` is the live one
- `src/constants/contracts.ts` — `CHAIN_LENS_MARKET_ADDRESSES[84532]` points at deploy
- **Must rebuild (`pnpm build`) if you touch schema — downstream packages import from `dist/`**

### Backend (`packages/backend`)

- `prisma/schema.prisma` — models. `ApiListing` has `contractVersion` ("V3" or null-for-v2); `CallLog` tracks v3 calls.
- `src/services/market-chain.service.ts` — on-chain read helpers (`marketAddress`, `readListing`, `nextListingId`, `resolveMetadata`). Shared by routes + listener + health.
- `src/services/market-listener.service.ts` — event listener, boot catch-up, pure `classifyHealth()` for `/health`.
- `src/services/call-log.service.ts` — `logCall` (fire-and-forget), `getListingStats`, `getListingsStats` (batch), `getRecentErrors`, `listCallLogs` (admin), `scoreListing` (Laplace smoothed).
- `src/routes/market.routes.ts` — `/api/market/listings[:id]` + `/api/market/call/:id`. Includes approval filter, weighted random ranking, errorReason classification.
- `src/routes/health.routes.ts` — `/api/health` with listener status.
- `src/routes/admin.routes.ts` — admin panel endpoints; `/admin/call-logs` added.
- `src/routes/v2-*` — legacy, left alive, 방치.
- `src/index.ts` — boots v1 + v2 + v3 (market) listeners.

### MCP (`packages/mcp-tool`)

- `src/tools/discover.ts` — v3 search (ranked + filters).
- `src/tools/inspect.ts` — single-listing detail + error breakdown.
- `src/tools/call.ts` — x402 call via Gateway.
- `src/tools/request.ts` — v2 legacy (keep for back-compat).
- `src/tools/status.ts` — v2 evidence status.
- `src/signer.ts` — `LocalAccount` abstraction (PK / daemon / future WaaS).
- `src/server.ts` — MCP server wiring; conditional tool registration.

### Frontend (`packages/frontend`)

- `src/config/contracts.ts` — `chainLensMarketConfig`, `escrowConfig`.
- `src/hooks/useRegisterV3.ts` — on-chain `register()` via wagmi, metadata → `data:application/json,...`.
- `src/hooks/useClaim.ts` — points at ChainLensMarket.claimable/claim().
- `src/components/register/RegisterForm.tsx` — v3-native form.
- Old v2 pages (`/admin`, `/requests`, `/evidence`) still there, will be pruned later.

---

## What's LEFT (ranked)

### Next commit candidates (short, isolated — pick one)

1. **Listener integration test** (~80 L, recommended next)
   - Handler flow (`handleListingRegistered`, `handleMetadataUpdated`, `catchupOnBoot`) has no unit coverage; only pure `classifyHealth` does.
   - Fake Prisma + fake viem `watchContractEvent`; assert upsert called with right shape.
   - Why first: runtime surface where bugs cause admin gate silently stop working. Currently least-protected area.

2. **CallLog retention policy** (~60 L + periodic script)
   - Keep raw rows 90 days; past that, rollup to daily aggregate per listing + drop raw.
   - Prevents unbounded table growth.
   - Needs new `CallLogDailyRollup` model + cron.

3. **Thompson sampling** (~80 L + tests)
   - Swap internals of `scoreListing(stats)`; signature stays.
   - Beta(1+successes, 1+failures) posterior, sample once, return as score.
   - Listing `successes` + `totalCalls` already plumbed. Needs Gamma sampler (~20 L Marsaglia-Tsang).
   - Low urgency — wait till real traffic calibrates priors.

4. **v2 code deletion** (~-1500 L diff)
   - Remove `packages/sample-sellers`, `packages/create-seller`, `packages/backend/src/services/job-execution.service.ts`, `job-gateway.service.ts`, old `/jobs/*` routes.
   - Low risk (v2 already marked 방치), but big diff. Save for when v3 is battle-tested.
   - Keep `v2-event-listener.service.ts` + v2 contracts deployed (historical data survives).

5. **Frontend `/discover` page** (~150-200 L)
   - Human-readable ranked listing view, same backend as MCP `discover`.
   - Uses `chainLensMarketConfig.address` + `/api/market/listings`.
   - Displays `stats.successRate`, `score`, badges.
   - Wait until a human user actually wants this — agents don't.

### Medium-term backlog (sized in `BACKLOG.md`)

- **Listing denormalization + listener sync** (~160 L) — partially done via listener; remaining work is fully replacing on-chain scan in `GET /listings` with DB-only reads. Unlocks 100× speedup at scale.
- **Postgres `tsvector` full-text** (~50 L) — real search, not `LIKE '%q%'`. Migration-only, no new dep.
- **Tool aliasing in MCP** (~80 L) — `~/.chainlens/aliases.json`, `kr_perp_volume(dex=...)` shortcuts. Token saver + lock-in. Client-side only.
- **Session memory** (`X-Session-Id` + Redis TTL 30m, ~100 L).

### Long-term (roadmap)

See `docs/BACKLOG.md` §"Search engine roadmap (agent-first)" for the full strategic picture including privacy-premium SKU (TEE), source attestation + capability tokens, determinism/replay, context-efficiency SLA.

---

## Conventions (non-negotiable)

### Commit style

- Subjects: `type(scope): short summary` (matches existing log: `feat(backend):`, `fix(backend):`, `docs(backlog):`, etc.).
- Bodies: what changed, WHY, tests state, follow-ups. No emoji.
- Co-author trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` (or adapt to Sonnet identity).
- Heredoc for multi-line messages.

### Workflow

- **Plan before code**: for anything >~50 L, show the plan first, get ack, then implement. User dislikes surprises mid-commit.
- **Small commits**: topical. Don't mix unrelated changes.
- **IDE stale cache**: diagnostics appear constantly between edits — **always trust `npx tsc --noEmit` exit code, not hints**. The hints you see are typically stale between parallel Edits.
- **IDE can be wrong about errors**: re-read the file if diagnostic seems impossible.
- **Korean responses** by default. Code + commit messages stay in English.

### Testing discipline

- Pure logic → unit test with `node:test`. See `call-log.service.test.ts` / `market-listener.service.test.ts` for pattern.
- Prisma-heavy functions: skip unit, rely on higher-level integration. User has integration tests on their side.
- **Never commit with tsc errors**. Never use `--no-verify`. Never bypass hooks.

### v2 = 방치 (leave alone)

- v2 routes, services, contracts are live but frozen. Don't refactor them unless specifically asked.
- v2 code paths use `contractVersion: null` in `ApiListing`. v3 writes `"V3"`.

---

## Immediate action suggestion

**Do this next**: Listener integration test (#1 above, ~80 L).

Rationale: last commit shipped the approval gate via event listener — which is the single point where a silent bug means new listings never reach the admin UI. Current coverage is pure `classifyHealth` only; handler wiring is untested. Low effort, high safety return.

Concrete scope:

- New file `packages/backend/src/services/market-listener.service.integration.test.ts` (separate from existing `.test.ts`)
- Fake Prisma: minimal `{callLog, apiListing}` implementing `upsert`, `updateMany`, `findFirst`, `findMany`
- Fake `publicClient.watchContractEvent`: returns a controllable unwatch + exposes the registered `onLogs` callback
- Test flow:
  1. Start listener
  2. Fire `ListingRegistered` log → assert `apiListing.upsert` called with `contractVersion:"V3"`, `status:"PENDING"`
  3. Fire `ListingMetadataUpdated` → assert `updateMany` with metadata fields, status NOT touched
  4. Fire `ListingRegistered` with same id (reorg replay) → assert status stays PENDING
  5. Catch-up path: DB has max id 3, on-chain `nextListingId` = 7 → expect upserts for ids 4,5,6

Then commit with message like:
`test(backend): market-listener integration tests — handlers + boot catchup`

---

## Open questions / known unknowns

- **Thompson sampling prior**: currently `Beta(1,1)`. When we have real traffic, maybe shift to `Beta(α, β)` where α/β reflect platform-wide success rate. Deferred.
- **MCP tool publishing cadence**: `@chain-lens/mcp-tool` is at 0.0.13 on npm. Pushing a new version requires `pnpm publish` from `packages/mcp-tool`. User manages this; don't auto-publish.
- **Frontend v2 page cleanup**: `/admin`, `/requests/[requestId]`, `/evidence/[jobId]` still render. Safe to remove but user hasn't blessed the delete diff yet.
- **Registration fee activation**: contract has the mechanism, default 0. Owner can flip via `setRegistrationFee`. No plan to flip unless spam emerges.

---

## Useful one-liners

```bash
# Run backend tests
cd packages/backend && pnpm test

# Run MCP tests
cd packages/mcp-tool && pnpm test

# Build everything
pnpm -r build

# Re-sync DB schema (required after Phase 2c)
cd packages/backend && pnpm db:push

# Check deployer balance
cd packages/backend && node -e 'require("dotenv").config({ path: "../../.env" }); const { createPublicClient, http, formatEther } = require("viem"); const { baseSepolia } = require("viem/chains"); (async () => { const c = createPublicClient({ chain: baseSepolia, transport: http(process.env.RPC_URL) }); console.log(formatEther(await c.getBalance({ address: "0xD21dE9470d8A0dbae0dE0b5f705001a6482Db580" })), "ETH"); })()'

# On-chain sanity check — listing count
cd packages/backend && node -e 'require("dotenv").config({ path: "../../.env" }); const { createPublicClient, http } = require("viem"); const { baseSepolia } = require("viem/chains"); const { ChainLensMarketAbi } = require("@chain-lens/shared"); (async () => { const c = createPublicClient({ chain: baseSepolia, transport: http(process.env.RPC_URL) }); const n = await c.readContract({ address: "0x45bB56fDB0E6bb14d178E417b67Ed7B3323ffFf7", abi: ChainLensMarketAbi, functionName: "nextListingId" }); console.log("nextListingId:", n); })()'
```
