# @chain-lens/sign

Encrypted wallet keystore CLI + signing daemon for ChainLens. Current
recommended replacement for the legacy `WALLET_PRIVATE_KEY`
environment-variable pattern used by `@chain-lens/mcp-tool`.

> **Status:** `0.0.x` **alpha**. 0.0.4 supports both transaction signing
> and v3 MCP/x402 `ReceiveWithAuthorization` typed-data signing through
> `CHAIN_LENS_SIGN_SOCKET`. Use on throwaway wallets while the API settles.

## Install

```bash
pnpm add -g @chain-lens/sign
# or
npm install -g @chain-lens/sign
```

## Commands

| Command                         | What it does                                              |
| ------------------------------- | --------------------------------------------------------- |
| `chain-lens-sign init`          | Generate a new wallet, encrypt with a password            |
| `chain-lens-sign import`        | Import an existing private key (prompted, not echoed)     |
| `chain-lens-sign address`       | Print addresses of all stored keystores                   |
| `chain-lens-sign unlock [addr]` | Decrypt keystore, run the signing daemon (foreground)     |
| `chain-lens-sign status`        | Show unlocked address and TTL remaining                   |
| `chain-lens-sign lock`          | Stop the running daemon (also Ctrl-C in the unlock shell) |
| `chain-lens-sign send-tx`       | Sign + broadcast a transaction via the daemon             |

Run `chain-lens-sign --help` for flag reference.

## Unlock flow

> **Two terminals, non-negotiable.** `unlock` must run in a foreground
> terminal that stays open — that terminal owns the password, the TTL
> timer, **and** every approval prompt. Any other process (`send-tx`, the
> MCP tool, Claude Code) is a _client_ that talks to it over a unix socket.

```bash
# Terminal A — unlock daemon (must stay open and visible)
chain-lens-sign unlock --ttl 2h
# → prompts password, prints:
#   export CHAIN_LENS_SIGN_SOCKET=/home/you/.chain-lens/sign.sock
# → then stays running. Approval prompts for every sign-tx request
#   appear *here*, not in the client terminal.

# Terminal B — any client (you, another shell, Claude Desktop, etc.)
export CHAIN_LENS_SIGN_SOCKET=/home/you/.chain-lens/sign.sock
chain-lens-sign status
chain-lens-sign send-tx --rpc https://sepolia.base.org \
  --to 0x036CbD53842c5426634e7929541eC2318f3dCF7e \
  --data 0x095ea7b3…   # any supported calldata
# → Terminal B blocks waiting for the daemon.
# → Terminal A shows:  approve? [y/N] (auto-deny in 30s) >
#   Type `y` + Enter *in Terminal A* to approve. Any other input denies.
```

The daemon auto-locks when the TTL elapses, on `lock`, or on Ctrl-C in the
session terminal.

> **Common gotcha.** If you type `y` in Terminal B (the client side), it
> goes nowhere — the prompt lives in Terminal A. Keep Terminal A visible
> or the 30-second timeout fires and the tx is denied.

## Spending limits & per-tx approval (0.0.3)

Every `sign-tx` request goes through a three-step gate before the daemon
signs anything:

1. **Decode** — the request must match a known ChainLens payment shape:
   transaction signing for legacy calls such as `USDC.approve`,
   `USDC.transfer`, `ApiMarketEscrow.pay`, `ApiMarketEscrowV2.createJob`,
   or typed-data signing for the current v3 USDC
   `ReceiveWithAuthorization`. Anything else is denied as `unknown_target`.
2. **Limits** — per-tx and rolling 1-hour ceilings, both in USDC
   (6-decimal atomic units). Defaults: **5 USDC per tx**, **50 USDC
   per rolling hour**. The hour counter only increments once the tx is
   actually signed (not just approved).
3. **Prompt** — the unlock terminal prints a summary and waits for `y`
   on stdin. **Any other input (including bare Enter) denies.** A 30-second
   timeout also denies.

Override the defaults via `~/.chain-lens/config.json`:

