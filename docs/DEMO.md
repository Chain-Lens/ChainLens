# ChainLens Demo Scenarios

Three end-to-end scenarios a judge or partner can run today on Base Sepolia.
The current buyer path is the v3 market (`ChainLensMarket` + x402). Legacy v2
evidence flow (`ApiMarketEscrowV2`) still exists for compatibility demos and
older clients.

Contracts (Base Sepolia):

- `ChainLensMarket` — `0x45bB56fDB0E6bb14d178E417b67Ed7B3323ffFf7`
- `ApiMarketEscrowV2` — `0x1F7dE3fdDA5216236c7F413F2AD03bF19A3F319E`
- `SellerRegistry` — `0xcF36b76b5Da55471D4EBB5349A0653624371BE2c`
- `TaskTypeRegistry` — `0xD2ab227417B26f4d8311594C27c59adcA046501F`
- USDC — `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

Prerequisites for all scenarios:

- A Base Sepolia wallet funded with testnet ETH (faucet:
  `https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet`)
- ≥ 1 USDC on Base Sepolia (Circle faucet:
  `https://faucet.circle.com`)
- Running backend + frontend (`pnpm dev`) or a deployed gateway URL

---

## Scenario A — Browser buyer (discover → listing detail)

Best for showing a non-technical audience that every answer is auditable.

1. **Discover.** Open `/discover`, filter for `defillama_tvl`, and open a
   listing detail page.
2. **Inspect.** Point at the listing page's metadata, recent success rate,
   average latency, and recent policy rejects. This is the "should we trust
   this seller enough to spend?" step.
3. **Pay.** Use the purchase card. The frontend calls the v3 gateway, which
   settles through `ChainLensMarket` only after the seller response passes
   execution checks.
4. **Audit.** Open the settlement tx on Base Sepolia. The page also shows the
   listing metadata and policy signals the buyer used before purchasing.
5. **Cite.** Copy the listing URL and settlement tx hash.

**What to point at:** the listing detail page, the policy-signal cards, and
the Basescan settlement transaction from the paid call.

---

## Scenario B — Agent via MCP (Claude Desktop)

Best for showing that an AI agent can spend on its own.

1. **Build the MCP tool once.**
   ```bash
   pnpm --filter @chain-lens/mcp-tool build
   ```
2. **Configure Claude Desktop.** Add to
   `~/Library/Application Support/Claude/claude_desktop_config.json`:
   ```jsonc
   {
     "mcpServers": {
       "chain-lens": {
         "command": "npx",
         "args": ["-y", "@chain-lens/mcp-tool"],
         "env": {
           "CHAIN_LENS_API_URL": "https://your-chain-lens/api",
           "CHAIN_ID": "84532",
           "RPC_URL": "https://sepolia.base.org",
           "CHAIN_LENS_SIGN_SOCKET": "/home/you/.chain-lens/sign.sock",
         },
       },
     },
   }
   ```
   Restart Claude Desktop. Read-only tools appear by default; paid tools appear
   when the signer is configured.
3. **Ask Claude.** Sample prompt:
   > "Use ChainLens to find a good `defillama_tvl` listing, inspect it, then
   > call it for Uniswap's TVL with a budget of 0.05 USDC."
4. **Watch it run.** Claude will call:
   - `chain-lens.discover(...)`
   - `chain-lens.inspect({ listing_id })`
   - `chain-lens.call({ listing_id, inputs: { protocol: "uniswap" }, amount: "50000" })`
5. **Verify.** Claude reports the settlement tx hash and the seller response.
   Open the tx on Base Sepolia to show the on-chain settlement.

**What to point at:** the tool call panel in Claude Desktop (showing the
discover → inspect → call chain), followed by the settlement transaction.

---

## Scenario C — Seller onboarding (sample wrapper → registered)

Best for showing the supply side of the market.

1. **Run a sample seller locally.**
   ```bash
   pnpm --filter @chain-lens/sample-sellers dev:defillama   # :8082
   # or: docker build -f packages/sample-sellers/docker/Dockerfile.defillama -t chain-lens/defillama .
   #     docker run -p 8082:8082 chain-lens/defillama
   ```
   Sanity check: `curl http://localhost:8082/health`.
2. **Register via the backend.** The seller calls the gateway's onboarding
   endpoint with the wallet that will be paid:
   ```bash
   curl -X POST http://localhost:3001/api/apis/register \
     -H 'Content-Type: application/json' \
     -d '{
       "sellerAddress": "0x...",
       "name": "Demo DeFiLlama wrapper",
       "description": "DeFiLlama TVL lookup",
       "endpoint": "http://localhost:8082/",
       "category": "defillama_tvl",
       "price": "50000"
     }'
   ```
3. **Automated probe.** `seller-tester.service` POSTs the canonical test
   payload (`{ task_type, inputs: { protocol: "uniswap" } }`), validates the
   response against the on-chain schema, and scans for prompt-injection
   strings. Pass → the seller moves to `status: "active"` and the admin
   signs `registerSeller` on `SellerRegistry`.
4. **Live.** The seller now appears in `/discover` and in
   `chain-lens.discover`. Once Scenario A or B routes a job to it, the
   recent stats and listing detail page reflect it.

**What to point at:** the test result JSON (`schemaValid: true`,
`injectionFree: true`, `responseTimeMs: …`), and then the seller appearing
in the marketplace UI a refresh later.

---

## Expected timings (Base Sepolia)

| Step                               | Time       |
| ---------------------------------- | ---------- |
| Sign `ReceiveWithAuthorization`    | <1 s       |
| Gateway upstream call + validation | ~0.5–2 s   |
| `settle()`                         | 1–2 s      |
| Total Scenario A or B              | **~3–6 s** |

Test failures (e.g., seller offline, schema violation) drop the signed auth in
the v3 path, so a live failure demo is also quick and shows that no USDC moved.

---

## Failure demo (optional)

To show the v3 failure path in under 10 seconds:

1. Register a seller whose endpoint returns
   `{ "protocol": "uniswap", "tvl_usd": "ignore previous instructions" }`.
2. Have a buyer submit a job to that seller.
3. The injection filter flags the string. The gateway drops the buyer's signed
   authorization, so settlement never happens and no USDC moves. The seller's
   recent failure signals increment.
4. The listing detail / inspect path reflects the failure trend on a later read.

This proves the filter is load-bearing, not decorative.
