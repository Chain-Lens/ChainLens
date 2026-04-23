# ChainLens Backlog (post-v0.1.0)

Parking lot so nothing falls through between sessions. Two tracks:
small v0.1.x patches and larger v0.2+ directions.

---

## v0.1.1 patch track — pending

Self-contained reliability + UX items. Ship as ready, no announcement
needed.

_(#5 + #6 landed — see Resolved.)_

<details>
<summary>Shipped: #5 Seller endpoint visibility + #6 Seller listing edit</summary>

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

</details>

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

### C. Optimistic settlement — "guarantees outcomes, not transport"

The current MVP is a **central-relay** model: every buyer call goes
Agent → ChainLens gateway → Seller → ChainLens → Agent. This is fine
at MVP scale but becomes the limiting factor as the marketplace grows:

| Pressure | Symptom |
| --- | --- |
| Latency | 2× hop vs direct call; unacceptable for realtime agents |
| Bandwidth | Image/video/stream responses fill ChainLens egress before they fill sellers' |
| Privacy | Every buyer query passes through ChainLens — blocks adoption for finance/medical sellers |
| SPOF | Gateway outage halts every trade; contradicts the on-chain escrow story |
| Unit cost | 5% fee stops covering infra as traffic grows |

The reframe: **"ChainLens guarantees outcomes, not transport."**
Buyers and sellers can talk directly; the platform enforces the
contract only when it's broken. Put another way — the gateway's
current job is *both* middleman and referee, and the middleman role
is what doesn't scale. We keep the referee.

**Critical distinction — registration gate vs operational validation**

These two often get lumped under "validation" and must stay separate
in the design, because they have opposite decentralization paths:

| | A. Registration gate (listing approval) | B. Operational validation (per-call enforcement) |
| --- | --- | --- |
| Frequency | Once per listing | Every call, or on dispute |
| Nature | Subjective curation ("does this look legit?") | Rule application ("does the response match the schema?") |
| Decentralization path | Stays **central curation for a long time** — permissionless-registration opens supply-side to sybil/spam, and quality collapse at cold start is fatal | Moves to **optimistic + validator network** — rules are objective, and individual calls are cheap to let through |
| Failure mode if flipped wrong | Spam flood, no agent trust | Either central bottleneck (if kept central) or dishonest sellers go unpunished (if opened before stake economics work) |

Any proposal under this item that says "decentralize validation"
needs to be explicit which one — conflating them is the fastest way
to ship a broken redesign. See **E** for how we keep the
registration gate central without giving up the censorship-resistance
story.

**Operational-validation mechanics (the B half)**

- Base assumption: sellers are honest; staking backs the assumption.
- Default flow: no challenge within window (e.g. 7d) → escrow auto-releases. 99% of calls never touch ChainLens infra.
- Challenge path: buyer submits evidence; validator network (or, initially, ChainLens team) adjudicates; slashed stake pays the buyer + validator.
- What stays in the central stack: registry (A), escrow contract (on-chain, not central), dispute layer (fires only on challenge), reputation graph, validation rule publication.

**Cryptographic proof menu — "response was actually delivered"**

In a direct-delivery world the gateway no longer witnesses responses,
so we need a way for a buyer to prove *what* the seller sent. Options,
in order of maturity:

1. **Seller response signature** — seller signs the response body; buyer attaches the signed response to a challenge. Seller can't later deny a signed response. Sufficient for MVP of the dispute layer.
2. **Response commitment on-chain** — seller commits a hash of the response to the escrow at delivery time; actual response revealed only on challenge. Prevents after-the-fact tampering.
3. **zkTLS / TLS notary** — buyer proves the response originated from the seller's actual TLS endpoint. Emerging tech; cost/latency high but trustless.
4. **Merkle batching** — seller anchors a period's worth of response hashes in a single on-chain root. Amortizes the cost of (2) for high-volume sellers.

**Phased migration (central → direct)**

1. **Phase 1 — today.** Central relay; simple, demo-friendly, keep.
2. **Phase 2 — opt-in direct mode.** Buyers can choose direct delivery per call. Seller commits a response hash on-chain; gateway does not witness the response body. Large-payload task types (image/stream) default to direct mode.
3. **Phase 3 — direct by default, relay as legacy.** Most listings run direct; the old relay path stays available for low-trust / unverified sellers.
4. **Phase 4 — retire relay.** ChainLens infra = registry + escrow + dispute layer + reputation. Gateway bandwidth no longer scales with traffic.

**Relationship to the rest of the backlog**

- **D (seller dev surface)** is the migration lever. Shipping D's spec + `chain-lens-seller upgrade` codemod *before* Phase 2 means seller migration is a re-template (+ one narrow utility bump for the crypto primitives via **D.3**); shipping Phase 2 without D means every seller hand-patches signatures/commitments into their own `server.ts`.
- **B (X402Bridge)** is cooperating, not competing: standard x402 headers sit on top of whatever transport (relay or direct) the buyer picks.
- **E (decentralization boundaries)** defines what stays central forever; C must honor those boundaries or the supply side destabilizes.

**Non-goals**

- Don't decentralize the registration gate here (see C/A distinction above — that's E territory).
- Don't ship the validator network before response-signature disputes work end-to-end with the ChainLens team as the sole adjudicator. Economic security modeling for validator selection/slashing is a separate RFC downstream.

