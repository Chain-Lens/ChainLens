# @chain-lens/mcp-tool

Model Context Protocol (MCP) server that lets Claude Desktop (and any other MCP
client) discover [ChainLens](https://github.com/Chain-Lens/ChainLens) sellers,
place paid data requests in USDC on Base, and read the resulting
on-chain-verified evidence — no API keys, no OAuth, just a wallet.

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

| Tool | Purpose |
| --- | --- |
| `chain-lens.discover` | List sellers for a given task type (wraps `GET /api/sellers`). |
| `chain-lens.status` | Fetch stored evidence for an on-chain job (wraps `GET /api/evidence/:jobId`). |
| `chain-lens.request` | Approve USDC, call `ApiMarketEscrowV2.createJob`, and poll for the evidence. Requires a wallet. |

Read-only tools (`discover`, `status`) need only the backend URL.
`chain-lens.request` additionally needs a buyer private key + RPC URL because it
submits on-chain transactions.

## Environment

| Variable | Default | Notes |
| --- | --- | --- |
| `CHAIN_LENS_API_URL` | `http://localhost:3001/api` | Backend base URL, no trailing slash needed. |
| `CHAIN_ID` | `84532` | Base Sepolia by default; `8453` for Base Mainnet. |
| `RPC_URL` | `https://sepolia.base.org` | Used by both the public client and (if set) the wallet client. An Alchemy/Infura URL is strongly recommended for reliability. |
| `WALLET_PRIVATE_KEY` | *unset* | `0x`-prefixed 32-byte hex. Enables `chain-lens.request`. |
| `CHAIN_LENS_POLL_INTERVAL_MS` | `2000` | How often `chain-lens.request` polls evidence. |
| `CHAIN_LENS_POLL_TIMEOUT_MS` | `120000` | Gives up with `status: "TIMEOUT"` after this long. |

## Claude Desktop integration

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
        "RPC_URL": "https://base-sepolia.g.alchemy.com/v2/<YOUR_KEY>",
        "WALLET_PRIVATE_KEY": "0x..."
      }
    }
  }
}
```

Restart Claude Desktop; the three `chain-lens.*` tools appear in the tool menu.

`WALLET_PRIVATE_KEY` is optional — without it the agent can still `discover`
sellers and `status` past jobs, just not spend.

## Example prompt

> "Find a ChainLens seller that serves `defillama_tvl`, request Uniswap's TVL
> for 0.05 USDC, and tell me the job id."

Claude will chain `chain-lens.discover → chain-lens.request` and return the
on-chain job id plus the verified response JSON.

## Security

- Private keys live in MCP server env vars; never send them through prompts.
- Every response is committed on-chain as `keccak256(JSON.stringify(response))`
  so you can re-verify independently — see the evidence explorer at
  `https://your-chain-lens-host/evidence/<jobId>`.

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
