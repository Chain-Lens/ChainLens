# @chain-lens/sign

Encrypted wallet keystore CLI + signing daemon for ChainLens. Planned replacement
for the `WALLET_PRIVATE_KEY` environment-variable pattern used by
`@chain-lens/mcp-tool`.

> **Status:** `0.0.x` **alpha**. 0.0.2 adds the unlock daemon and
> `send-tx`. MCP integration and per-tx approval prompts land in 0.0.3.

## Install

```bash
pnpm add -g @chain-lens/sign
# or
npm install -g @chain-lens/sign
```

## Commands

| Command                           | What it does                                                 |
| --------------------------------- | ------------------------------------------------------------ |
| `chain-lens-sign init`            | Generate a new wallet, encrypt with a password               |
| `chain-lens-sign import`          | Import an existing private key (prompted, not echoed)        |
| `chain-lens-sign address`         | Print addresses of all stored keystores                      |
| `chain-lens-sign unlock [addr]`   | Decrypt keystore, run the signing daemon (foreground)        |
| `chain-lens-sign status`          | Show unlocked address and TTL remaining                      |
| `chain-lens-sign lock`            | Stop the running daemon (also Ctrl-C in the unlock shell)    |
| `chain-lens-sign send-tx`         | Sign + broadcast a transaction via the daemon                |

Run `chain-lens-sign --help` for flag reference.

## Unlock flow

```bash
# Terminal 1 — session terminal (keeps daemon alive)
chain-lens-sign unlock --ttl 2h
# → prompts password, prints:
#   export CHAIN_LENS_SIGN_SOCKET=/home/you/.chain-lens/sign.sock

# Terminal 2 — uses the socket
export CHAIN_LENS_SIGN_SOCKET=/home/you/.chain-lens/sign.sock
chain-lens-sign status
chain-lens-sign send-tx --rpc https://sepolia.base.org \
  --to 0x0000000000000000000000000000000000000001 --value 0
```

The daemon auto-locks when the TTL elapses, on `lock`, or on Ctrl-C in the
session terminal.

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
- **0.0.2** — unlock daemon (unix socket, TTL) + `send-tx` (current)
- **0.0.3** — MCP integration (`@chain-lens/mcp-tool` reads
  `CHAIN_LENS_SIGN_SOCKET`) + spending limits + per-tx approval prompt
- **0.1.0** — first production-grade release, tagged when 0.0.x usage settles

## License

MIT
