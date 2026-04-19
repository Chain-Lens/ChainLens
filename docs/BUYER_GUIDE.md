# Buyer Guide — Spend USDC on Data from Claude Desktop

This walks you (a buyer, human or agent) from zero to browsing ChainLens
sellers and, optionally, paying for testnet data from Claude Desktop.

The stack:

1. Claude Desktop with the `@chain-lens/mcp-tool` MCP server installed
   (always free, always safe to install).
2. **Optional (testnet only):** a dedicated throwaway wallet funded from
   Base Sepolia faucets if you want to try `chain-lens.request`.

> ⚠ **Paid requests are testnet-only today.** `chain-lens.request` still
> reads `WALLET_PRIVATE_KEY` from the MCP config, which stores the key in
> plaintext on disk. The safer `@chain-lens/sign` CLI is planned for
> `0.1.x`. Use a throwaway Base Sepolia wallet and never put a mainnet key
> in there.

---

## 1. Install the MCP tool (read-only, 3 min)

Claude Desktop reads a JSON config at:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

Open (or create) that file and add the `chain-lens` server:

```jsonc
{
  "mcpServers": {
    "chain-lens": {
      "command": "npx",
      "args": ["-y", "@chain-lens/mcp-tool"],
      "env": {
        "CHAIN_LENS_API_URL": "https://your-chain-lens-host/api",
        "CHAIN_ID": "84532",
        "RPC_URL": "https://sepolia.base.org"
      }
    }
  }
}
```

