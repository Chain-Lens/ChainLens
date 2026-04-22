import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parsePriceToWei,
  normalizeGatewayUrl,
  parseRegisterArgs,
  runRegister,
  deriveWebUrl,
} from "./register.js";

test("parsePriceToWei: integer USDC", () => {
  assert.equal(parsePriceToWei("1"), "1000000");
  assert.equal(parsePriceToWei("0"), "0");
  assert.equal(parsePriceToWei("42"), "42000000");
});

test("parsePriceToWei: decimal USDC", () => {
  assert.equal(parsePriceToWei("0.05"), "50000");
  assert.equal(parsePriceToWei("0.000001"), "1");
  assert.equal(parsePriceToWei("1.5"), "1500000");
  assert.equal(parsePriceToWei("0.1"), "100000");
});

test("parsePriceToWei: rejects invalid formats", () => {
  assert.throws(() => parsePriceToWei("-1"), /not a valid decimal/);
  assert.throws(() => parsePriceToWei("1e6"), /not a valid decimal/);
  assert.throws(() => parsePriceToWei(""), /not a valid decimal/);
});

test("parsePriceToWei: rejects excess fraction digits", () => {
  assert.throws(() => parsePriceToWei("0.0000001"), /supports at most 6/);
});

test("normalizeGatewayUrl: strips trailing slash", () => {
  assert.equal(normalizeGatewayUrl("http://x/api/"), "http://x/api");
  assert.equal(normalizeGatewayUrl("http://x/api"), "http://x/api");
  assert.equal(normalizeGatewayUrl("http://x/api///"), "http://x/api");
});

test("deriveWebUrl: strips /api from public gateway", () => {
  assert.equal(
    deriveWebUrl("https://chainlens.pelicanlab.dev/api", {} as NodeJS.ProcessEnv),
    "https://chainlens.pelicanlab.dev",
  );
});

test("deriveWebUrl: localhost :3001 (backend) → :3000 (frontend)", () => {
  assert.equal(
    deriveWebUrl("http://localhost:3001/api", {} as NodeJS.ProcessEnv),
    "http://localhost:3000",
  );
  assert.equal(
    deriveWebUrl("http://127.0.0.1:3001/api", {} as NodeJS.ProcessEnv),
    "http://127.0.0.1:3000",
  );
});

test("deriveWebUrl: CHAIN_LENS_WEB_URL env overrides derivation", () => {
  assert.equal(
    deriveWebUrl("http://localhost:3001/api", {
      CHAIN_LENS_WEB_URL: "https://admin.example/",
    } as NodeJS.ProcessEnv),
    "https://admin.example",
  );
});

async function baseDeps(overrides: { cwd?: string; env?: NodeJS.ProcessEnv; deployState?: { url: string } | null } = {}) {
  return {
    cwd: overrides.cwd ?? "/tmp/my-seller",
    env: overrides.env ?? ({} as NodeJS.ProcessEnv),
    readDeployState: async () => overrides.deployState ?? null,
  };
}

test("parseRegisterArgs: happy path with --endpoint override", async () => {
  const opts = await parseRegisterArgs(
    [
      "--task-type", "defillama_tvl",
      "--price", "0.05",
      "--wallet", "0xD21dE9470d8A0dbae0dE0b5f705001a6482Db580",
      "--endpoint", "https://my-seller.vercel.app",
      "--gateway", "https://cl.example.com/api/",
      "--name", "My Seller",
      "--description", "hi",
    ],
    await baseDeps(),
  );
  assert.equal(opts.priceUsdcWei, "50000");
  assert.equal(opts.endpoint, "https://my-seller.vercel.app");
  assert.equal(opts.gatewayUrl, "https://cl.example.com/api");
  assert.equal(opts.name, "My Seller");
});

test("parseRegisterArgs: endpoint falls back to deploy state", async () => {
  const opts = await parseRegisterArgs(
    ["--task-type", "defillama_tvl", "--price", "0.05", "--wallet", "0x".padEnd(42, "a")],
    await baseDeps({ deployState: { url: "https://from-state.vercel.app" } }),
  );
  assert.equal(opts.endpoint, "https://from-state.vercel.app");
});

test("parseRegisterArgs: rejects missing endpoint", async () => {
  await assert.rejects(
    parseRegisterArgs(
      ["--task-type", "defillama_tvl", "--price", "0.05", "--wallet", "0x".padEnd(42, "a")],
      await baseDeps({ deployState: null }),
    ),
    /--endpoint not given/,
  );
});

test("parseRegisterArgs: rejects bad wallet", async () => {
  await assert.rejects(
    parseRegisterArgs(
      ["--task-type", "defillama_tvl", "--price", "0.05", "--wallet", "0xNOT"],
      await baseDeps(),
    ),
    /not a 0x-prefixed/,
  );
});

