import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isValidSlug,
  isOfficialLookingUrl,
  findMarketingLanguage,
  isStaleVerified,
  usdcToAtomic,
  isValidEvmAddress,
  isPlainObject,
} from "./common.js";

describe("isValidSlug", () => {
  it("accepts lowercase-hyphen slugs", () => {
    assert.ok(isValidSlug("alchemy"));
    assert.ok(isValidSlug("my-provider"));
    assert.ok(isValidSlug("provider-123"));
  });
  it("rejects uppercase, spaces, underscores", () => {
    assert.equal(isValidSlug("My-Provider"), false);
    assert.equal(isValidSlug("my provider"), false);
    assert.equal(isValidSlug("my_provider"), false);
    assert.equal(isValidSlug("-leading"), false);
    assert.equal(isValidSlug("trailing-"), false);
  });
});

describe("isOfficialLookingUrl", () => {
  it("accepts https URLs", () => {
    assert.ok(isOfficialLookingUrl("https://example.com"));
  });
  it("rejects http and invalid URLs", () => {
    assert.equal(isOfficialLookingUrl("http://example.com"), false);
    assert.equal(isOfficialLookingUrl("not-a-url"), false);
  });
});

describe("findMarketingLanguage", () => {
  it("detects marketing phrases", () => {
    assert.ok(findMarketingLanguage("The best in class solution").length > 0);
    assert.ok(findMarketingLanguage("lightning-fast API").length > 0);
    assert.ok(findMarketingLanguage("seamless integration").length > 0);
  });
  it("returns empty for neutral text", () => {
    assert.deepEqual(findMarketingLanguage("Provides real-time price data for DeFi protocols."), []);
  });
});

describe("isStaleVerified", () => {
  it("returns true for missing/null", () => {
    assert.ok(isStaleVerified(undefined));
    assert.ok(isStaleVerified(null));
    assert.ok(isStaleVerified(""));
  });
  it("returns true for old date", () => {
    assert.ok(isStaleVerified("2020-01-01"));
  });
  it("returns false for recent date", () => {
    const recent = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    assert.equal(isStaleVerified(recent), false);
  });
});

describe("usdcToAtomic", () => {
  it("converts 0.05 to 50000", () => {
    assert.equal(usdcToAtomic(0.05), "50000");
  });
  it("converts 1 to 1000000", () => {
    assert.equal(usdcToAtomic(1), "1000000");
  });
});

describe("isValidEvmAddress", () => {
  it("accepts valid 0x addresses", () => {
    assert.ok(isValidEvmAddress("0x" + "a".repeat(40)));
  });
  it("rejects short or missing 0x prefix", () => {
    assert.equal(isValidEvmAddress("0xabc"), false);
    assert.equal(isValidEvmAddress("a".repeat(40)), false);
  });
});

describe("isPlainObject", () => {
  it("returns true for plain objects", () => {
    assert.ok(isPlainObject({}));
    assert.ok(isPlainObject({ a: 1 }));
  });
  it("returns false for arrays and null", () => {
    assert.equal(isPlainObject([]), false);
    assert.equal(isPlainObject(null), false);
    assert.equal(isPlainObject("str"), false);
  });
});
