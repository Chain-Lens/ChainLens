# @chainlens/mcp-tool

Model Context Protocol (MCP) server that lets Claude Desktop (and any other MCP
client) discover ChainLens sellers, place paid data requests, and read the
resulting on-chain-verified evidence.

## Tools exposed

| Tool | Purpose |
| --- | --- |
| `chainlens.discover` | List sellers for a given task type (wraps `GET /api/sellers`). |
| `chainlens.status` | Fetch stored evidence for an on-chain job (wraps `GET /api/evidence/:jobId`). |
| `chainlens.request` | Approve USDC, call `ApiMarketEscrowV2.createJob`, and poll for the evidence. Requires a wallet. |

Read-only tools (`discover`, `status`) need only the backend URL.
`chainlens.request` additionally needs a buyer private key + RPC URL because it
submits on-chain transactions.

## Environment

| Variable | Default | Notes |
| --- | --- | --- |
| `CHAINLENS_API_URL` | `http://localhost:3001/api` | Backend base URL, no trailing slash needed. |
| `CHAIN_ID` | `84532` | Base Sepolia by default; `8453` for Base Mainnet. |
| `RPC_URL` | `https://sepolia.base.org` | Used by both the public client and (if set) the wallet client. |
| `WALLET_PRIVATE_KEY` | *unset* | `0x`-prefixed 32-byte hex. Enables `chainlens.request`. |
| `CHAINLENS_POLL_INTERVAL_MS` | `2000` | How often `chainlens.request` polls evidence. |
| `CHAINLENS_POLL_TIMEOUT_MS` | `120000` | Gives up with `status: "TIMEOUT"` after this long. |

## Running locally

```bash
pnpm --filter @chainlens/mcp-tool build
node packages/mcp-tool/dist/index.js
```

## Claude Desktop integration

Add an entry to `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS) or `%APPDATA%/Claude/claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "chainlens": {
      "command": "node",
      "args": ["/absolute/path/to/ChainLens/packages/mcp-tool/dist/index.js"],
      "env": {
        "CHAINLENS_API_URL": "https://your-chainlens-host/api",
        "CHAIN_ID": "84532",
        "RPC_URL": "https://sepolia.base.org",
        "WALLET_PRIVATE_KEY": "0x..."
      }
    }
  }
}
```

Restart Claude Desktop; the three `chainlens.*` tools appear in the tool menu.

## Tests

```bash
pnpm --filter @chainlens/mcp-tool test
```

Unit tests inject fake `fetch`, `publicClient`, and `walletClient`, so they run
without network access, on-chain state, or a real wallet.
