# ChainLens Backlog (post-v0.1.0)

Things we *could* do next, grouped by theme and rough priority. Not a
commitment — just a parking lot so nothing gets lost between sessions.

---

## v0.1.1 patch track — reliability + UX polish

Small, independent fixes that don't need a release cycle announcement.
Ship as they land.

### 1. `recordSellerResult` nonce contention
Backend's gateway wallet sends `submitJob`/`refundJob`/`recordJobResult` calls in
quick succession. When two writes land in the same mempool window, viem
increments the nonce for the second one to the same value as the first's
pending replacement, producing:

```
Details: replacement transaction underpriced
```

The on-chain state is still consistent (one tx wins), but the reputation
counter misses the update and logs flag "reputation out of sync."

**Fix approaches** (pick one):
- Serialize backend writes through a single promise queue per wallet
- Explicit nonce management: read pending nonce, increment locally, pass
  to `writeContract({nonce})`
- Small retry with gas bump on "replacement underpriced"

**Scope**: ~2 hours. Add one write serializer helper in `on-chain.service.ts`
and route all writeContract calls through it.

### 2. `finalizeFailure` refund-direct refactor
Current code (after 5ae667c) still routes error cases through
`finalizeJob` with a stub config — the `errorReason` is correct now, but
the stub-`enabled:false` trick is confusing and tightly couples the error
path to the happy-path state machine.

**Fix**: expose `refundAndRecord` from `job-gateway.service.ts`, have
`finalizeFailure` call it directly with the real error reason. Drop the
stub config.

**Scope**: 1 hour. Pure refactor, no behavior change.

### 3. `Job` table: compound unique on `(escrowAddress, onchainJobId)`
Current schema uses `onchainJobId` as a bare unique constraint. When we
redeployed the escrow in Phase 3.5, jobIds 0..9 collided with leftover
rows from the previous escrow — the listener rejected them with
"Unique constraint failed," jobs went orphan, admin had to manually
refund.

**Fix**: Prisma migration that adds an `escrowAddress` column (default =
current escrow address for backfill), drops the bare unique, adds
composite unique `(escrowAddress, onchainJobId)`.

**Scope**: ~2 hours. Migration file + backfill script + update
`evidence-store` + listener to include escrow address.

### 4. Register form wrapper guidance (wrapper model "C")
Register form currently shows an `endpoint` URL field with no guidance.
New sellers paste a raw upstream URL (e.g. `https://api.llama.fi/...`)
and get silent failures when the gateway POSTs ChainLens-shaped bodies
that the upstream doesn't understand.

**Fix**:
- Inline hint under the endpoint field: "Your endpoint must accept POST
  with `{task_type, inputs, jobId, buyer}` body and return JSON
  matching the task type schema. See the wrapper template below."
- Link to `packages/sample-sellers/` + `@chain-lens/create-seller` CLI
- README section documenting the wrapper contract

**Scope**: 1–2 hours. No backend changes.

### 5. Seller endpoint visibility for the owner
Sellers can't see their own listing's endpoint once registered. Can't
verify they typed the URL correctly, can't self-test before admin
approval.

**Fix**: SIWE-style seller auth (mirror of `useAdminAuth`).
- Backend: `/api/seller/auth/challenge` + `/api/seller/auth/verify`
  issues a JWT. `/api/seller/listings` authenticated returns full
  listing including `endpoint`.
- Frontend: `useSellerAuth` hook, "Sign in as seller" button on
  `/seller` page. After sign-in, `ApiRow` shows endpoint field.

**Scope**: 3–4 hours.

### 6. Seller listing edit
Building on #5 — once sellers can sign in, let them PATCH their own
listings (endpoint, description, price). Status transitions (PENDING ↔
APPROVED) stay admin-only.

**Fix**:
- Backend: `PATCH /api/seller/listings/:id` authenticated, validates
  ownership via JWT.
- Frontend: edit button per `ApiRow` → modal with editable fields.

**Scope**: +2 hours on top of #5.

---

## v0.2+ feature track — platform model evolution

Larger changes that need explicit release planning + migration thought.

### A. Wrapper-as-a-service (wrapper model "A")
Follow-up to v0.1.1 #4. Instead of forcing sellers to deploy their own
wrapper container, platform hosts a generic wrapper that translates on
their behalf based on declarative mapping config.

**Shape**:
- Listing gains `mode: "wrapper" | "proxy"` + `proxyConfig`
- `proxyConfig`: raw URL template (`{inputs.X}` interpolation), HTTP
  method, request/response transform rules (JSONPath or similar)
- Platform's gateway evaluates the proxy config per job instead of
  POSTing ChainLens-shaped body
- Schema validation still enforced via TaskTypeRegistry's schemaURI

**Trade-offs**:
- Seller UX: dramatically lower barrier — no server to run
- Platform: takes on more failure modes (upstream API changes, rate
  limits, auth tokens)
- Verification: gateway is still in the path; evidence/refund semantics
  unchanged

**Scope**: ~1 week. Design spec first, then backend mapping engine +
admin UI for proxy config + migration path from existing wrappers.

### B. X402Bridge contract for standard x402 drop-in
Current `/api/x402` facade requires ChainLens-aware clients to call
`escrow.createJobWithAuth`. Standard x402 clients (Coinbase SDK etc.)
only know "sign ERC-3009 `to=payTo`, submit." They can't call a
specific escrow function.

**Fix**: new `X402Bridge` contract that:
- Accepts ERC-3009 `transferWithAuthorization` with `to=bridge`
- Internally approves escrow + calls `escrow.createJob`
- 402 payload's `payTo` becomes bridge address

**Why not now**: no actual standard-x402 agent traffic yet.
Low urgency. Document the gap in v0.1.0 release notes, revisit when
external agents start probing the endpoint.

**Scope**: ~1.5 days. ~100 LOC Solidity + tests, shared constants,
x402 route payload update.

### C. Optimistic model experiment
Completely different architecture direction: drop gateway-mediated
settlement, move to pure x402 (buyer pays seller directly), add
staking + challenge game for disputes. Seller runs their own endpoint
that verifies payment. Platform = discovery + stake management +
challenge market.

**Rough shape** (pre-spec):
- Sellers stake USDC to list
- Each response carries a commit-reveal or signed claim
- Buyers or third-party challengers can dispute within a window
- On slash, challenger gets a cut, rest goes back to escrow or burned

**Why not now**: big conceptual pivot; requires economic-security
modeling, reviewer bandwidth, and actual seller interest. File under
"Phase 5" or later.

**Scope**: RFC-level work before any code. 1–2 weeks of design.

---

## Resolved recently (context for backlog)
- ✅ v0.1.0 shipped: EIP-3009 escrow + MCP + x402 facade
- ✅ Phase 3.5 escrow redeploy + orphan-refund recovery
- ✅ Admin dashboard 5 tabs
- ✅ task_type_disabled misleading error surface (5ae667c)