**Scope**: RFC + economic-security model (~1–2 weeks of design, no
code). After RFC: Phase 2 opt-in direct mode is ~2–3 weeks of
implementation (escrow contract changes for response commitments +
dispute-submission flow + SDK hook). Phase 3/4 are downstream of
seller adoption data, not a fixed timeline.

### D. Seller dev surface — spec-first, narrow utilities

**The reframe that replaces the earlier "seller SDK" pitch**

Earlier drafts of this item proposed `@chain-lens/seller-sdk` as a
framework (`createSeller({...})`, runtime adapters, compat
machinery). That framing assumed **human-coded sellers**, where
~105 LOC of Express boilerplate in the scaffold
([`server.ts.tmpl`](../packages/create-seller/src/templates/basic/src/server.ts.tmpl) + siblings)
is meaningful friction and SDK abstraction saves typing. In practice
ChainLens seller onboarding is already agent-driven — the CLI ships
[`SKILL.md`](../packages/create-seller/SKILL.md) so Claude Code /
Cursor / Aider orchestrate the full flow. The target reader of
seller code is an LLM, not a keyboard.

Three traditional SDK value-props weaken in that world:

| SDK value-prop | Human-primary | Agent-primary |
| --- | --- | --- |
| Hide complexity | High — docs are a cost | Low — agent reads 1000 LOC of spec in seconds |
| Save typing | High | ~Zero |
| Maintenance centralization (one bump = many apps) | High | **Inverts.** Agents trained pre-release regenerate against old API from training data; docs-read-per-invocation is often *more* current than a library "known" from training |

What actually remains valuable as a library, regardless of reader:
**things that must be correct at runtime** — output schema
validation (silent wrong-shape → auto-refund is the highest-cost
bug), and future cryptographic primitives (B/C signing, commitment,
challenge). Everything else is better served by a spec the agent
regenerates from.

So this item becomes three concrete deliverables, not one SDK:

**D.1 — `SELLER_SPEC.md` (primary surface, docs-first)**

A single Markdown spec living beside the template. Contents:

- Envelope: `POST /` takes `{ task_type, inputs }`; response is the
  task-type-specific output JSON.
- `/health` shape (aligned with what the gateway approval probe
  expects).
- Error taxonomy: `BadInputError` → 400, `UpstreamError` →
  upstream status, uncaught → 500; body shape `{ error, message }`.
- Output schema references — one link per task type into
  `@chain-lens/shared/task-types`.
- Protocol additions as B/C land (x402 headers for B, response
  signing for C). The spec itself is the version control — no
  library version game.

