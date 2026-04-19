# @chain-lens/mcp-tool

Model Context Protocol (MCP) server that lets Claude Desktop (and any other MCP
client) discover [ChainLens](https://github.com/Chain-Lens/ChainLens) sellers
and read on-chain-verified evidence for past jobs. Paid on-chain requests are
opt-in and **testnet-only** while the safer `@chain-lens/sign` flow is in
development (see [Wallet / signing](#wallet--signing) below).

## Install

You don't run this binary yourself — an **MCP client** (Claude Desktop,
Claude Code, Cursor, etc.) spawns it in the background and talks to it
over stdio. See [Claude Desktop integration](#claude-desktop-integration-recommended-read-only)
and [Claude Code integration](#claude-code-integration) below for the
one-time config that wires it up.

> ⚠ **Running `npx -y @chain-lens/mcp-tool` in a terminal looks like it
> hangs — that is expected.** It is a stdio MCP server waiting for an
> MCP client to speak the protocol on stdin. It is not a CLI you invoke
> by hand. If you see no output after running it, Ctrl+C and register
> it with your MCP client instead.

Global install is also available if your client prefers an absolute bin
path over `npx`:

```bash
npm install -g @chain-lens/mcp-tool
# then point the client at `chain-lens-mcp` instead of `npx -y @chain-lens/mcp-tool`
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
        "CHAIN_LENS_API_URL": "https://chainlens.pelicanlab.dev/api",
        "CHAIN_ID": "84532",
        "RPC_URL": "https://sepolia.base.org"
      }
    }
  }
}
```

Use `http://localhost:3001/api` for `CHAIN_LENS_API_URL` if you are
running the ChainLens backend locally.

Restart Claude Desktop; `chain-lens.discover` and `chain-lens.status` appear in
the tool menu. Use them to browse sellers and re-verify past jobs. No wallet,
no risk.

## Claude Code integration

Claude Code speaks the same MCP protocol, so the exact same server works —
only the registration step differs.

**Option A — `claude mcp add` (one command):**

```bash
claude mcp add chain-lens \
  -s user \
  -e CHAIN_LENS_API_URL=https://chainlens.pelicanlab.dev/api \
  -e CHAIN_ID=84532 \
  -e RPC_URL=https://sepolia.base.org \
  -- npx -y @chain-lens/mcp-tool
```

Scope flag (`-s`):

- `user` — available in every project on this machine (recommended for personal use).
- `project` — saved to `./.mcp.json`, committed with the repo, shared with teammates.
- `local` — this repo only, your machine only (default).

Verify with `claude mcp list`, then restart Claude Code. Inside a session,
`/mcp` shows server health and the exposed tools.

**Option B — hand-edit `.mcp.json`:**

Drop this in the repo root (or `~/.claude.json` for user scope). The schema
is identical to Claude Desktop's `mcpServers` block, so you can copy-paste
between the two:

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

> ⚠ **If you later add `WALLET_PRIVATE_KEY` (see [Wallet / signing](#wallet--signing)),
> never put it in `project`-scoped `.mcp.json`** — that file is committed to
> git. Use `-s user` or `-s local`, or reference an already-exported shell
> env var like `"WALLET_PRIVATE_KEY": "${WALLET_PRIVATE_KEY}"`.

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
        "CHAIN_LENS_API_URL": "https://chainlens.pelicanlab.dev/api",
        "CHAIN_ID": "84532",
        "RPC_URL": "https://sepolia.base.org",
        "WALLET_PRIVATE_KEY": "0x<testnet-throwaway>"
      }
    }
  }
}
```

Claude Code users: re-register with the extra env via `claude mcp add`
(`claude mcp remove chain-lens` first), and use `-s user` or `-s local`
so the key never lands in a committed `.mcp.json`.

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
Verify independently at `https://chainlens.pelicanlab.dev/evidence/<jobId>`
(or `<your-gateway-host>/evidence/<jobId>` for self-hosted deployments) or
by reading the `JobCompleted` event from `ApiMarketEscrowV2` on Base Sepolia.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Running `npx -y @chain-lens/mcp-tool` in a terminal prints nothing and never exits. | This is a stdio MCP server. It is **waiting for an MCP client** to write protocol messages to its stdin. Running it by hand is not a valid use. | Ctrl+C. Register it with your MCP client (Claude Desktop config, or `claude mcp add` for Claude Code) — see the integration sections above. |
| Tools don't appear in Claude Desktop / Claude Code after editing config. | Clients only read MCP config on startup. | Fully quit (Cmd+Q / exit the process) and relaunch. In Claude Code, `claude mcp list` should show the server; inside a session, `/mcp` shows live status. |
| `No ApiMarketEscrowV2 deployed for chainId …` | `CHAIN_ID` is not a ChainLens-supported chain. | Use `84532` (Base Sepolia) or `8453` (Base Mainnet). |
| `chain-lens.request` returns `status: "TIMEOUT"`. | Gateway didn't finalize within `CHAIN_LENS_POLL_TIMEOUT_MS` (default 120s) — usually a slow seller upstream. | The escrow is still live. Poll later with `chain-lens.status({ job_id })`; the gateway will complete or refund when it catches up. |
| Tx reverts with `insufficient allowance` / `insufficient balance`. | Wallet is missing USDC on the chosen chain, or a previous `approve` was revoked. | Top up from [faucet.circle.com](https://faucet.circle.com) (Base Sepolia). `chain-lens.request` re-approves automatically. |
| `WALLET_PRIVATE_KEY is set` warning on stderr at startup. | **Expected.** The tool prints this every time so you notice if it ever ends up in an unintended config (e.g. a committed `.mcp.json`). | If you did intend it and you're on testnet, ignore. If not, remove the key from the config and restart the client. |

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
