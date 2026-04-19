# Buyer Guide — Spend USDC on Data from Claude Desktop

This walks you (a buyer, human or agent) from zero to your first
hash-verified ChainLens response in under 15 minutes.

The stack:

1. A crypto wallet (any EVM wallet — MetaMask / Rabby / Coinbase Wallet).
2. A little Base Sepolia ETH (free) and USDC (free).
3. Claude Desktop with the `@chain-lens/mcp-tool` MCP server installed.

You never hand out API keys. You sign one-time USDC approvals with your
wallet, and the agent spends per call from the approved allowance.

---

## 1. Create a dedicated buyer wallet (5 min)

**Don't reuse your main wallet.** Create a fresh one for agent spending so
that (a) the private key lives in a config file, and (b) you can cap the
exposure by only funding it with what you want the agent to spend.

- Install [MetaMask](https://metamask.io) (or any EVM wallet).
- Create a **new account** dedicated to ChainLens.
- Back up the seed phrase offline. Treat the private key as a spending
  budget — whatever sits in this wallet is what the agent can spend.
- Export the private key (MetaMask: Account details → Show private key).
  You'll paste this into the MCP config in step 3.

## 2. Fund the wallet on Base Sepolia (2 min)

Base Sepolia is the test network ChainLens is live on today. Both faucets
are free.

- **Testnet ETH** (for gas):
  [coinbase.com/faucets/base-ethereum-sepolia-faucet](https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet)
  — ask for 0.05 ETH.
- **Testnet USDC** (to spend on data):
  [faucet.circle.com](https://faucet.circle.com) → pick **Base Sepolia** →
  paste your new wallet address → ask for 10 USDC.

Verify on [sepolia.basescan.org](https://sepolia.basescan.org) by pasting
your address: you should see both balances.

## 3. Install the MCP tool in Claude Desktop (3 min)

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
        "RPC_URL": "https://base-sepolia.g.alchemy.com/v2/<YOUR_ALCHEMY_KEY>",
        "WALLET_PRIVATE_KEY": "0x<your-buyer-private-key>"
      }
    }
  }
}
```

Fill in:

| Field | What to put |
| --- | --- |
| `CHAIN_LENS_API_URL` | Your ChainLens gateway. Use `http://localhost:3001/api` if you're running the backend locally. |
| `CHAIN_ID` | `84532` (Base Sepolia). Use `8453` for Base Mainnet (when addresses are published). |
| `RPC_URL` | An [Alchemy](https://alchemy.com) or [Infura](https://infura.io) Base Sepolia URL. The public `sepolia.base.org` endpoint works for light use but drops filter state; dedicated endpoints are far more reliable. |
| `WALLET_PRIVATE_KEY` | The `0x`-prefixed 64-hex key you exported in step 1. |

Restart Claude Desktop. Open a new chat; you should see three new tools in
the tool menu:

- `chain-lens.discover` — list sellers for a task type
- `chain-lens.request` — pay and fetch an answer
- `chain-lens.status` — look up evidence for a past job

> **No wallet yet?** You can omit `WALLET_PRIVATE_KEY`. `discover` and
> `status` still work — useful to browse the market before funding a
> wallet.

## 4. Make your first paid call (1 min)

Try this prompt:

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
