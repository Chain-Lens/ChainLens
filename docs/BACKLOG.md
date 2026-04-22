# ChainLens Backlog (post-v0.1.0)

Parking lot so nothing falls through between sessions. Two tracks:
small v0.1.x patches and larger v0.2+ directions.

---

## v0.1.1 patch track — pending

Self-contained reliability + UX items. Ship as ready, no announcement
needed.

### 5. Seller endpoint visibility for the owner

Seller registers an API, then can't see the `endpoint` URL they typed.
Can't verify they didn't fat-finger it, can't self-test before admin
approval. Same UX gap that makes new sellers paste raw-upstream URLs
(#4 docs help, but seeing the stored value after the fact is still
missing).

Endpoint stays hidden from **public** `/api/apis` and
`/api/apis/:id` — that's deliberate, it's the hinge the fee-capture
model hangs on. This item exposes it **only to the authenticated
owner**.

**Design — SIWE-style seller auth (mirror of admin auth)**

Reuse the exact shape of the admin auth. Files to copy/parallel:

| Admin (existing) | Seller (new) |
| --- | --- |
| [`packages/backend/src/routes/auth.routes.ts`](../packages/backend/src/routes/auth.routes.ts) `POST /auth/challenge` + `POST /auth/verify` | `POST /seller/auth/challenge` + `POST /seller/auth/verify` |
| [`packages/backend/src/middleware/auth.ts`](../packages/backend/src/middleware/auth.ts) `requireAdmin(jwt → req.adminAddress)` | `requireSeller(jwt → req.sellerAddress)` |
| [`packages/frontend/src/hooks/useAdminAuth.ts`](../packages/frontend/src/hooks/useAdminAuth.ts) nonce → `signMessage` → JWT localStorage | `useSellerAuth` with the same flow |

Same `JWT_SECRET` env (or new `SELLER_JWT_SECRET` if you want isolation).
Same 24h TTL. Same SIWE nonce replay protection.

**Backend surface to add**

- `GET /seller/listings` (auth) — returns the seller's own listings
  **with `endpoint` included**. Mirrors `apiService.listBySeller` but
  lifts the endpoint omit on the response. sellerAddress from JWT, not
  body.
- Consider collapsing the existing `GET /apis/seller/:address`
  (public, no endpoint) into the new auth'd route or keeping both with
  different projections.

**Frontend wiring**

- [`packages/frontend/src/hooks/useSellerApis.ts`](../packages/frontend/src/hooks/useSellerApis.ts) — swap to the
  auth'd endpoint once `useSellerAuth().isAuthenticated`. Prop-drill
  the endpoint field through `SellerApi` type.
- [`packages/frontend/src/app/(app)/seller/page.tsx`](../packages/frontend/src/app/(app)/seller/page.tsx) — add a
  "Sign in as seller" gate above the listings. After sign-in, the
  `ApiRow` renders endpoint in a collapsible row or alongside the
  seller address.

**Acceptance**

