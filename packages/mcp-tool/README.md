# @chain-lens/mcp-tool

Model Context Protocol (MCP) server that lets Claude Desktop (and any other MCP
client) discover [ChainLens](https://github.com/Chain-Lens/ChainLens) API listings
and read on-chain-verified evidence for past jobs. Paid on-chain requests are
opt-in; prefer the `@chain-lens/sign` daemon (spending limits + per-tx
approval prompt) over the legacy `WALLET_PRIVATE_KEY` pattern — see
[Wallet / signing](#wallet--signing) below.

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
| `chain-lens.discover` | — | Search v3 listings (wraps `GET /api/market/listings`). |
| `chain-lens.inspect` | — | Inspect one v3 listing in depth (wraps `GET /api/market/listings/:id`). |
| `chain-lens.status` | — | Fetch stored evidence for an on-chain job (wraps `GET /api/evidence/:jobId`). |
| `chain-lens.call` | required | Current paid v3 flow. Signs a USDC ReceiveWithAuthorization and calls the gateway x402 endpoint for one listing. |
| `chain-lens.request` | required | Legacy paid v2 flow. Kept for backward compatibility where `ApiMarketEscrowV2` is still relevant. |

An HTTP-only alternative exists at `GET /api/x402/:listingId` on the gateway.
Use that path if you'd rather not install this MCP server — you'll still need
ChainLens-aware signing logic to produce the `X-Payment` payload for the v3
market flow.

The default configuration below only enables the three read-only tools. That is
the recommended setup for everyday use.

## Environment

| Variable | Default | Notes |
| --- | --- | --- |
| `CHAIN_LENS_API_URL` | `http://localhost:3001/api` | Backend base URL, trailing slash stripped. |
| `CHAIN_ID` | `84532` | Base Sepolia by default; `8453` for Base Mainnet. |
| `RPC_URL` | `https://sepolia.base.org` | Public Base Sepolia RPC. Rate-limited; swap for an Alchemy/Infura URL if the agent gets throttled. |
| `CHAIN_LENS_POLL_INTERVAL_MS` | `2000` | How often legacy `chain-lens.request` polls evidence. |
| `CHAIN_LENS_POLL_TIMEOUT_MS` | `120000` | Timeout for legacy `chain-lens.request` evidence polling. |
| `CHAIN_LENS_SIGN_SOCKET` | *unset* | Unix socket of a running `chain-lens-sign unlock` daemon. Preferred signing path — adds spending limits + per-tx approval prompt. Mutually exclusive with `WALLET_PRIVATE_KEY`. |
| `WALLET_PRIVATE_KEY` | *unset* | **Legacy, testnet-only, see warnings below.** Plaintext key; enables `chain-lens.request` without prompts. Mutually exclusive with `CHAIN_LENS_SIGN_SOCKET`. |

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

Restart Claude Desktop; `chain-lens.discover`, `chain-lens.inspect`, and
`chain-lens.status` appear in the tool menu. Use them to browse listings and
re-verify past jobs. No wallet, no risk.

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

Paid requests (`chain-lens.call` and legacy `chain-lens.request`) need a signer.
Two options:

### Option A — `@chain-lens/sign` daemon (recommended)

With the daemon:

- The encrypted keystore lives on disk (geth v3, scrypt + AES-128-CTR).
- The MCP tool sees **only a unix socket**, never the private key.
- Every tx the MCP tool initiates hits the unlock terminal's **approval
  prompt** (summary + `y`/Enter). Any input other than `y` denies.
- Spending ceilings (default 5 USDC per tx, 50 USDC per rolling hour) reject
  anything over the cap before the prompt even runs.
- Unknown calldata (anything that isn't `USDC.approve|transfer`,
  `ApiMarketEscrow.pay`, or `ApiMarketEscrowV2.createJob`) is denied outright.

**One-time setup** (per machine):

```bash
npm install -g @chain-lens/sign
chain-lens-sign import        # paste a Base Sepolia throwaway private key
                              # (prompted, not echoed; password creates keystore)
```

**Every session** (two terminals):

```bash
# Terminal A — unlock daemon. KEEP THIS VISIBLE.
# All per-tx approval prompts appear HERE, not in Claude Desktop/Code.
chain-lens-sign unlock --ttl 2h
# → prints: export CHAIN_LENS_SIGN_SOCKET=/home/you/.chain-lens/sign.sock

# Optional pre-flight check from any shell:
chain-lens-sign status
```

Then paste that socket path into the MCP config:

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
        "CHAIN_LENS_SIGN_SOCKET": "/home/you/.chain-lens/sign.sock"
      }
    }
  }
}
```

Restart Claude Desktop/Code. When you run a paid tool, **watch Terminal A** —
the prompt asks `approve? [y/N]` within 30 seconds. Type `y` + Enter
there (not in the Claude window). The v3 `chain-lens.call` flow triggers
one prompt for `USDC ReceiveWithAuthorization`; legacy v2
`chain-lens.request` may trigger transaction prompts.

If Claude starts the MCP server while `CHAIN_LENS_SIGN_SOCKET` points at a
stale or missing socket, startup fails with a message telling you to run
`chain-lens-sign status` and `chain-lens-sign unlock --ttl 2h` first.

See the [`@chain-lens/sign` README](https://github.com/Chain-Lens/ChainLens/tree/main/packages/sign)
for keystore details, `unlock --ttl` flags, and the `~/.chain-lens/config.json`
override file (raise limits, change the 30-second timeout).

**macOS optional convenience:** you can create a LaunchAgent that opens a
Terminal window and runs `chain-lens-sign unlock --ttl 8h` at login. It still
requires your keystore password and per-payment approvals in that Terminal
window; do not run the signer as a headless background daemon because no TTY
means prompts auto-deny.

### Option B — `WALLET_PRIVATE_KEY` (legacy, testnet-only)

This path still works but has real weak spots:

- The key is stored **plaintext** in `claude_desktop_config.json`. Any app
  that can read that file (backup tools, cloud sync, other MCP servers) can
  exfiltrate it.
- Once the MCP process holds the key it can sign **any** transaction without
  an interactive confirmation — including `approve(unlimited)` or sends you
  didn't intend.

> ⚠ **If you set `WALLET_PRIVATE_KEY`, use a throwaway Base Sepolia wallet
> with only faucet funds.** Never paste a mainnet key or a key that controls
> anything you care about. Setting both `WALLET_PRIVATE_KEY` and
> `CHAIN_LENS_SIGN_SOCKET` is a startup error — pick one.

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

> "Use `chain-lens.discover` to find API listings for `defillama_tvl`, then
> fetch the evidence for my last job id 42 with `chain-lens.status`."

Paid (requires `@chain-lens/sign` daemon or testnet `WALLET_PRIVATE_KEY`):

> "Use `chain-lens.discover` to find a good listing for `defillama_tvl`, inspect
> the best one, then call it for Uniswap's TVL with a budget of 0.05 USDC."

If you're on the sign daemon path, a v3 paid call prompts once in Terminal A
for the USDC authorization signature. Legacy `chain-lens.request` can still
produce transaction approval prompts.

## Verification

Legacy v2 jobs can still be verified at
`https://chainlens.pelicanlab.dev/evidence/<jobId>` (or
`<your-gateway-host>/evidence/<jobId>` for self-hosted deployments). For the
current v3 path, `chain-lens.call` returns the market settlement tx hash and
the gateway response envelope directly.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Running `npx -y @chain-lens/mcp-tool` in a terminal prints nothing and never exits. | This is a stdio MCP server. It is **waiting for an MCP client** to write protocol messages to its stdin. Running it by hand is not a valid use. | Ctrl+C. Register it with your MCP client (Claude Desktop config, or `claude mcp add` for Claude Code) — see the integration sections above. |
| Tools don't appear in Claude Desktop / Claude Code after editing config. | Clients only read MCP config on startup. | Fully quit (Cmd+Q / exit the process) and relaunch. In Claude Code, `claude mcp list` should show the server; inside a session, `/mcp` shows live status. |
| `No ApiMarketEscrowV2 deployed for chainId …` | `CHAIN_ID` is not a ChainLens-supported chain. | Use `84532` (Base Sepolia) or `8453` (Base Mainnet). |
| `chain-lens.request` returns `status: "TIMEOUT"`. | Gateway didn't finalize within `CHAIN_LENS_POLL_TIMEOUT_MS` (default 120s) — usually a slow seller upstream. | The escrow is still live. Poll later with `chain-lens.status({ job_id })`; the gateway will complete or refund when it catches up. |
| Tx reverts with `insufficient allowance` / `insufficient balance`. | Wallet is missing USDC on the chosen chain, or a previous `approve` was revoked. | Top up from [faucet.circle.com](https://faucet.circle.com) (Base Sepolia). `chain-lens.request` re-approves automatically. |
| `WALLET_PRIVATE_KEY is set` warning on stderr at startup. | **Expected.** The tool prints this every time so you notice if it ever ends up in an unintended config (e.g. a committed `.mcp.json`). | If you did intend it and you're on testnet, ignore. If not, remove the key from the config and restart the client. |
| MCP server fails at startup with `CHAIN_LENS_SIGN_SOCKET is set, but no signing daemon is reachable`. | The socket path is stale, or `chain-lens-sign unlock` is not running. | Run `chain-lens-sign status`. If locked, start `chain-lens-sign unlock --ttl 2h`, copy the printed socket path into MCP env, and restart the MCP client. |
| `chain-lens.call` hangs for 30s+ then errors with `timeout`. | Using the sign daemon and the approval prompt fired in Terminal A (the `chain-lens-sign unlock` window), but nobody typed `y` in time. | Keep the unlock terminal visible while you run paid tools. v3 calls prompt for `USDC ReceiveWithAuthorization`; respond within 30s. |
| Signing denied with `[denied] unknown_target`. | Daemon only signs known ChainLens payment shapes: v3 `USDC ReceiveWithAuthorization` typed data plus legacy tx shapes such as `USDC.approve|transfer` and escrow calls. | Check `CHAIN_ID` (`84532` = Base Sepolia, `8453` = Base Mainnet). If the target is correct but unsupported, use the testnet `WALLET_PRIVATE_KEY` path temporarily. |
| `sign-tx` denied with `[denied] limit_exceeded`. | Per-tx (5 USDC) or rolling 1-hour (50 USDC) ceiling hit. | Edit `~/.chain-lens/config.json` (decimal USDC strings under `limits.maxPerTx` / `limits.maxPerHour`), then Ctrl-C the unlock terminal and re-unlock. |
| Startup error: `Both WALLET_PRIVATE_KEY and CHAIN_LENS_SIGN_SOCKET are set`. | Tool refuses to pick for you — the two signing paths are mutually exclusive. | Remove whichever one you didn't mean to keep from the MCP config. Migrating to the daemon? Drop `WALLET_PRIVATE_KEY`. |

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
