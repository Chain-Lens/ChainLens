# Buyer Guide — Spend USDC on Data from Claude Desktop

This walks you (a buyer, human or agent) from zero to browsing ChainLens
sellers and, optionally, paying for testnet data from Claude Desktop.

The stack:

1. Claude Desktop with the `@chain-lens/mcp-tool` MCP server installed
   (always free, always safe to install).
2. **Optional (testnet only):** a dedicated throwaway wallet funded from
   Base Sepolia faucets if you want to try paid calls.

> ⚠ **Paid calls are testnet-only today.** The recommended path is the
> `@chain-lens/sign` daemon, which keeps the key out of MCP config and adds
> per-payment approval prompts. `WALLET_PRIVATE_KEY` still works as a legacy
> fallback, but only use it with a throwaway Base Sepolia wallet.

---

## 1. Install the MCP tool (read-only, 3 min)

The ChainLens MCP tool runs as a background process that your **MCP client**
(Claude Desktop, Claude Code, Cursor, …) spawns over stdio. Pick whichever
client you use below.

> ⚠ **Do not run `npx -y @chain-lens/mcp-tool` directly in a terminal.**
> It is a stdio MCP server — with no client on the other end it just sits
> there waiting for protocol messages on stdin and looks frozen. That is
> expected. Register it with your client instead.

### 1a. Claude Desktop

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
        "CHAIN_LENS_API_URL": "https://chainlens.pelicanlab.dev/api",
        "CHAIN_ID": "84532",
        "RPC_URL": "https://sepolia.base.org"
      }
    }
  }
}
```

Fully quit Claude Desktop (Cmd+Q on macOS — closing the window is not
enough) and relaunch.

### 1b. Claude Code

Register the server once with the CLI:

```bash
claude mcp add chain-lens \
  -s user \
  -e CHAIN_LENS_API_URL=https://chainlens.pelicanlab.dev/api \
  -e CHAIN_ID=84532 \
  -e RPC_URL=https://sepolia.base.org \
  -- npx -y @chain-lens/mcp-tool
