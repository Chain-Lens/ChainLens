import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { callHandler, type CallDeps } from "./call.js";
import type { Signer } from "../signer.js";

const BUYER = "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa" as `0x${string}`;
const MARKET = "0x45bB56fDB0E6bb14d178E417b67Ed7B3323ffFf7" as `0x${string}`;
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`;
const CHAIN_ID = 84532;
// 65-byte concatenated r(32) | s(32) | v(1)
const FAKE_SIG =
  ("0x" + "aa".repeat(32) + "bb".repeat(32) + "1b") as `0x${string}`;
const FAKE_NONCE =
  ("0x" + "cd".repeat(32)) as `0x${string}`;
const FAKE_JOB_REF =
  ("0x" + "ef".repeat(32)) as `0x${string}`;
const FAKE_TX =
  ("0x" + "12".repeat(32)) as `0x${string}`;

type SignCapture = {
  domain: unknown;
  primaryType: string;
  message: Record<string, unknown>;
};

function fakeSigner(captured: SignCapture[]): Signer {
  const s: unknown = {
    address: BUYER,
    async signTypedData(payload: {
      domain: unknown;
      primaryType: string;
      message: Record<string, unknown>;
    }) {
      captured.push({
        domain: payload.domain,
        primaryType: payload.primaryType,
        message: payload.message,
      });
      return FAKE_SIG;
    },
  };
  return s as Signer;
}

interface FetchCall {
  url: string;
  method: string | undefined;
  headers: Record<string, string>;
  body: unknown;
}

function fakeFetch(
  capture: FetchCall[],
  response:
    | { status: number; body: unknown }
    | { status: number; bodyText: string },
): typeof fetch {
  return (async (url: unknown, init: RequestInit = {}) => {
    let body: unknown;
    try {
      body = init.body ? JSON.parse(String(init.body)) : undefined;
    } catch {
      body = init.body;
    }
    capture.push({
      url: String(url),
      method: init.method,
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      body,
    });
    const resBody =
      "bodyText" in response
        ? response.bodyText
        : JSON.stringify(response.body);
    return new Response(resBody, {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    }) as unknown as Response;
  }) as typeof fetch;
}

function makeDeps(overrides: Partial<CallDeps> = {}): {
  deps: CallDeps;
  sign: SignCapture[];
  calls: FetchCall[];
} {
  const sign: SignCapture[] = [];
  const calls: FetchCall[] = [];
  const deps: CallDeps = {
    apiBaseUrl: "https://gw.example/api",
    fetch: fakeFetch(calls, {
      status: 200,
      body: {
        listingId: "7",
        jobRef: FAKE_JOB_REF,
        settleTxHash: FAKE_TX,
        usdc: USDC,
        delivery: "relayed_unmodified",
        safety: {
          trusted: false,
          scanned: true,
          schemaValid: true,
          warnings: [],
        },
        untrusted_data: { price: 150.23 },
        envelope: "<EXTERNAL_DATA ...>...</EXTERNAL_DATA>",
      },
    }),
    signer: fakeSigner(sign),
    marketAddress: MARKET,
    usdcAddress: USDC,
    chainId: CHAIN_ID,
    randomNonce: () => FAKE_NONCE,
    nowSeconds: () => 1_776_800_000n,
    ...overrides,
  };
  return { deps, sign, calls };
}

describe("chain-lens.call — happy path", () => {
  it("returns the parsed gateway response", async () => {
    const { deps } = makeDeps();
    const result = await callHandler(
      { listing_id: "7", inputs: { ticker: "TSLA" }, amount: "50000" },
      deps,
    );
    assert.equal(result.listingId, "7");
    assert.equal(result.jobRef, FAKE_JOB_REF);
    assert.equal(result.settleTxHash, FAKE_TX);
    assert.equal(result.delivery, "relayed_unmodified");
    assert.equal(result.safety.schemaValid, true);
    assert.deepEqual(result.untrustedData, { price: 150.23 });
    assert.ok(result.envelope?.includes("EXTERNAL_DATA"));
    assert.equal(result.usdc, USDC);
  });

  it("signs ReceiveWithAuthorization over the right domain + message", async () => {
    const { deps, sign } = makeDeps();
    await callHandler(
      { listing_id: "7", inputs: { ticker: "TSLA" }, amount: "50000" },
      deps,
    );
    assert.equal(sign.length, 1);
    const s = sign[0]!;
    assert.equal(s.primaryType, "ReceiveWithAuthorization");
    assert.deepEqual(s.domain, {
      name: "USDC",
      version: "2",
      chainId: CHAIN_ID,
      verifyingContract: USDC,
    });
    assert.equal(s.message["from"], BUYER);
    assert.equal(s.message["to"], MARKET);
    assert.equal(s.message["value"], 50_000n);
    assert.equal(s.message["validAfter"], 0n);
    assert.equal(s.message["validBefore"], 1_776_800_000n + 3_600n);
    assert.equal(s.message["nonce"], FAKE_NONCE);
  });

  it("GETs /x402/:id with query inputs and X-Payment header", async () => {
    const { deps, calls } = makeDeps();
    await callHandler(
      { listing_id: "7", inputs: { ticker: "TSLA" }, amount: "50000" },
      deps,
    );
    assert.equal(calls.length, 1);
    const c = calls[0]!;
    assert.equal(c.url, "https://gw.example/api/x402/7?ticker=TSLA");
    assert.equal(c.method, "GET");
    assert.equal(c.body, undefined);
    assert.ok(c.headers["x-payment"]);

    const payment = JSON.parse(
      Buffer.from(c.headers["x-payment"]!, "base64url").toString("utf8"),
    ) as {
      x402Version: number;
      scheme: string;
      network: string;
      payload: {
        authorization: Record<string, unknown>;
        signature: Record<string, unknown>;
      };
    };
    assert.equal(payment.x402Version, 1);
    assert.equal(payment.scheme, "exact");
    assert.equal(payment.network, "base-sepolia");
    assert.equal(payment.payload.authorization["from"], BUYER);
    assert.equal(payment.payload.authorization["to"], MARKET);
    assert.equal(payment.payload.authorization["value"], "50000");
    assert.equal(payment.payload.authorization["validAfter"], "0");
    assert.equal(
      payment.payload.authorization["validBefore"],
      String(1_776_800_000n + 3_600n),
    );
    assert.equal(payment.payload.authorization["nonce"], FAKE_NONCE);
    assert.equal(typeof payment.payload.signature["v"], "number");
    assert.match(String(payment.payload.signature["r"]), /^0x[0-9a-f]{64}$/);
    assert.match(String(payment.payload.signature["s"]), /^0x[0-9a-f]{64}$/);
  });
});

describe("chain-lens.call — input validation", () => {
  it("rejects non-decimal listing_id", async () => {
    const { deps } = makeDeps();
    await assert.rejects(
      callHandler(
        { listing_id: "abc", inputs: { a: 1 }, amount: "1" },
        deps,
      ),
      /listing_id must be a decimal string/,
    );
  });

  it("rejects array inputs", async () => {
    const { deps } = makeDeps();
    await assert.rejects(
      callHandler(
        { listing_id: "0", inputs: [] as unknown as Record<string, unknown>, amount: "1" },
        deps,
      ),
      /inputs must be a JSON object/,
    );
  });

  it("rejects non-decimal amount", async () => {
    const { deps } = makeDeps();
    await assert.rejects(
      callHandler(
        { listing_id: "0", inputs: { a: 1 }, amount: "-5" },
        deps,
      ),
      /amount must be a non-negative integer string/,
    );
  });

  it("rejects zero amount", async () => {
    const { deps } = makeDeps();
    await assert.rejects(
      callHandler(
        { listing_id: "0", inputs: { a: 1 }, amount: "0" },
        deps,
      ),
      /amount must be > 0/,
    );
  });
});

describe("chain-lens.call — gateway errors", () => {
  it("surfaces gateway 5xx with status and body", async () => {
    const calls: FetchCall[] = [];
    const { deps } = makeDeps({
      fetch: fakeFetch(calls, {
        status: 502,
        bodyText: JSON.stringify({
          error: "seller returned non-2xx",
          sellerStatus: 404,
        }),
      }),
    });
    await assert.rejects(
      callHandler(
        { listing_id: "7", inputs: { a: 1 }, amount: "100" },
        deps,
      ),
      /gateway returned 502.*seller returned non-2xx/s,
    );
  });

  it("throws when gateway omits jobRef/settleTxHash", async () => {
    const calls: FetchCall[] = [];
    const { deps } = makeDeps({
      fetch: fakeFetch(calls, {
        status: 200,
        body: { listingId: "7", data: { ok: true } },
      }),
    });
    await assert.rejects(
      callHandler(
        { listing_id: "7", inputs: { a: 1 }, amount: "100" },
        deps,
      ),
      /missing jobRef or settleTxHash/,
    );
  });
});

describe("chain-lens.call — custom domain overrides", () => {
  it("passes custom usdcEip712Name/Version into the signed domain", async () => {
    const { deps, sign } = makeDeps({
      usdcEip712Name: "TestUSD",
      usdcEip712Version: "1",
    });
    await callHandler(
      { listing_id: "0", inputs: { k: 1 }, amount: "100" },
      deps,
    );
    assert.deepEqual(sign[0]!.domain, {
      name: "TestUSD",
      version: "1",
      chainId: CHAIN_ID,
      verifyingContract: USDC,
    });
  });

  it("respects authValidSeconds", async () => {
    const { deps, sign } = makeDeps({ authValidSeconds: 60 });
    await callHandler(
      { listing_id: "0", inputs: { k: 1 }, amount: "100" },
      deps,
    );
    assert.equal(sign[0]!.message["validBefore"], 1_776_800_000n + 60n);
  });
});