test("parseRegisterArgs: --wallet falls back to CHAIN_LENS_PAYOUT_ADDRESS env", async () => {
  const addr = "0x" + "a".repeat(40);
  const opts = await parseRegisterArgs(
    ["--task-type", "defillama_tvl", "--price", "0.05", "--endpoint", "https://x.vercel.app"],
    await baseDeps({
      env: { CHAIN_LENS_PAYOUT_ADDRESS: addr } as NodeJS.ProcessEnv,
    }),
  );
  assert.equal(opts.sellerAddress, addr);
});

test("parseRegisterArgs: rejects when neither --wallet nor env is set", async () => {
  await assert.rejects(
    parseRegisterArgs(
      ["--task-type", "defillama_tvl", "--price", "0.05", "--endpoint", "https://x.vercel.app"],
      await baseDeps(),
    ),
    /payout address required[\s\S]*NOT a private key/,
  );
});

test("parseRegisterArgs: gateway defaults to public MVP when no flag/env", async () => {
  const opts = await parseRegisterArgs(
    [
      "--task-type", "defillama_tvl",
      "--price", "0.05",
      "--wallet", "0x".padEnd(42, "a"),
      "--endpoint", "https://x.vercel.app",
    ],
    await baseDeps(),
  );
  assert.equal(opts.gatewayUrl, "https://chainlens.pelicanlab.dev/api");
});

test("parseRegisterArgs: rejects missing task type", async () => {
  await assert.rejects(
    parseRegisterArgs(["--price", "0.05", "--wallet", "0x".padEnd(42, "a")], await baseDeps()),
    /--task-type is required/,
  );
});

test("parseRegisterArgs: rejects invalid task type", async () => {
  await assert.rejects(
    parseRegisterArgs(
      ["--task-type", "bogus", "--price", "0.05", "--wallet", "0x".padEnd(42, "a")],
      await baseDeps(),
    ),
    /must be one of/,
  );
});

test("parseRegisterArgs: uses CHAIN_LENS_API_URL env default", async () => {
  const opts = await parseRegisterArgs(
    [
      "--task-type", "defillama_tvl",
      "--price", "0.05",
      "--wallet", "0x".padEnd(42, "a"),
      "--endpoint", "https://x.vercel.app",
    ],
    await baseDeps({ env: { CHAIN_LENS_API_URL: "https://gw.example/api/" } as NodeJS.ProcessEnv }),
  );
  assert.equal(opts.gatewayUrl, "https://gw.example/api");
});

test("parseRegisterArgs: name defaults to basename(cwd)", async () => {
  const opts = await parseRegisterArgs(
    [
      "--task-type", "defillama_tvl",
      "--price", "0.05",
      "--wallet", "0x".padEnd(42, "a"),
      "--endpoint", "https://x.vercel.app",
    ],
    await baseDeps({ cwd: "/tmp/my-awesome-seller" }),
  );
  assert.equal(opts.name, "my-awesome-seller");
  assert.equal(opts.description, "ChainLens seller for defillama_tvl");
});

test("runRegister: POSTs the expected payload and returns parsed JSON", async () => {
  const calls: Array<{ url: string | URL; init?: RequestInit }> = [];
  const fakeFetch: typeof fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ id: "abc", status: "PENDING" }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  };
  const out: string[] = [];
  const result = await runRegister(
    {
      name: "x",
      description: "y",
      taskType: "defillama_tvl",
      priceUsdcWei: "50000",
      sellerAddress: "0xdead000000000000000000000000000000000000",
      endpoint: "https://x.vercel.app",
      gatewayUrl: "http://localhost:3001/api",
      webUrl: "http://localhost:3000",
    },
    { fetch: fakeFetch, stdout: (m) => out.push(m) },
  );
  assert.deepEqual(result, { id: "abc", status: "PENDING" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://localhost:3001/api/apis/register");
  const joined = out.join("");
  assert.match(joined, /Track status \+ view endpoint: http:\/\/localhost:3000\/seller/);
  assert.equal(calls[0].init?.method, "POST");
  const body = JSON.parse(calls[0].init?.body as string) as Record<string, unknown>;
  assert.equal(body.name, "x");
  assert.equal(body.price, "50000");
  assert.equal(body.category, "defillama_tvl");
  assert.equal(body.sellerAddress, "0xdead000000000000000000000000000000000000");
});

test("runRegister: throws with gateway error body on non-ok", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ error: "duplicate" }), { status: 400 });
  await assert.rejects(
    runRegister(
      {
        name: "x",
        description: "y",
        taskType: "defillama_tvl",
        priceUsdcWei: "50000",
        sellerAddress: "0xdead000000000000000000000000000000000000",
        endpoint: "https://x.vercel.app",
        gatewayUrl: "http://localhost:3001/api",
        webUrl: "http://localhost:3000",
      },
      { fetch: fakeFetch, stdout: () => {} },
    ),
    /gateway responded 400[\s\S]*duplicate/,
  );
});