An agent handed `SELLER_SPEC.md` regenerates the same ~105 LOC of
server/handler scaffolding every time. When the spec changes, the
next `init` / `upgrade` produces current code — no stranded-SDK-pin
problem.

**Scope**: ~1 day to draft, living document after.

**D.2 — `@chain-lens/task-types-validator` (narrow runtime utility)**

One responsibility: check a seller handler's output against the
task-type schema. One exported function:

```ts
validateOutput(taskType: string, output: unknown):
  | { ok: true }
  | { ok: false; errors: ZodError }
```

Why this is runtime, not spec:

- Agents regenerating "check output shape" from prose write
  inconsistent / incomplete guards.
- The failure without it is *silent* — wrong shape ships, gateway
  auto-refunds, seller sees no error. Needs dev-time catch.
- Zero framework opinions; drops into any template, any runtime.

Public API stays one function forever; versioning noise ≈ zero.

**Scope**: ~2–3 days including task-type coverage tests.

**D.3 — `@chain-lens/seller-crypto` (deferred, gated on C)**

The only thing future protocols genuinely require a library for:
response signing, commitment generation, challenge response. Don't
build speculatively — D.1 handles B's header changes by text, and
C's RFC has to concretize what primitives are needed before this
package has a shape worth freezing.

**Scope**: sized against C; explicitly out of scope until C lands.

**What we're explicitly NOT building**

- **A framework SDK** with `createSeller({...})`. Walked back from
  earlier drafts. Agent-coded sellers don't benefit enough from the
  abstraction to justify perpetual compat maintenance.
- **Runtime adapters** (Vercel / CF Workers / Bun) as a library
  feature. These become template *variants* — generate a different
  `server.ts` per runtime via the scaffold, not a polymorphic
  library. Fewer moving parts.
