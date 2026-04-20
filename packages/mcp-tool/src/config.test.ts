import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadMcpConfig } from "./config.js";

describe("loadMcpConfig", () => {
  it("applies defaults when env is empty", () => {
    const cfg = loadMcpConfig({});
    assert.equal(cfg.apiBaseUrl, "http://localhost:3001/api");
    assert.equal(cfg.chainId, 84532);
    assert.equal(cfg.rpcUrl, "https://sepolia.base.org");
    assert.equal(cfg.walletPrivateKey, undefined);
  });

  it("strips trailing slashes from CHAIN_LENS_API_URL", () => {
    const cfg = loadMcpConfig({ CHAIN_LENS_API_URL: "https://api.chain-lens.io/api///" });
    assert.equal(cfg.apiBaseUrl, "https://api.chain-lens.io/api");
  });

  it("throws when CHAIN_ID is non-numeric", () => {
    assert.throws(() => loadMcpConfig({ CHAIN_ID: "abc" }), /Invalid CHAIN_ID/);
  });

  it("rejects malformed WALLET_PRIVATE_KEY", () => {
    assert.throws(
      () => loadMcpConfig({ WALLET_PRIVATE_KEY: "0x123" }),
      /WALLET_PRIVATE_KEY must be/,
    );
  });

  it("accepts a valid 32-byte private key", () => {
    const pk = "0x" + "a".repeat(64);
    const cfg = loadMcpConfig({ WALLET_PRIVATE_KEY: pk });
    assert.equal(cfg.walletPrivateKey, pk);
  });

  it("reads CHAIN_LENS_SIGN_SOCKET", () => {
    const cfg = loadMcpConfig({ CHAIN_LENS_SIGN_SOCKET: "/tmp/sign.sock" });
    assert.equal(cfg.signSocketPath, "/tmp/sign.sock");
    assert.equal(cfg.walletPrivateKey, undefined);
  });

  it("rejects when both WALLET_PRIVATE_KEY and CHAIN_LENS_SIGN_SOCKET are set", () => {
    const pk = "0x" + "a".repeat(64);
    assert.throws(
      () => loadMcpConfig({ WALLET_PRIVATE_KEY: pk, CHAIN_LENS_SIGN_SOCKET: "/tmp/sign.sock" }),
      /Both WALLET_PRIVATE_KEY and CHAIN_LENS_SIGN_SOCKET are set/,
    );
  });
});