- Unauthenticated `GET /seller/listings` → 401
- Wrong wallet signed in → 403 on any PATCH (forward-looking for #6)
- Owner sees their raw endpoint URL in the seller page
- `/api/apis` and `/api/apis/:id` public responses unchanged (still no endpoint)

**Scope**: 3–4 hours.

### 6. Seller listing edit

Depends on #5 for auth. Let sellers correct typos or update upstream
URL without going through admin delete + re-register.

**Editable vs locked fields** (decide up front):

| Field | Editable? | Why |
| --- | --- | --- |
| `endpoint` | ✓ | UX reason this item exists |
| `description` | ✓ | Harmless marketing copy |
| `exampleRequest`/`exampleResponse` | ✓ | Docs only, not load-bearing |
| `name` | probably | Same seller, renaming OK |
| `price` | ✗ | Frozen post-approval — buyers price-shop off listing state |
| `category` / `taskType` | ✗ | Routes jobs via `TaskTypeRegistry`; editing breaks existing escrow jobs pointing at the old taskType hash |
| `sellerAddress` | ✗ | Identity, never editable |
| `status` | ✗ | Admin-only transition (PENDING ↔ APPROVED ↔ REVOKED) |
| `onChainId` | ✗ | Assigned at approval, immutable |

**Backend**

- `PATCH /seller/listings/:id` (auth) — body is a partial with only
  the whitelisted fields. Return the updated listing.
- Ownership check: JWT sellerAddress must match `listing.sellerAddress`
  (case-insensitive). Otherwise 403.
- Log to `AdminAction` table with `action: "SELF_EDIT"` and a diff
  blob for audit — it's a seller-initiated change on a listing that
  might already be APPROVED.
- Skip re-approval queue: once APPROVED, edits stay live immediately.
  Rationale: admin already vetted the seller's identity + task type
  combo; URL swap within the same seller+taskType is low risk. Revisit
  if abuse surfaces (e.g. bait-and-switch to a different upstream).

**Frontend**

- Edit button per `ApiRow` in [`seller/page.tsx`](../packages/frontend/src/app/(app)/seller/page.tsx)
  → opens a modal or inline form with only the editable fields.
- Reuse the existing input styles from `RegisterForm`; the
  `useSellerAuth`-provided JWT goes into the `PATCH` `Authorization`
  header.

**Acceptance**

- Non-owner PATCH → 403, listing unchanged
- Owner PATCH endpoint from raw URL to wrapper URL → reflected
  immediately in `/seller` view; subsequent gateway calls hit the new
  URL
- PATCH with `price` or `category` in the body → 400 with
  `invalid_field` error listing the rejected keys
- AdminAction row created with the diff

**Scope**: +2 hours on top of #5.

---

## v0.2+ feature track — needs design

### A. Wrapper-as-a-service (wrapper model "A")

Follow-up to #4 docs. Instead of sellers running their own wrapper
container, platform hosts a generic wrapper that translates based on
declarative mapping config.

**Shape**: `listing.mode: "wrapper" | "proxy"` + `proxyConfig` with
URL template (`{inputs.X}` interpolation), HTTP method, and
request/response transform rules (JSONPath). Platform gateway evaluates
the config per job instead of POSTing ChainLens-shaped body.

**Trade-offs**: hugely lowers seller onboarding friction. Platform
takes on upstream-failure modes (rate limits, auth tokens, schema
drift). Verification + refund semantics unchanged — gateway is still
in the path.

**Scope**: ~1 week. Design spec, then backend mapping engine, admin UI
for proxy config, migration path from existing wrappers.

### B. X402Bridge contract for standard x402 drop-in

Current `/api/x402` facade requires ChainLens-aware clients to call
`escrow.createJobWithAuth`. Standard x402 clients (Coinbase SDK etc.)
only know "sign ERC-3009 `to=payTo`, submit." They can't call a
specific escrow function.

**Fix**: new `X402Bridge` contract that accepts
`transferWithAuthorization` with `to=bridge`, internally approves
escrow + calls `createJob`. 402 payload's `payTo` becomes bridge
address — drop-in compatible.

**Why not now**: no standard-x402 agent traffic in the wild. Document
the gap, revisit when external agents start probing.

**Scope**: ~1.5 days. ~100 LOC Solidity + tests, shared constants,
x402 route payload update.

### C. Optimistic model experiment

Different architecture direction: drop gateway-mediated settlement,
move to pure x402 (buyer pays seller directly), add staking +
challenge game for disputes. Platform = discovery + stake management
+ challenge market.

**Why not now**: big conceptual pivot; needs economic-security
modeling, reviewer bandwidth, actual seller interest. File under
"Phase 5."

**Scope**: RFC-level work before any code. 1–2 weeks of design.

---

## Resolved (post-v0.1.0)

- ✅ v0.1.1 #1 — `enqueueWrite` serializer, all 9 write sites routed (ff59c05)
- ✅ v0.1.1 #2 — `finalizeFailure` refund-direct refactor, dropped stub config (1b350fd)
- ✅ v0.1.1 #3 — `Job` compound unique on `(escrowAddress, onchainJobId)` + backfill (358b233, e656e2b)
- ✅ v0.1.1 #4 — Register form wrapper guidance + README + sample-sellers docs (da47ecc)
- ✅ v0.1.1 hotfix — orphan refund recovery via `escrow.getJob()` skeleton seed (86e47c2, dcbbb4c)
- ✅ v0.1.1 hotfix — x402 POST variant with inputs body + inputsHash verification (aa16db3)
- ✅ v0.1.1 hotfix — `finalizeFailure` real-error surfacing (5ae667c)
- ✅ v0.1.0 — EIP-3009 escrow + MCP + x402 facade + 5-tab admin dashboard