- **Compatibility machinery** (min-version gateway enforcement,
  canary periods, codemods for a published library). Not needed
  when we're not shipping a framework. A `chain-lens-seller upgrade`
  codemod still makes sense (see Sequencing #3 below) but it's a
  CLI feature, not an SDK obligation.

**The 5-operation adapter contract lives on the MCP side, not here**

An earlier draft of this item listed `discover / pay / call / verify
/ challenge` as a stable semantic surface for both seller SDK and
MCP. That was right for MCP (buyer-facing) and wrong for a seller
library — on the seller side the surface is just "handler + output
validation + (future) signing," not five operations. Relocating:

- **[`@chain-lens/mcp-tool`](../packages/mcp-tool/)** is where the
  5-op contract belongs. Today it exposes `discover` / `request` /
  `status`; as B and C land, `request` splits into `pay` / `call` /
  (optional) `verify` / `challenge` with pluggable backends.
  E's "what adapters can't hide" 4 leak points still apply there.
- **Seller side** stays tiny. Handler, schema validator (D.2),
  crypto when C lands (D.3). No five-op framework.

**Relationship to other items**

- **B (X402Bridge)**: new request headers. Handled by D.1 text
  update + MCP-side backend swap; no seller library change.
- **C (optimistic settlement)**: signing/commitment. D.3 lands here
  once the RFC concretizes the primitives. D.1 updates for the new
  flow. MCP side grows `challenge` operation.
- **E (decentralization boundaries)**: E's layer map justifies "SDK
  + UI can be central-but-replaceable" — D now reads as
  "docs-central + utility-central," same principle, smaller surface.
  E's adapter-caveat 4 leak points apply identically to MCP here
  (and to future D.3) — the seller library's tiny surface just has
  less room to leak.
- **A (wrapper-as-a-service)**: still complementary. A is
  seller-writes-config; D is seller-writes-code. The spec-first
  framing nudges D closer to A's declarative spirit — both are
  contract-driven, differing only in the level of declarativeness.

**Sequencing**

1. Write `SELLER_SPEC.md`; ship it beside the template via
   `chain-lens-seller init`. ~1 day.
2. Build + publish `@chain-lens/task-types-validator` as `0.x`
   (internal-stable, one function, no framework claims). ~2–3 days.
3. Build `chain-lens-seller upgrade` — a codemod the CLI runs
   against an existing seller project to re-template it against the
   current `SELLER_SPEC.md`. This is how protocol updates reach
   deployed sellers without a published-library pin: poor-man's SDK,
   zero semver liability. ~2–3 days, probably pays off by the second
   spec change.
4. D.3 (crypto utility) deferred until C's RFC lands.

**Overall scope**: D.1 + D.2 + D.3-minus-crypto ≈ 1 week. D.3
proper sized against C. Much smaller than the full-framework SDK
this item used to propose, and better matched to an agent-primary
seller path.

### E. Decentralization boundaries — what stays central, what moves, what's replaceable

**Why this is its own item**: **C** ships an architecture migration;
this one ships the *principles* that migration must obey. Without E,
C gets re-litigated every time someone argues "but shouldn't X also
be decentralized?" This is the north-star document, not a feature.

**The operational definition we commit to**

A ChainLens component is "decentralized enough" if, when the
ChainLens team / UI / domain disappears tomorrow:

- Registered sellers keep their on-chain identity and stake.
- Buyers can still find listings (via an alternative indexer).
- Escrow contracts keep operating without gateway intervention.
- Reputation history is reconstructable from on-chain data.

Note what's *not* on that list: running the official UI, running the
canonical indexer, running the registration gate. Those can be central
**as long as they're replaceable** — the litmus is "does the system
survive without them?", not "are they hosted by ChainLens?"

**Layer map — where each concern lives**

| Layer | Location | Reason |
| --- | --- | --- |
| Listing metadata (endpoint hash, price, stake) | **On-chain** (contract) + IPFS CID for long text | Write-decentralized — the team can't silently mutate or delete listings |
| Staking deposit | **On-chain** (escrow / stake contract) | Non-negotiable; without this, staking has no meaning |
| Validation attestation | **On-chain log, signed by attester** | Phase 1: ChainLens signs. Phase 3+: validator set signs. Migration is a key rotation, not a data migration |
| Discovery index (search / filter / rank) | **Off-chain** (current ChainLens backend), with an **open-source indexer** spec | On-chain search is too expensive and UX-hostile. Replaceability = censorship resistance, not "must run on-chain." The Graph model. |
| Registration UI / forms | **Central** (ChainLens web) + public SDK | Seller onboarding friction is the bottleneck; lab-grade UX matters. SDK + OpenAPI leave room for alternative frontends |
| Registration gate (approval decision) | **Central curation** — stays this way for years | Subjective; permissionless opens the marketplace to sybil/spam at cold start. See C's A-vs-B table |

Summary principle: **writes on-chain, reads off-chain, experience
central, gate central, everything replaceable.**

**Censorship resistance without permissionless registration**

The fear behind "shouldn't registration be decentralized?" is usually
censorship — ChainLens team rejecting a legitimate listing. That is
solvable without opening the gate:

- **Rejection log on-chain.** Every `REJECT` action writes the
  listing hash, admin address, reason, timestamp to a public log.
  Arbitrary rejection leaves an audit trail.
- **Appeal path.** A rejected seller can escalate; review is done by
  a different party (initially a second ChainLens reviewer, later
  validator-set members or a DAO committee). Documented SLA.
- **`unverified` tier.** A listing rejected from the curated tier can
  still register as `unverified`. Hidden by default in UIs, not
  returned by MCP `discover` unless explicitly opted into by the
  buyer. Preserves the "curated marketplace" UX for 99% of traffic
  while making the gate impossible to weaponize as a full ban.
- **Replaceable indexer.** If the official indexer filters a listing,
  a second indexer — running the open-source spec against the same
  on-chain data — can surface it. "Filtering = invisibility, not
  removal."

These four together are the **correct operational meaning** of
"decentralized registration" for a curated marketplace. Shipping
permissionless registration without them would actually be worse
for sellers (no appeal, no audit trail, just cold rejection with no
record).

**When (if ever) does the registration gate decentralize?**

Two preconditions must both hold, and we should assume neither holds
for years:

1. **Validation rules are fully objectified.** The gate decision can
   be expressed as a checklist / program that any honest reviewer
   would reach the same answer on. Until then, decentralizing it
   produces inconsistent decisions.
2. **Stake economics discourage spam.** The cost to register + lose
   a stake on a bad-faith listing exceeds the expected gain from
   scamming buyers. Requires real usage data to calibrate.

This item explicitly does **not** promise a decentralized gate. It
promises that when the gate is central, it's central in a way that
doesn't cost the marketplace its censorship-resistance story.

**The adapter-pattern caveat — what MCP / narrow-utility abstractions do not buy us**

The [`@chain-lens/mcp-tool`](../packages/mcp-tool/) buyer surface is
designed to expose a stable 5-operation contract (`discover` / `pay`
/ `call` / `verify` / `challenge`) with pluggable backends so
protocol migrations stay transparent to the LLM. **D** further
argues the seller surface should be even thinner — a docs spec plus
narrow runtime utilities, not a framework. Both benefit from the
same abstraction discipline, and both have the same ceiling — worth
naming here so this document isn't cited to justify "the adapter
will handle it" when it won't:

| Leak point | Why it escapes adapter coverage |
| --- | --- |
| Trust-model / dispute semantics | The LLM's / seller's decision surface changes (new tool, new deadline, new escalation). Not a transport swap. |
| On-chain economic preconditions | Staking deposits, fee-split changes, slashing rules are contract interface changes — every caller hits new preconditions. |
| Cryptographic primitives requiring caller-side work | zkTLS proof generation, seller signing key custody. A narrow runtime utility (**D.3**) can ship the submission plumbing; the caller still owns the key material. |
| Operation *shape* changes (not implementation) | Streaming, multi-seller aggregation, live challenge during call — these extend the semantic surface, not just swap backends. |

Design implication: when proposing a change under **C** (or any
future protocol item), classify it as "adapter swap" vs
"interface extension" at the proposal stage. Adapter swaps stay
cheap — on the buyer side the MCP backend rotates, on the seller
side `SELLER_SPEC.md` updates and the CLI's `chain-lens-seller
upgrade` codemod re-templates deployed sellers (see **D.3** for
the limited case where a narrow runtime utility is involved).
Interface extensions are coordinated migrations — the LLM's tool
surface grows, the spec grows, and deployed sellers need to pull
the new template. Call these out in the RFC; don't let them
masquerade as transparent swaps.

**What this item produces**

- A short doc (`docs/architecture/decentralization-boundaries.md`)
  that the layer map above links into, with concrete examples for
  each row and the thresholds at which any layer would move.
- Contract interface sketches for the on-chain pieces that don't
  exist yet: listing-metadata registry, stake contract, rejection
  log, attestation log.
- An alignment check against **C** and **D** — if either RFC
  contradicts this document, either the RFC changes or this
  document does (explicitly, via amendment), not silently.

**Scope**: ~3–5 days of writing + review. No code. Blocks nothing
directly, but every significant C/D design decision should cite it.

---

## Search engine roadmap (agent-first) — captured 2026-04-23

Strategic axis: ChainLens as an **agent-native** search engine, not a
generalised one. Design decisions fall out of the asymmetry between agent
and human buyers.

### Moats we're leaning into

- **Wallet-first auth** — signup = first signature, login = nonce challenge,
  KYC = ERC-8004 attestation, MFA/recovery = key rotation. Removes every
  friction human APIs pile on (email verify, captcha, MFA, password reset).
- **Prompt-injection hardening** — schema-enforced JSON responses over free
  text; `<EXTERNAL_DATA>` boundary tagging (already in gateway); capability
  tokens that limit what the agent can do with returned data (e.g.
  read-only flag). Combo: structural + tier-1 regex + source attestation.
  Current relay/settlement stance is documented in
  [`RELAY_AND_SETTLEMENT_POLICY.md`](./RELAY_AND_SETTLEMENT_POLICY.md):
  preserve seller output whenever possible, but separate relay from
  settlement and mark all seller output as untrusted external content.
- **Determinism & replay** — same query + same block height → same bytes,
  content-addressable. Absorbs the zkagent-protocol audit-trail idea
  naturally. Enables cross-agent cache sharing.
- **Context-efficiency SLA** — response token budget as a first-class
  parameter (`budget_tokens`, `format={evidence|narrative|decision}`,
  `detail={raw|summary}`). Not intelligence-tiering (brittle); agent
  declares its own budget.
- **Crypto-economic redress** — slashing is the legal system for a
  non-juridical agent. No reliance on CS tickets or courts.

### Explicitly rejected (don't revisit without new evidence)

- **General tool integration à la Perplexity** — dilutes the "economically
  guaranteed on-chain data" moat. Already claimed by LangChain/n8n/Zapier.
- **Wallet provisioning** — ceded to Privy/Dynamic/Coinbase. We sit on top
  with permissions (session keys, budget caps), not under with key custody.
- **Ad-driven score boost** — kills the signal itself (Akerlof's lemon
  problem on trust scores). Stake-based prior weighting is OK;
  posterior-additive ads are not.
- **Cross-session wallet tracking by default** — directly contradicts
  privacy-premium SKU. Only opt-in per-account personalisation.

### Indexing (public, capital-asset style — rack up aggressively)

Listed roughly by payoff/cost ratio:

1. **Listing denormalisation + listener sync** (~160 L) — mirror on-chain
   v3 listings into `ApiListing` via event listener. Queries stop hitting
   RPC + metadata fetch per request. Biggest single perf win.
2. **Postgres tsvector full-text index** (~50 L) — proper search, not
   `LIKE '%q%'`. Handles phrase + prefix + boolean ops. No new dep.
3. **pgvector semantic embeddings** (~200 L + embed pipeline) — queries
   by intent, not keyword. Domain-language drift ("TVL" / "locked value")
   absorbed. Use `text-embedding-3-small` or BGE.
4. **Co-occurrence recommendations** (~150 L + periodic aggregation) —
   "agents that used A also used B", aggregate-only so privacy premium
   stays intact.
5. **Cryptographic response attestation + capability tokens** — out-of-
   scope bytes, but the roadmap hinge for trustless data consumption.

### Personalisation (opt-in only — privacy premium must hold)

Ordered from lightest/safest to heaviest/costliest trust:

1. **Tool aliasing (client-side)** (~80 L, MCP) — `~/.chainlens/aliases.json`
   lets the agent register `kr_perp_volume(dex=…)` shortcuts. Backend
   never sees it. Pure token saver + lock-in.
2. **Session memory (ephemeral)** (~100 L + Redis) — `X-Session-Id`
   header, TTL 30 m, suggestions within session only. No cross-session
   trail.
3. **Wallet-declared preferences (self-signed)** (~60 L) — agent publishes
   an SBT or signed JSON stating its domain + constraints. We read, don't
   infer. Zero tracking.
4. **Explicit learning mode (opt-in, discounted)** (~120 L + GDPR-style
   delete) — wallet toggles "use my patterns for ranking"; earns a 10%
   rebate. Default OFF.

### Caching (natural extension of determinism)

- **CID response cache** — free once determinism is in. Past-block queries
  = permanent cache; latest-block = TTL 1 block.
- **Routing-decision cache** — orchestrator token savings (200–500 tok per
  route) come from tool-aliasing (above) more than from server cache.
- **Delta queries** — "changes since <cursor>" for polling monitor agents.
- **Push / subscribe** — `X condition met → webhook`. Cuts polling tokens
  to zero. Natural x402 subscription-fee hook.

### Privacy premium SKU (Phase 2 differentiator)

- **Default**: minimal metadata logging + CID-only cache keys.
- **Paid tier**: TEE (AWS Nitro / Phala / Marlin) verification path.
  Gateway operators never see plaintext request/response. Per-call
  surcharge (e.g. `+0.05 USDC`), not subscription — high-stakes queries
  opt in dynamically. Anchor price to "loss if pattern leaks" (MEV
  bot / HF segment).
- **Not**: pattern marketplace (Akerlof lemons). If we want a data-
  contribution reward model, frame it as "anonymised query → routing
  improvement → rebate," not "sell your patterns."

### Scoring evolution

- Now: Laplace-smoothed `(s+1)/(n+2) × ln(n+e)`, weighted-random shuffle.
- Next: **Thompson sampling** as a drop-in replacement of `scoreListing`.
  Beta(1+s, 1+f) posterior, sample once, rank. Automatic exploration,
  zero hyperparams. Ship when real traffic exists to calibrate priors.
- **Stake-based prior weighting** is the legit form of "promoted
  listing": bigger stake → prior with more weight → faster climb, but
  equal slashing exposure. Never posterior-additive.

### Agent-specific observability

- Per-listing error breakdown (seller_5xx, timeout, metadata, settle) —
  landing in inspect tool now.
- Listener liveness metric — alert if no ListingRegistered / Settled seen
  for N minutes while nextListingId changed on-chain.
- CallLog retention + rollup (90 d raw → aggregated snapshot).

### Structural reasons agents can't replace ChainLens

For future slide decks / pitches, here are the 6 points that hold even if
model intelligence scales 100×:

1. Indexing is capital, querying is consumable — agents re-pay the crawl
   cost per query; ChainLens amortises.
2. Two-sided gatekeeper — sellers optimise for us because we route demand,
   individual agents don't.
3. Freshness vs consistency asymmetry — agents want fresh, high-stakes
   workflows want same-query-same-answer. Block-height determinism wins.
4. Responsibility externalisation — non-juridical agents can't carry
   legal/financial liability; we can via slashing.
5. Normalisation / disambiguation — canonical form is a capital asset
   agents re-derive badly per-query.
6. Abuse / sybil defence — agents re-do the filtering; we amortise.

Smarter agents → more tokens on analysis, less on raw fetch → more
demand for a trusted data layer. ChainLens scales with agent capability,
not against it.

---

## Resolved (post-v0.1.0)

- ✅ v0.1.1 #1 — `enqueueWrite` serializer, all 9 write sites routed (ff59c05)
- ✅ v0.1.1 #2 — `finalizeFailure` refund-direct refactor, dropped stub config (1b350fd)
- ✅ v0.1.1 #3 — `Job` compound unique on `(escrowAddress, onchainJobId)` + backfill (358b233, e656e2b)
- ✅ v0.1.1 #4 — Register form wrapper guidance + README + sample-sellers docs (da47ecc)
- ✅ v0.1.1 #5 — SIWE-style seller auth + `GET /seller/listings` (endpoint visible to owner only)
- ✅ v0.1.1 #6 — `PATCH /seller/listings/:id` with whitelisted fields, `invalid_field` error for locked keys, SELF_EDIT AdminAction with diff
- ✅ v0.1.1 follow-up — `chain-lens-seller status` listings table (name/status/onChainId/price/sales) + `register`/`status` now print the `/seller` dashboard URL (fixes old `/marketplace` hint); README + SKILL.md mention the dashboard as the canonical place to verify endpoint URLs
- ✅ v0.1.1 hotfix — orphan refund recovery via `escrow.getJob()` skeleton seed (86e47c2, dcbbb4c)
- ✅ v0.1.1 hotfix — x402 POST variant with inputs body + inputsHash verification (aa16db3)
- ✅ v0.1.1 hotfix — `finalizeFailure` real-error surfacing (5ae667c)
- ✅ v0.1.0 — EIP-3009 escrow + MCP + x402 facade + 5-tab admin dashboard
