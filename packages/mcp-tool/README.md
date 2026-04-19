# @chain-lens/mcp-tool

Model Context Protocol (MCP) server that lets Claude Desktop (and any other MCP
client) discover [ChainLens](https://github.com/Chain-Lens/ChainLens) sellers
and read on-chain-verified evidence for past jobs. Paid on-chain requests are
opt-in and **testnet-only** while the safer `@chain-lens/sign` flow is in
development (see [Wallet / signing](#wallet--signing) below).

## Install

No install step is required — `npx` runs the latest published version:

```bash
npx -y @chain-lens/mcp-tool
```

Or install globally:

```bash
npm install -g @chain-lens/mcp-tool
chain-lens-mcp
```

## Tools exposed

| Tool | Wallet? | Purpose |
| --- | --- | --- |
| `chain-lens.discover` | — | List sellers for a given task type (wraps `GET /api/sellers`). |
| `chain-lens.status` | — | Fetch stored evidence for an on-chain job (wraps `GET /api/evidence/:jobId`). |
| `chain-lens.request` | required | Approve USDC, call `ApiMarketEscrowV2.createJob`, poll for evidence. |

The default configuration below only enables the two read-only tools. That is
the recommended setup for everyday use.

## Environment

| Variable | Default | Notes |
| --- | --- | --- |
| `CHAIN_LENS_API_URL` | `http://localhost:3001/api` | Backend base URL, trailing slash stripped. |
| `CHAIN_ID` | `84532` | Base Sepolia by default; `8453` for Base Mainnet. |
| `RPC_URL` | `https://sepolia.base.org` | Public Base Sepolia RPC. Rate-limited; swap for an Alchemy/Infura URL if the agent gets throttled. |
| `CHAIN_LENS_POLL_INTERVAL_MS` | `2000` | How often `chain-lens.request` polls evidence. |
| `CHAIN_LENS_POLL_TIMEOUT_MS` | `120000` | Gives up with `status: "TIMEOUT"` after this long. |
| `WALLET_PRIVATE_KEY` | *unset* | **Testnet-only, see warnings below.** Enables `chain-lens.request`. |

## Claude Desktop integration (recommended, read-only)

Add an entry to `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

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

Restart Claude Desktop; `chain-lens.discover` and `chain-lens.status` appear in
the tool menu. Use them to browse sellers and re-verify past jobs. No wallet,
no risk.

## Wallet / signing

**Paid requests (`chain-lens.request`) are gated behind a private key today.**
This is a known weak spot:

- `WALLET_PRIVATE_KEY` is stored **plaintext** in `claude_desktop_config.json`.
  Any app that can read that file (backup tools, cloud sync, other MCP
  servers) can exfiltrate the key.
- Once the MCP process has the key it can sign **any** transaction without an
  interactive confirmation — including `approve(unlimited)` or sends you did
  not intend.

The permanent fix is [`@chain-lens/sign`](https://github.com/Chain-Lens/ChainLens),
a small CLI that keeps the key on disk encrypted and prompts the human for a
password per transaction. It is planned for `0.1.x`. Until then:

> ⚠ **If you set `WALLET_PRIVATE_KEY`, use a throwaway Base Sepolia wallet
> with only faucet funds.** Never paste a mainnet key or a key that controls
> anything you care about.

Opt-in config (testnet only):

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
        "WALLET_PRIVATE_KEY": "0x<testnet-throwaway>"
      }
    }
  }
}
```

The MCP tool prints a stderr warning on startup whenever `WALLET_PRIVATE_KEY`
is set to make this opt-in visible.

## Example prompts

Read-only (works with the default config):

> "Use `chain-lens.discover` to find sellers for `defillama_tvl`, then fetch
> the evidence for my last job id 42 with `chain-lens.status`."

Paid (requires testnet `WALLET_PRIVATE_KEY`):

> "Find a ChainLens seller for `defillama_tvl`, request Uniswap's TVL for 0.05
> USDC, and tell me the job id."

## Verification

Every response is committed on-chain as `keccak256(JSON.stringify(response))`.
Verify independently at `https://your-chain-lens-host/evidence/<jobId>` or by
reading the `JobCompleted` event from `ApiMarketEscrowV2` on Base Sepolia.

## Development

```bash
git clone https://github.com/Chain-Lens/ChainLens.git
cd ChainLens
pnpm install
pnpm --filter @chain-lens/mcp-tool build
pnpm --filter @chain-lens/mcp-tool test
```

## License

MIT