```json
{
  "limits": {
    "maxPerTx": "5.00",
    "maxPerHour": "50.00"
  },
  "approvalTimeoutSec": 30
}
```

Denials never count against the hour window and are logged to stderr
(`[denied] <code>: <message>`) so you can tell an expired prompt apart
from a typo.

`chain-lens-sign status` is the cheapest pre-flight check before starting an
MCP client. If the daemon is locked, it prints the exact `unlock` command to
run. If unlocked, it prints the socket path to put in `CHAIN_LENS_SIGN_SOCKET`.

## macOS Login Helper

If you dislike manually finding the approval terminal, use a LaunchAgent to
open one at login. This is only a convenience wrapper: the Terminal still asks
for your keystore password, and every payment approval still happens there.

Create `~/Library/LaunchAgents/dev.chainlens.sign.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>dev.chainlens.sign</string>
  <key>RunAtLoad</key>
  <true/>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/osascript</string>
    <string>-e</string>
    <string>tell application "Terminal" to do script "chain-lens-sign unlock --ttl 8h"</string>
  </array>
</dict>
</plist>
```

Load it:

```bash
launchctl load ~/Library/LaunchAgents/dev.chainlens.sign.plist
```

Do not run `chain-lens-sign unlock` as a headless background service. Without
a TTY, approval prompts auto-deny by design.

## MCP integration

Once the daemon is unlocked, point `@chain-lens/mcp-tool` at it via
`CHAIN_LENS_SIGN_SOCKET` **instead of** the legacy `WALLET_PRIVATE_KEY`.
Setting both at once is a hard error — see the mcp-tool README for the
full MCP config example.

```jsonc
// claude_desktop_config.json  (simplified)
{
  "mcpServers": {
    "chain-lens": {
      "command": "npx",
      "args": ["-y", "@chain-lens/mcp-tool"],
      "env": {
        "CHAIN_LENS_API_URL": "https://chainlens.pelicanlab.dev/api",
        "CHAIN_ID": "84532",
        "CHAIN_LENS_SIGN_SOCKET": "/home/you/.chain-lens/sign.sock",
      },
    },
  },
}
```

## Storage

Keystores live at `$CHAIN_LENS_HOME/keystore` (default: `~/.chain-lens/keystore`).

Filename: `<address-without-0x-lowercase>.json`
Format: **geth keystore v3** — `scrypt` (N=262144, r=8, p=1) + `aes-128-ctr`.
Interoperable with `cast wallet import`, `ethers.Wallet.fromEncryptedJson`,
`web3.eth.accounts.decrypt`, and MetaMask JSON export.

Daemon socket: `$CHAIN_LENS_SIGN_SOCKET` (default: `~/.chain-lens/sign.sock`).
Length-prefixed JSON RPC over unix socket; permissions follow the process
`umask` (0600-equivalent when the directory is 0700).

## Security

- Password is never written to disk; only the scrypt-derived key encrypts the
  private key, and only the MAC is stored (constant-time comparison on decrypt).
- Keystore files are written with `0600` permissions; the directory is `0700`.
- The private key lives in process memory only while the daemon is unlocked;
  it is dropped when the daemon exits (TTL, `lock`, or signal).
- No auth on the socket yet — relies on filesystem ownership. Don't expose
  `~/.chain-lens/` to other users.
- If you lose both the keystore file **and** the password, the wallet is
  unrecoverable. Back up the file somewhere safe.
- This is an alpha release — review and test on throwaway wallets before
  trusting real funds.

## Roadmap

- **0.0.1** — keystore management only (init/import/address)
- **0.0.2** — unlock daemon (unix socket, TTL) + `send-tx`
- **0.0.3** — MCP integration (`@chain-lens/mcp-tool` reads
  `CHAIN_LENS_SIGN_SOCKET`) + spending limits + per-tx approval prompt
- **0.0.4** — v3 MCP/x402 typed-data signing for USDC
  `ReceiveWithAuthorization` (current)
- **0.1.0** — first production-grade release, tagged when 0.0.x usage settles

## License

MIT
