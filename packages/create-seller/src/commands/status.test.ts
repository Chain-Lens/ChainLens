import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchHealth, fetchReputation, parseStatusArgs, runStatus } from "./status.js";

function baseDeps(overrides: { cwd?: string; env?: NodeJS.ProcessEnv; deployState?: { url: string } | null } = {}) {
  return {
    cwd: overrides.cwd ?? "/tmp/my-seller",
    env: overrides.env ?? ({} as NodeJS.ProcessEnv),
    readDeployState: async () => overrides.deployState ?? null,
  };
}

test("parseStatusArgs: rejects when neither --wallet nor env is set", async () => {
  await assert.rejects(parseStatusArgs([], baseDeps()), /payout address required/);
});

test("parseStatusArgs: rejects bad wallet", async () => {
  await assert.rejects(
    parseStatusArgs(["--wallet", "0xNOT"], baseDeps()),
    /not a 0x-prefixed/,
  );
});

test("parseStatusArgs: --wallet falls back to CHAIN_LENS_PAYOUT_ADDRESS env", async () => {
  const addr = "0x" + "b".repeat(40);
  const opts = await parseStatusArgs(
    [],
    baseDeps({ env: { CHAIN_LENS_PAYOUT_ADDRESS: addr } as NodeJS.ProcessEnv }),
  );
  assert.equal(opts.sellerAddress, addr);
});

test("parseStatusArgs: gateway defaults to public MVP when no flag/env", async () => {
  const opts = await parseStatusArgs(
    ["--wallet", "0x".padEnd(42, "a")],
    baseDeps(),
  );
  assert.equal(opts.gatewayUrl, "https://chainlens.pelicanlab.dev/api");
});

test("parseStatusArgs: env CHAIN_LENS_API_URL fallback + trailing slash strip", async () => {
  const opts = await parseStatusArgs(
    ["--wallet", "0x".padEnd(42, "a")],
    baseDeps({ env: { CHAIN_LENS_API_URL: "https://gw.example/api//" } as NodeJS.ProcessEnv }),
  );
  assert.equal(opts.gatewayUrl, "https://gw.example/api");
  assert.equal(opts.healthUrl, null);
});

test("parseStatusArgs: healthUrl derived from deploy state", async () => {
  const opts = await parseStatusArgs(
    ["--wallet", "0x".padEnd(42, "a")],
    baseDeps({ deployState: { url: "https://my-seller.vercel.app/" } }),
  );
  assert.equal(opts.healthUrl, "https://my-seller.vercel.app/health");
});

test("fetchReputation: returns body on 200", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response(
      JSON.stringify({ jobsCompleted: "3", jobsFailed: "0", totalEarnings: "150000" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  const r = await fetchReputation(
    { sellerAddress: "0xabc".padEnd(42, "0") as string, gatewayUrl: "http://x/api" },
    { fetch: fakeFetch },
  );
  assert.deepEqual(r, { jobsCompleted: "3", jobsFailed: "0", totalEarnings: "150000" });
});

test("fetchReputation: surfaces error body on 404", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ error: "seller_not_registered" }), { status: 404 });
  const r = await fetchReputation(
    { sellerAddress: "0x".padEnd(42, "a"), gatewayUrl: "http://x/api" },
    { fetch: fakeFetch },
  );
  assert.deepEqual(r, { error: "seller_not_registered", status: 404 });
});

test("fetchReputation: flattens nested error object instead of [object Object]", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response(
      JSON.stringify({ error: { message: "Internal failure", detail: "db connection" } }),
      { status: 500 },
    );
  const r = await fetchReputation(
    { sellerAddress: "0x".padEnd(42, "a"), gatewayUrl: "http://x/api" },
    { fetch: fakeFetch },
  );
  assert.equal((r as { error: string }).error, "Internal failure");
});

test("fetchReputation: falls back to JSON.stringify when no message field", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ foo: "bar", baz: 1 }), { status: 502 });
  const r = await fetchReputation(
    { sellerAddress: "0x".padEnd(42, "a"), gatewayUrl: "http://x/api" },
    { fetch: fakeFetch },
  );
  assert.equal((r as { error: string }).error, '{"foo":"bar","baz":1}');
});

test("fetchReputation: hits the correct URL", async () => {
  const seen: string[] = [];
  const fakeFetch: typeof fetch = async (url) => {
    seen.push(String(url));
    return new Response("{}", { status: 200 });
  };
  await fetchReputation(
    { sellerAddress: "0xDEAD".padEnd(42, "0"), gatewayUrl: "http://cl/api" },
    { fetch: fakeFetch },
  );
  assert.equal(seen[0], "http://cl/api/reputation/0xDEAD000000000000000000000000000000000000");
});

test("fetchHealth: returns ok=true on 200 JSON", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  const h = await fetchHealth("https://x/health", { fetch: fakeFetch });
  assert.equal(h.ok, true);
  assert.deepEqual(h.body, { status: "ok" });
});

test("fetchHealth: returns ok=false on network error", async () => {
  const fakeFetch: typeof fetch = async () => {
    throw new Error("ECONNREFUSED");
  };
  const h = await fetchHealth("https://x/health", { fetch: fakeFetch });
  assert.equal(h.ok, false);
  assert.match(h.error ?? "", /ECONNREFUSED/);
});

test("runStatus: prints both sections when health URL is set", async () => {
  const out: string[] = [];
  const fakeFetch: typeof fetch = async (url) => {
    const u = String(url);
    if (u.endsWith("/health")) {
      return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
    }
    return new Response(
      JSON.stringify({ jobsCompleted: "1", jobsFailed: "0", totalEarnings: "50000" }),
      { status: 200 },
    );
  };
  await runStatus(
    {
      sellerAddress: "0x".padEnd(42, "d"),
      gatewayUrl: "http://x/api",
      healthUrl: "https://seller.vercel.app/health",
    },
    { fetch: fakeFetch, stdout: (m) => out.push(m) },
  );
  const joined = out.join("");
  assert.match(joined, /Reputation/);
  assert.match(joined, /jobsCompleted: 1/);
  assert.match(joined, /Health \(https:\/\/seller\.vercel\.app\/health\)/);
});

test("runStatus: skips health when no deploy state", async () => {
  const out: string[] = [];
  const fakeFetch: typeof fetch = async () =>
    new Response(
      JSON.stringify({ jobsCompleted: "0", jobsFailed: "0", totalEarnings: "0" }),
      { status: 200 },
    );
  await runStatus(
    {
      sellerAddress: "0x".padEnd(42, "d"),
      gatewayUrl: "http://x/api",
      healthUrl: null,
    },
    { fetch: fakeFetch, stdout: (m) => out.push(m) },
  );
  assert.match(out.join(""), /Health: no \.chain-lens-deploy\.json — skip/);
});