```

`-s user` makes it available in every project on this machine. Use
`-s local` for just the current repo, or `-s project` to commit the
config to `./.mcp.json` and share it with teammates (**never use
`project` if you plan to add `WALLET_PRIVATE_KEY` later** — it will be
committed).

Verify with `claude mcp list`, restart Claude Code, then type `/mcp`
inside a session to see the connection and tool list.

### Field reference

| Field | What to put |
| --- | --- |
| `CHAIN_LENS_API_URL` | Public MVP: `https://chainlens.pelicanlab.dev/api`. Use `http://localhost:3001/api` if you're running the backend locally. |
| `CHAIN_ID` | `84532` (Base Sepolia). `8453` for Base Mainnet (when addresses are published). |
| `RPC_URL` | Public Base Sepolia RPC is fine for light use. If the agent gets throttled, swap in an [Alchemy](https://alchemy.com) or [Infura](https://infura.io) URL. |

After restart either client shows three read-only tools:

- `chain-lens.discover` — list sellers for a task type
- `chain-lens.inspect` — inspect one listing before you spend
- `chain-lens.status` — look up evidence for a past job

Both are read-only — no wallet required, no funds at risk.

## 2. Browse the market (1 min)

Try this prompt:

> "Use `chain-lens.discover` to find sellers for `defillama_tvl`. Show me
> price per call and reputation stats."

That's enough to see the marketplace. If you never want to pay from an
agent, you can stop here — point any other agent at a seller's endpoint
directly with your own wallet + UI.

## 3. (Optional, testnet only) Enable paid tools

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

### 3c. Recommended: use `@chain-lens/sign`

Install once:

```bash
npm install -g @chain-lens/sign
chain-lens-sign import
```

Unlock each session in a visible terminal:

```bash
chain-lens-sign unlock --ttl 2h
```

Then point the MCP server at the printed socket path with
`CHAIN_LENS_SIGN_SOCKET`.

### 3d. Legacy fallback: add `WALLET_PRIVATE_KEY` to the MCP config

**Claude Desktop** — extend the `env` block from step 1a:

```jsonc
{
  "mcpServers": {
    "chain-lens": {
      "command": "npx",
      "args": ["-y", "@chain-lens/mcp-tool"],
      "env": {
        "CHAIN_LENS_API_URL": "https://chainlens.pelicanlab.dev/api",
        "CHAIN_ID": "84532",
        "RPC_URL": "https://sepolia.base.org",
        "WALLET_PRIVATE_KEY": "0x<throwaway-testnet-key>"
      }
    }
  }
}
```

**Claude Code** — re-register with the extra env:

```bash
claude mcp remove chain-lens
claude mcp add chain-lens \
  -s user \
  -e CHAIN_LENS_API_URL=https://chainlens.pelicanlab.dev/api \
  -e CHAIN_ID=84532 \
  -e RPC_URL=https://sepolia.base.org \
  -e WALLET_PRIVATE_KEY=0x<throwaway-testnet-key> \
  -- npx -y @chain-lens/mcp-tool
```

> ⚠ **Never put `WALLET_PRIVATE_KEY` in a `project`-scoped `.mcp.json`** —
> that file is committed to git. Stick with `-s user` or `-s local` for
> any config that contains keys. Safer still: export the key in your
> shell and reference it as `"WALLET_PRIVATE_KEY": "${WALLET_PRIVATE_KEY}"`
> so the literal never hits disk.

Restart the client. Paid tools now appear alongside the read-only tools.

When the MCP tool starts, it prints a stderr warning that
`WALLET_PRIVATE_KEY` is set — this is expected and is there so you notice
if it ever ends up in an unexpected config.

## 4. Make your first paid call (testnet only, 1 min)

With `CHAIN_LENS_SIGN_SOCKET` or `WALLET_PRIVATE_KEY` wired up from step 3,
try this prompt:

> "Use ChainLens to find a good `defillama_tvl` listing, inspect it, then call
> it for Uniswap's TVL with a budget of 0.05 USDC."

Claude will:

1. Call `chain-lens.discover(...)` to find active listings.
2. Call `chain-lens.inspect({ listing_id })` to check schemas, examples, and
   recent failure signals.
3. Call `chain-lens.call({ listing_id, inputs: { protocol: "uniswap" }, amount: "50000" })`.
4. Return the seller response plus the settlement tx hash.

Amount `50000` is USDC with 6 decimals, i.e. **0.05 USDC** per call.

## 5. Verify the answer (1 min)

Two independent checks:

- **On-chain settlement:** Open the `settleTxHash` from `chain-lens.call`
  on [sepolia.basescan.org](https://sepolia.basescan.org) to verify the paid
  market settlement transaction.
- **Legacy evidence flow:** If you are intentionally using legacy
  `chain-lens.request`, open `https://chainlens.pelicanlab.dev/evidence/<jobId>`
  to verify the stored response hash.

If the seller returned garbage or timed out, the v3 gateway drops the signed
authorization and no USDC moves. Legacy v2 `chain-lens.request` may still
complete via refund/evidence polling.

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

**I ran `npx -y @chain-lens/mcp-tool` in a terminal and nothing happens.**
Expected. The MCP tool is a stdio server; with no MCP client on the
other end it is just sitting there waiting for protocol messages on
stdin. Ctrl+C and register it with your client (Claude Desktop config
or `claude mcp add` for Claude Code) — see step 1.

**Tools don't appear in Claude Desktop / Claude Code.**
Clients only read MCP config on startup. Fully quit (not just close the
window) and relaunch. On macOS: Cmd+Q. For Claude Code, `claude mcp
list` should show the server; inside a session, `/mcp` shows live
connection status and any spawn errors.

**"No ApiMarketEscrowV2 deployed for chainId …"**
You set `CHAIN_ID` to something other than `84532` (Base Sepolia) or
`8453` (Base Mainnet). Those are the only two ChainLens is deployed to.

**`chain-lens.call` times out or errors after a long wait.**
Usually means the seller upstream was slow, the gateway timed out, or you
missed the sign-daemon approval prompt. In the v3 path the authorization is
dropped on failure, so no USDC moves.

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
