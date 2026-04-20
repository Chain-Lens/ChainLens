# @chain-lens/sign

Encrypted wallet keystore CLI for ChainLens. Planned replacement for the
`WALLET_PRIVATE_KEY` environment-variable pattern used by `@chain-lens/mcp-tool`.

> **Status:** `0.0.x` **alpha**. Only `init` / `import` / `address` are wired.
> Signing, session daemon, and MCP integration land in later releases.

## Install

```bash
pnpm add -g @chain-lens/sign
# or
npm install -g @chain-lens/sign
```

## Commands

| Command                    | What it does                                         |
| -------------------------- | ---------------------------------------------------- |
| `chain-lens-sign init`     | Generate a new wallet, encrypt with a password       |
| `chain-lens-sign import`   | Import an existing private key (prompted, not echoed)|
| `chain-lens-sign address` | Print addresses of all stored keystores              |

Run `chain-lens-sign --help` for usage.

## Storage

Keystores live at `$CHAIN_LENS_HOME/keystore` (default: `~/.chain-lens/keystore`).

Filename: `<address-without-0x-lowercase>.json`
Format: **geth keystore v3** — `scrypt` (N=262144, r=8, p=1) + `aes-128-ctr`.
Interoperable with `cast wallet import`, `ethers.Wallet.fromEncryptedJson`,
`web3.eth.accounts.decrypt`, and MetaMask JSON export.

## Security

- Password is never written to disk; only the scrypt-derived key encrypts the
  private key, and only the MAC is stored (constant-time comparison on decrypt).
- Keystore files are written with `0600` permissions; the directory is `0700`.
- If you lose both the file **and** the password, the wallet is unrecoverable.
  Back up the file somewhere safe (e.g., encrypted volume, password manager
  attachment).
- This is an alpha release — review and test on throwaway wallets before
  trusting real funds.

## Roadmap

- **0.0.x** — keystore management only (current)
- **0.1.0** — `unlock`/`lock` session daemon on a unix socket with TTL
- **0.1.x** — `send-tx` command (sign + broadcast via RPC)
- **0.2.0** — MCP tool integration: `@chain-lens/mcp-tool` reads
  `CHAIN_LENS_SIGN_SOCKET` to reach the unlock daemon, replacing
  `WALLET_PRIVATE_KEY` env

## License

MIT
