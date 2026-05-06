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
    const cfg = loadMcpConfig({
      ...requiredEnv,
      CHAIN_LENS_API_URL: "https://api.chain-lens.io/api///",
    });
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

  describe("smart account config (Phase C.2)", () => {
    const smartEnv = {
      ...requiredEnv,
      CHAIN_LENS_SIGNING_PROVIDER: "smart_account",
      CHAIN_LENS_SMART_ACCOUNT_ADDRESS: "0x" + "a".repeat(40),
      CHAIN_LENS_SESSION_KEY_PRIVATE_KEY: "0x" + "b".repeat(64),
    };

    it("defaults signingProvider to local_signer when unset", () => {
      const cfg = loadMcpConfig(requiredEnv);
      assert.equal(cfg.signingProvider, "local_signer");
    });

    it("throws on unknown CHAIN_LENS_SIGNING_PROVIDER value", () => {
      assert.throws(
        () => loadMcpConfig({ ...requiredEnv, CHAIN_LENS_SIGNING_PROVIDER: "ledger" }),
        /Invalid CHAIN_LENS_SIGNING_PROVIDER/,
      );
    });

    it("throws when smart_account is set without CHAIN_LENS_SMART_ACCOUNT_ADDRESS", () => {
      assert.throws(
        () =>
          loadMcpConfig({
            ...requiredEnv,
            CHAIN_LENS_SIGNING_PROVIDER: "smart_account",
            CHAIN_LENS_SESSION_KEY_PRIVATE_KEY: "0x" + "b".repeat(64),
          }),
        /CHAIN_LENS_SMART_ACCOUNT_ADDRESS is required/,
      );
    });

    it("throws when smart_account is set without CHAIN_LENS_SESSION_KEY_PRIVATE_KEY", () => {
      assert.throws(
        () =>
          loadMcpConfig({
            ...requiredEnv,
            CHAIN_LENS_SIGNING_PROVIDER: "smart_account",
            CHAIN_LENS_SMART_ACCOUNT_ADDRESS: "0x" + "a".repeat(40),
          }),
        /CHAIN_LENS_SESSION_KEY_PRIVATE_KEY is required/,
      );
    });

    it("throws when CHAIN_LENS_SMART_ACCOUNT_ADDRESS is malformed", () => {
      assert.throws(
        () =>
          loadMcpConfig({
            ...requiredEnv,
            CHAIN_LENS_SIGNING_PROVIDER: "smart_account",
            CHAIN_LENS_SMART_ACCOUNT_ADDRESS: "0xbad",
            CHAIN_LENS_SESSION_KEY_PRIVATE_KEY: "0x" + "b".repeat(64),
          }),
        /CHAIN_LENS_SMART_ACCOUNT_ADDRESS is required/,
      );
    });

    it("throws when CHAIN_LENS_SESSION_KEY_PRIVATE_KEY is malformed", () => {
      assert.throws(
        () =>
          loadMcpConfig({
            ...requiredEnv,
            CHAIN_LENS_SIGNING_PROVIDER: "smart_account",
            CHAIN_LENS_SMART_ACCOUNT_ADDRESS: "0x" + "a".repeat(40),
            CHAIN_LENS_SESSION_KEY_PRIVATE_KEY: "0xshort",
          }),
        /CHAIN_LENS_SESSION_KEY_PRIVATE_KEY is required/,
      );
    });

    it("loads smart account config when all fields are valid", () => {
      const cfg = loadMcpConfig(smartEnv);
      assert.equal(cfg.signingProvider, "smart_account");
      assert.equal(cfg.smartAccountAddress, "0x" + "a".repeat(40));
      assert.equal(cfg.sessionKeyPrivateKey, "0x" + "b".repeat(64));
    });

    it("payoutAllowlist is undefined when CHAIN_LENS_PAYOUT_ALLOWLIST is unset", () => {
      const cfg = loadMcpConfig(smartEnv);
      assert.equal(cfg.payoutAllowlist, undefined);
    });

    it("parses CHAIN_LENS_PAYOUT_ALLOWLIST into an array", () => {
      const addr1 = "0x" + "1".repeat(40);
      const addr2 = "0x" + "2".repeat(40);
      const cfg = loadMcpConfig({
        ...smartEnv,
        CHAIN_LENS_PAYOUT_ALLOWLIST: `${addr1}, ${addr2}`,
      });
      assert.deepEqual(cfg.payoutAllowlist, [addr1, addr2]);
    });

    it("throws when CHAIN_LENS_PAYOUT_ALLOWLIST contains an invalid address", () => {
      assert.throws(
        () =>
          loadMcpConfig({
            ...smartEnv,
            CHAIN_LENS_PAYOUT_ALLOWLIST: "0xbadaddress",
          }),
        /CHAIN_LENS_PAYOUT_ALLOWLIST contains invalid EVM address/,
      );
    });

    it("smartAccountAddress and sessionKeyPrivateKey are undefined for local_signer", () => {
      const cfg = loadMcpConfig(requiredEnv);
      assert.equal(cfg.smartAccountAddress, undefined);
      assert.equal(cfg.sessionKeyPrivateKey, undefined);
    });
  });

  describe("waiaas config (Phase C.3)", () => {
    const waiaasEnv = {
      ...requiredEnv,
      CHAIN_LENS_SIGNING_PROVIDER: "waiaas",
      CHAIN_LENS_WAIAAS_API_URL: "https://api.example-waiaas.io/v1",
      CHAIN_LENS_WAIAAS_API_KEY: "sk_test_abc123",
      CHAIN_LENS_WAIAAS_WALLET_ID: "wallet_xyz789",
    };

    it("loads waiaas config when all fields are valid", () => {
      const cfg = loadMcpConfig(waiaasEnv);
      assert.equal(cfg.signingProvider, "waiaas");
      assert.equal(cfg.waiaasApiUrl, "https://api.example-waiaas.io/v1");
      assert.equal(cfg.waiaasApiKey, "sk_test_abc123");
      assert.equal(cfg.waiaasWalletId, "wallet_xyz789");
    });

    it("throws when waiaas is set without CHAIN_LENS_WAIAAS_API_URL", () => {
      assert.throws(
        () =>
          loadMcpConfig({
            ...requiredEnv,
            CHAIN_LENS_SIGNING_PROVIDER: "waiaas",
            CHAIN_LENS_WAIAAS_API_KEY: "sk_test_abc123",
            CHAIN_LENS_WAIAAS_WALLET_ID: "wallet_xyz789",
          }),
        /CHAIN_LENS_WAIAAS_API_URL is required/,
      );
    });

    it("throws when waiaas is set without CHAIN_LENS_WAIAAS_API_KEY", () => {
      assert.throws(
        () =>
          loadMcpConfig({
            ...requiredEnv,
            CHAIN_LENS_SIGNING_PROVIDER: "waiaas",
            CHAIN_LENS_WAIAAS_API_URL: "https://api.example-waiaas.io/v1",
            CHAIN_LENS_WAIAAS_WALLET_ID: "wallet_xyz789",
          }),
        /CHAIN_LENS_WAIAAS_API_KEY is required/,
      );
    });

    it("throws when waiaas is set without CHAIN_LENS_WAIAAS_WALLET_ID", () => {
      assert.throws(
        () =>
          loadMcpConfig({
            ...requiredEnv,
            CHAIN_LENS_SIGNING_PROVIDER: "waiaas",
            CHAIN_LENS_WAIAAS_API_URL: "https://api.example-waiaas.io/v1",
            CHAIN_LENS_WAIAAS_API_KEY: "sk_test_abc123",
          }),
        /CHAIN_LENS_WAIAAS_WALLET_ID is required/,
      );
    });

    it("waiaas fields are undefined for local_signer", () => {
      const cfg = loadMcpConfig(requiredEnv);
      assert.equal(cfg.waiaasApiUrl, undefined);
      assert.equal(cfg.waiaasApiKey, undefined);
      assert.equal(cfg.waiaasWalletId, undefined);
    });

    it("waiaas fields are undefined for smart_account", () => {
      const cfg = loadMcpConfig({
        ...requiredEnv,
        CHAIN_LENS_SIGNING_PROVIDER: "smart_account",
        CHAIN_LENS_SMART_ACCOUNT_ADDRESS: "0x" + "a".repeat(40),
        CHAIN_LENS_SESSION_KEY_PRIVATE_KEY: "0x" + "b".repeat(64),
      });
      assert.equal(cfg.waiaasApiUrl, undefined);
      assert.equal(cfg.waiaasApiKey, undefined);
      assert.equal(cfg.waiaasWalletId, undefined);
    });

    it("accepts waiaas with payout allowlist", () => {
      const addr = "0x" + "1".repeat(40);
      const cfg = loadMcpConfig({
        ...waiaasEnv,
        CHAIN_LENS_PAYOUT_ALLOWLIST: addr,
      });
      assert.deepEqual(cfg.payoutAllowlist, [addr]);
    });
  });
});
