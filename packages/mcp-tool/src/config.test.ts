import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadMcpConfig } from "./config.js";

describe("loadMcpConfig", () => {
  const requiredEnv = {
    CHAIN_LENS_API_URL: "https://chainlens.pelicanlab.dev/api",
    CHAIN_LENS_CHAIN_ID: "84532",
    CHAIN_LENS_RPC_URL: "https://sepolia.base.org",
  };

  it("throws when required env is missing", () => {
    assert.throws(() => loadMcpConfig({}), /Missing required CHAIN_LENS_API_URL/);
    assert.throws(
      () => loadMcpConfig({ CHAIN_LENS_API_URL: requiredEnv.CHAIN_LENS_API_URL }),
      /Missing required CHAIN_LENS_CHAIN_ID/,
    );
    assert.throws(
      () =>
        loadMcpConfig({
          CHAIN_LENS_API_URL: requiredEnv.CHAIN_LENS_API_URL,
          CHAIN_LENS_CHAIN_ID: requiredEnv.CHAIN_LENS_CHAIN_ID,
        }),
      /Missing required CHAIN_LENS_RPC_URL/,
    );
  });

  it("strips trailing slashes from CHAIN_LENS_API_URL", () => {
    const cfg = loadMcpConfig({ ...requiredEnv, CHAIN_LENS_API_URL: "https://api.chain-lens.io/api///" });
    assert.equal(cfg.apiBaseUrl, "https://api.chain-lens.io/api");
  });

  it("throws when CHAIN_LENS_CHAIN_ID is non-numeric", () => {
    assert.throws(
      () => loadMcpConfig({ ...requiredEnv, CHAIN_LENS_CHAIN_ID: "abc" }),
      /Invalid CHAIN_LENS_CHAIN_ID/,
    );
  });

  it("throws when poll settings are invalid", () => {
    assert.throws(
      () => loadMcpConfig({ ...requiredEnv, CHAIN_LENS_POLL_INTERVAL_MS: "0" }),
      /Invalid CHAIN_LENS_POLL_INTERVAL_MS/,
    );
    assert.throws(
      () => loadMcpConfig({ ...requiredEnv, CHAIN_LENS_POLL_TIMEOUT_MS: "-1" }),
      /Invalid CHAIN_LENS_POLL_TIMEOUT_MS/,
    );
  });

  it("rejects malformed CHAIN_LENS_WALLET_PRIVATE_KEY", () => {
    assert.throws(
      () => loadMcpConfig({ ...requiredEnv, CHAIN_LENS_WALLET_PRIVATE_KEY: "0x123" }),
      /CHAIN_LENS_WALLET_PRIVATE_KEY must be/,
    );
  });

  it("accepts a valid 32-byte private key", () => {
    const pk = "0x" + "a".repeat(64);
    const cfg = loadMcpConfig({ ...requiredEnv, CHAIN_LENS_WALLET_PRIVATE_KEY: pk });
    assert.equal(cfg.walletPrivateKey, pk);
  });

  it("reads CHAIN_LENS_SIGN_SOCKET", () => {
    const cfg = loadMcpConfig({ ...requiredEnv, CHAIN_LENS_SIGN_SOCKET: "/tmp/sign.sock" });
    assert.equal(cfg.signSocketPath, "/tmp/sign.sock");
    assert.equal(cfg.walletPrivateKey, undefined);
  });

  it("rejects when both CHAIN_LENS_WALLET_PRIVATE_KEY and CHAIN_LENS_SIGN_SOCKET are set", () => {
    const pk = "0x" + "a".repeat(64);
    assert.throws(
      () =>
        loadMcpConfig({
          ...requiredEnv,
          CHAIN_LENS_WALLET_PRIVATE_KEY: pk,
          CHAIN_LENS_SIGN_SOCKET: "/tmp/sign.sock",
        }),
      /Both CHAIN_LENS_WALLET_PRIVATE_KEY and CHAIN_LENS_SIGN_SOCKET are set/,
    );
  });

  it("accepts deprecated env aliases", () => {
    const pk = "0x" + "b".repeat(64);
    const cfg = loadMcpConfig({
      CHAIN_LENS_API_URL: requiredEnv.CHAIN_LENS_API_URL,
      CHAIN_ID: "84532",
      RPC_URL: "https://sepolia.base.org",
      WALLET_PRIVATE_KEY: pk,
    });
    assert.equal(cfg.chainId, 84532);
    assert.equal(cfg.rpcUrl, "https://sepolia.base.org");
    assert.equal(cfg.walletPrivateKey, pk);
  });
});