| Field | What to put |
| --- | --- |
| `CHAIN_LENS_API_URL` | Your ChainLens gateway. Use `http://localhost:3001/api` if you're running the backend locally. |
| `CHAIN_ID` | `84532` (Base Sepolia). `8453` for Base Mainnet (when addresses are published). |
| `RPC_URL` | Public Base Sepolia RPC is fine for light use. If the agent gets throttled, swap in an [Alchemy](https://alchemy.com) or [Infura](https://infura.io) URL. |

Restart Claude Desktop. Two tools appear in the tool menu:

- `chain-lens.discover` — list sellers for a task type
- `chain-lens.status` — look up evidence for a past job

Both are read-only — no wallet required, no funds at risk.

## 2. Browse the market (1 min)

Try this prompt:

> "Use `chain-lens.discover` to find sellers for `defillama_tvl`. Show me
> price per call and reputation stats."

That's enough to see the marketplace. If you never want to pay from an
agent, you can stop here — point any other agent at a seller's endpoint
directly with your own wallet + UI.

## 3. (Optional, testnet only) Enable `chain-lens.request`

Skip this whole section unless you explicitly want the agent to spend
on-chain.

### 3a. Create a **throwaway** buyer wallet

- Install [MetaMask](https://metamask.io) (or any EVM wallet).
- Create a **brand-new account** used only for ChainLens testnet.
- Treat the private key as disposable. Do **not** reuse a key that holds
  real funds anywhere else.

### 3b. Fund it on Base Sepolia

- **Testnet ETH** (for gas):
  [coinbase.com/faucets/base-ethereum-sepolia-faucet](https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet)
  — ask for 0.05 ETH.
- **Testnet USDC**:
  [faucet.circle.com](https://faucet.circle.com) → pick **Base Sepolia** →
  paste your throwaway address → 10 USDC.

Verify both balances on [sepolia.basescan.org](https://sepolia.basescan.org).

### 3c. Add `WALLET_PRIVATE_KEY` to the MCP config

Extend the `env` block from step 1:

```jsonc
{
  "mcpServers": {
    "chain-lens": {
      "command": "npx",
      "args": ["-y", "@chain-lens/mcp-tool"],
      "env": {
        "CHAIN_LENS_API_URL": "https://your-chain-lens-host/api",
        "CHAIN_ID": "84532",
        "RPC_URL": "https://sepolia.base.org",
        "WALLET_PRIVATE_KEY": "0x<throwaway-testnet-key>"
      }
    }
  }
}
```

Restart Claude Desktop. `chain-lens.request` now appears alongside the two
read-only tools.

When the MCP tool starts, it prints a stderr warning that
`WALLET_PRIVATE_KEY` is set — this is expected and is there so you notice
if it ever ends up in an unexpected config.

## 4. Make your first paid call (testnet only, 1 min)

With `WALLET_PRIVATE_KEY` wired up from step 3, try this prompt:

> "Use ChainLens to find a seller that serves `defillama_tvl`, request
> Uniswap's TVL for 0.05 USDC, and tell me the job id so I can verify it."

Claude will:

1. Call `chain-lens.discover({ task_type: "defillama_tvl" })` — picks an
   active seller.
2. Call `chain-lens.request({ seller, task_type: "defillama_tvl", inputs: { protocol: "uniswap" }, amount: "50000" })`
   — this triggers two on-chain transactions from your wallet:
   - `approve(USDC, escrow, 0.05)` — one-time allowance
   - `createJob(seller, taskType, amount, inputsHash, 0)` — escrows 0.05
     USDC and emits `JobCreated`
3. Poll the gateway for evidence until status is `COMPLETED` or
   `REFUNDED`.
4. Return the `jobId`, the seller's response JSON, and the on-chain
   `responseHash`.

Amount `50000` is USDC with 6 decimals, i.e. **0.05 USDC** per call.

## 5. Verify the answer (1 min)

Two independent checks:

- **On the web:** Open `https://your-chain-lens-host/evidence/<jobId>`.
  The page recomputes `keccak256(JSON.stringify(response))` in your
  browser and shows a green banner when it matches what the seller
  committed on-chain. No gateway trust required.
- **On-chain:** The `createJob` transaction appears on
  [sepolia.basescan.org](https://sepolia.basescan.org) under your
  wallet's tx list. Decoding reveals the `jobId` and the escrowed 0.05
  USDC transfer.

If the seller returned garbage (failed schema check or tripped the
prompt-injection filter), the gateway calls `refund(jobId)` and your
0.05 USDC comes right back to your wallet, usually within 10 seconds.

## 6. Keep the agent honest

- **Cap spending.** The agent can only spend what's in the wallet. Don't
  fund it with more than you're comfortable with.
- **Revoke the USDC approval anytime.** The `approve` in step 4 is an
  ERC-20 allowance. Use [revoke.cash](https://revoke.cash) on your
  wallet address (filter to Base Sepolia) to revoke the escrow's
  allowance if you want to stop the agent cold.
- **Every call is auditable.** You can always point the agent at
  `chain-lens.status({ job_id })` later to re-fetch and re-hash the
  evidence.

---

## Troubleshooting

**Tools don't appear in Claude Desktop.**
Claude only reads the config on startup. Fully quit (not just close the
window) and relaunch. On macOS: Cmd+Q. If still missing, run the command
manually in a terminal — `npx -y @chain-lens/mcp-tool` — and check the
error.

**"No ApiMarketEscrowV2 deployed for chainId …"**
You set `CHAIN_ID` to something other than `84532` (Base Sepolia) or
`8453` (Base Mainnet). Those are the only two ChainLens is deployed to.

**`chain-lens.request` returns `status: "TIMEOUT"`.**
The gateway didn't finalize within 2 minutes. Usually means the seller's
upstream API is slow or down. The escrow is still in-flight — the
gateway's event listener will either complete or refund it when it
catches up. Poll with `chain-lens.status({ job_id })`.

**Transaction reverts with "insufficient allowance" or "insufficient balance".**
Your wallet is missing USDC on Base Sepolia, or the previous `approve`
was revoked. Top up from [faucet.circle.com](https://faucet.circle.com)
and retry — `chain-lens.request` re-approves automatically.

**MetaMask says "transaction exceeds block gas limit".**
The most common cause is an ABI mismatch or a contract-level revert that
fails gas estimation. Make sure you're on `CHAIN_ID=84532` and that your
gateway URL points to the same chain. If it persists, check the Base
Sepolia explorer for the failed tx and paste the revert reason.

---

## For developers running ChainLens locally

If you're running the backend on your laptop for a demo:

```bash
git clone https://github.com/Chain-Lens/ChainLens.git
cd ChainLens
pnpm install
docker compose up -d         # postgres
pnpm --filter @chain-lens/backend db:migrate
pnpm dev                     # backend :3001, frontend :3000
```

Then set `CHAIN_LENS_API_URL` to `http://localhost:3001/api` in your MCP
config. The rest of this guide is identical.

See [DEMO.md](DEMO.md) for the three end-to-end scenarios (browser buyer,
MCP agent, seller onboarding).
