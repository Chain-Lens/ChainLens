"use client";

import { useState } from "react";
import { CHAIN_LENS_MARKET_ADDRESSES, USDC_ADDRESSES } from "@chain-lens/shared";

const CHAIN_ID = 84532;
const MARKET = CHAIN_LENS_MARKET_ADDRESSES[CHAIN_ID]!;
const USDC = USDC_ADDRESSES[CHAIN_ID]!;
const BASE_URL = "https://chainlens.pelicanlab.dev/api";

function TerminalWindow({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl overflow-hidden my-6" style={{ border: "1px solid var(--border2)" }}>
      <div className="px-4 py-3 flex items-center gap-2" style={{ background: "var(--bg3)" }}>
        <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
        <span className="w-3 h-3 rounded-full bg-yellow-400 inline-block" />
        <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
        <span className="ml-3 text-xs font-mono" style={{ color: "var(--text2)" }}>{title}</span>
      </div>
      <div className="px-6 py-5 text-sm leading-relaxed overflow-x-auto" style={{ background: "var(--bg)", fontFamily: "var(--font-mono)", color: "var(--text)" }}>
        {children}
      </div>
    </div>
  );
}

function Line({
  prompt = true,
  children,
  color = "white",
}: {
  prompt?: boolean;
  children: React.ReactNode;
  color?: "white" | "green" | "blue" | "yellow" | "purple" | "gray";
}) {
  const colorMap: Record<string, string> = {
    white:  "var(--text)",
    green:  "var(--green)",
    blue:   "var(--cyan)",
    yellow: "#e3b341",
    purple: "var(--purple)",
    gray:   "var(--text3)",
  };
  return (
    <div className="flex items-start gap-2 py-0.5">
      {prompt && <span style={{ color: "var(--green)" }} className="select-none">$</span>}
      <span style={{ color: colorMap[color] }}>{children}</span>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-xs px-2 py-1 rounded transition-colors"
      style={{ background: "var(--border)", color: "var(--text2)", border: "1px solid var(--border2)" }}
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function CodeBlock({ code, language = "typescript" }: { code: string; language?: string }) {
  return (
    <div className="relative rounded-xl overflow-hidden my-6" style={{ border: "1px solid var(--border2)" }}>
      <div className="px-4 py-2 flex items-center justify-between" style={{ background: "var(--bg3)" }}>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
          <span className="w-3 h-3 rounded-full bg-yellow-400 inline-block" />
          <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
          <span className="ml-3 text-xs font-mono" style={{ color: "var(--text2)" }}>{language}</span>
        </div>
        <CopyButton text={code} />
      </div>
      <pre className="px-6 py-5 text-sm leading-relaxed overflow-x-auto" style={{ background: "var(--bg)", color: "var(--text)", fontFamily: "var(--font-mono)" }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

const quickstartCode = `const BASE = "${BASE_URL}";
const LISTING_ID = "3";      // from /api/market/listings
const AMOUNT = "50000";      // 0.05 USDC (6 decimals)
const INPUTS = { protocol: "uniswap" };
const X_PAYMENT = "<base64url-json>"; // signed ReceiveWithAuthorization payload

// Current v3 flow: call the listing-specific x402 endpoint.
const res = await fetch(
  \`\${BASE}/x402/\${LISTING_ID}?\${new URLSearchParams(INPUTS as Record<string, string>)}\`,
  {
    method: "GET",
    headers: { "X-Payment": X_PAYMENT },
  },
);

if (!res.ok) {
  throw new Error(\`Gateway returned \${res.status} \${res.statusText}\`);
}

const out = await res.json();
console.log({
  listingId: out.listingId,
  jobRef: out.jobRef,
  settleTxHash: out.settleTxHash,
  delivery: out.delivery,
  safety: out.safety,
  untrustedData: out.untrusted_data,
});
`;

const legacyQuickstartCode = `import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  keccak256,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const ESCROW = "0x1F7dE3fdDA5216236c7F413F2AD03bF19A3F319E";
const USDC   = "${USDC}";
const BASE   = "${BASE_URL}";

// Sorted-key JSON so buyer + gateway compute the same inputsHash.
function canonicalJSON(v: unknown): string {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return JSON.stringify(v);
  const keys = Object.keys(v as object).sort();
  const pairs = keys.map((k) => \`\${JSON.stringify(k)}:\${canonicalJSON((v as Record<string, unknown>)[k])}\`);
  return \`{\${pairs.join(",")}}\`;
}
const inputsHash = (inputs: unknown) => keccak256(toHex(canonicalJSON(inputs)));

const ERC20_ABI  = parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]);
const ESCROW_ABI = parseAbi([
  "function createJob(address seller, bytes32 taskType, uint256 amount, bytes32 inputsHash, uint256 apiId) returns (uint256)",
]);

export async function callAPI(params: {
  apiId: bigint;          // on-chain apiId from /api/apis
  seller: \`0x\${string}\`;  // seller address from the listing
  taskType: \`0x\${string}\`; // keccak256(taskType name), from /api/task-types
  amount: bigint;         // USDC in wei (6 decimals, e.g. 50_000n = 0.05 USDC)
  inputs: Record<string, unknown>;
  privateKey: \`0x\${string}\`;
}) {
  const account = privateKeyToAccount(params.privateKey);
  const wallet  = createWalletClient({ account, chain: baseSepolia, transport: http() });
  const pub     = createPublicClient({ chain: baseSepolia, transport: http() });

  // 1. Approve USDC to the escrow (skip if already approved for >= amount).
  const approveTx = await wallet.writeContract({
    address: USDC, abi: ERC20_ABI, functionName: "approve",
    args: [ESCROW, params.amount],
  });
  await pub.waitForTransactionReceipt({ hash: approveTx });

  // 2. createJob — locks USDC in escrow, emits JobCreated(jobId, ...).
  const hash = inputsHash(params.inputs);
  const createTx = await wallet.writeContract({
    address: ESCROW, abi: ESCROW_ABI, functionName: "createJob",
    args: [params.seller, params.taskType, params.amount, hash, params.apiId],
  });
  const receipt = await pub.waitForTransactionReceipt({ hash: createTx });

  // 3. Decode the emitted jobId (first topic of JobCreated), then poll evidence.
  //    The gateway fetches the seller's response, validates it against the
  //    task-type schema, and submits responseHash on-chain. Evidence appears
  //    as soon as submitJob lands — usually within 5-10 seconds.
  const jobIdHex = receipt.logs[0]?.topics[1]!;
  const jobId = BigInt(jobIdHex);

  for (let i = 0; i < 30; i++) {
    const res = await fetch(\`\${BASE}/evidence/\${jobId}\`);
    if (res.ok) {
      const ev = await res.json();
      if (ev.status === "COMPLETED" || ev.status === "REFUNDED") return ev;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(\`evidence poll timed out for job \${jobId}\`);
}`;

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code
      className="text-sm px-1.5 py-0.5 rounded"
      style={{ background: "var(--bg3)", color: "var(--cyan)", fontFamily: "var(--font-mono)" }}
    >
      {children}
    </code>
  );
}

export default function DocsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      {/* Hero */}
      <div className="mb-12">
        <span
          className="text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full"
          style={{ background: "var(--accent-dim)", color: "var(--accent)" }}
        >
          Agent Guide
        </span>
        <h1 className="mt-4 text-4xl font-bold" style={{ color: "var(--text)" }}>How to use ChainLens</h1>
        <p className="mt-3 text-lg" style={{ color: "var(--text2)" }}>
          Any AI agent with a wallet can pay for verified data in USDC. This
          page now focuses on the current v3 market flow: discover a listing,
          inspect it, then pay through the x402 gateway. Legacy v2 evidence
          flow is still noted where relevant.
        </p>
      </div>

      {/* TOC */}
      <nav
        className="mb-12 p-5 rounded-xl text-sm"
        style={{ background: "var(--bg2)", border: "1px solid var(--border)" }}
      >
        <p className="font-semibold mb-3" style={{ color: "var(--text)" }}>On this page</p>
        <ol className="list-decimal list-inside space-y-1" style={{ color: "var(--text2)" }}>
          {[
            ["#prereqs",    "Prerequisites"],
            ["#flow",       "Payment flow overview"],
            ["#step1",      "Step 1 — Discover a listing"],
            ["#step2",      "Step 2 — Inspect before you spend"],
            ["#step3",      "Step 3 — Sign and call through x402"],
            ["#step4",      "Step 4 — Verify settlement and response"],
            ["#quickstart", "Full quickstart code"],
            ["#contract",   "Contract reference"],
            ["#alt",        "Alternatives (MCP, x402 HTTP)"],
          ].map(([href, label]) => (
            <li key={href}>
              <a href={href} className="transition-colors" style={{ color: "var(--text2)" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--green)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text2)")}
              >
                {label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* Prerequisites */}
      <section id="prereqs" className="mb-14">
        <h2 className="text-2xl font-bold mb-4" style={{ color: "var(--text)" }}>1. Prerequisites</h2>
        <p className="mb-4" style={{ color: "var(--text2)" }}>
          A wallet on <strong style={{ color: "var(--text)" }}>Base Sepolia</strong> with
          testnet ETH (for gas) and testnet USDC (for payment).
        </p>
        <ul className="list-disc list-inside space-y-1 mb-4" style={{ color: "var(--text2)" }}>
          <li>Node.js 20+</li>
          <li>
            Base Sepolia ETH —{" "}
            <a
              href="https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--cyan)" }}
              className="underline"
            >
              Coinbase faucet
            </a>
          </li>
          <li>
            Base Sepolia USDC —{" "}
            <a
              href="https://faucet.circle.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--cyan)" }}
              className="underline"
            >
              Circle faucet
            </a>
          </li>
          <li><InlineCode>viem</InlineCode></li>
        </ul>
        <TerminalWindow title="terminal — install dependencies">
          <Line>npm install viem</Line>
          <Line prompt={false} color="gray">+ viem@2.x.x</Line>
        </TerminalWindow>
      </section>

      {/* Flow overview */}
      <section id="flow" className="mb-14">
        <h2 className="text-2xl font-bold mb-4" style={{ color: "var(--text)" }}>2. Payment flow overview</h2>
        <p className="mb-4" style={{ color: "var(--text2)" }}>
          ChainLens now routes paid calls through{" "}
          <InlineCode>ChainLensMarket</InlineCode> and the listing-specific{" "}
          <InlineCode>/api/x402/:listingId</InlineCode> gateway path. The buyer
          signs a USDC <InlineCode>ReceiveWithAuthorization</InlineCode>, the
          gateway executes the seller API, and settlement happens on-chain only
          after a successful response. Failed seller calls drop the signed
          authorization, so no USDC moves.
        </p>
        <TerminalWindow title="terminal — flow diagram">
          <Line prompt={false} color="blue">┌─────────────────────────────────────────────────────────────┐</Line>
          <Line prompt={false} color="blue">│                 ChainLens v2 payment flow                   │</Line>
          <Line prompt={false} color="blue">├─────────────────────────────────────────────────────────────┤</Line>
          <Line prompt={false} color="yellow">│  1. GET /api/market/listings?q=&lt;search&gt;                     │</Line>
          <Line prompt={false} color="gray">│     → [{"{ listingId, metadata, stats, score, ... }"}]             │</Line>
          <Line prompt={false} color="blue">│                                                             │</Line>
          <Line prompt={false} color="yellow">│  2. GET /api/market/listings/&lt;listingId&gt;                    │</Line>
          <Line prompt={false} color="gray">│     → full metadata, examples, recent errors               │</Line>
          <Line prompt={false} color="blue">│                                                             │</Line>
          <Line prompt={false} color="yellow">│  3. GET /api/x402/&lt;listingId&gt;?inputs...                     │</Line>
          <Line prompt={false} color="yellow">│     + X-Payment: signed ReceiveWithAuthorization           │</Line>
          <Line prompt={false} color="blue">│                                                             │</Line>
          <Line prompt={false} color="gray">│     Gateway calls seller → validates response →             │</Line>
          <Line prompt={false} color="gray">│     settles on ChainLensMarket only on success              │</Line>
          <Line prompt={false} color="blue">│                                                             │</Line>
          <Line prompt={false} color="yellow">│  4. Response includes settleTxHash + seller payload         │</Line>
          <Line prompt={false} color="green">│     → {"{ jobRef, settleTxHash, safety, untrusted_data }"}       │</Line>
          <Line prompt={false} color="blue">└─────────────────────────────────────────────────────────────┘</Line>
        </TerminalWindow>
      </section>

      {/* Step 1 — Discover */}
      <section id="step1" className="mb-14">
        <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--text)" }}>3. Step 1 — Discover a listing</h2>
        <p className="mb-4" style={{ color: "var(--text2)" }}>
          Search active approved listings through the public market index.
          Query by free-text, tags, success rate, price ceiling, or sort mode.
        </p>
        <TerminalWindow title="terminal — discover">
          <Line>curl &quot;{BASE_URL}/market/listings?q=defillama&amp;sort=score_strict&quot;</Line>
          <Line prompt={false} color="gray">{"{"}</Line>
          <Line prompt={false} color="gray">{"  "}<span style={{ color: "#e3b341" }}>&quot;items&quot;</span>: [{"{"}</Line>
          <Line prompt={false} color="gray">{"    "}<span style={{ color: "#e3b341" }}>&quot;listingId&quot;</span>: <span style={{ color: "var(--green)" }}>&quot;3&quot;</span>,</Line>
          <Line prompt={false} color="gray">{"    "}<span style={{ color: "#e3b341" }}>&quot;owner&quot;</span>: <span style={{ color: "var(--green)" }}>&quot;0xSellerAddress…&quot;</span>,</Line>
          <Line prompt={false} color="gray">{"    "}<span style={{ color: "#e3b341" }}>&quot;priceUsdc&quot;</span>: <span style={{ color: "var(--green)" }}>&quot;0.050000 USDC&quot;</span>,</Line>
          <Line prompt={false} color="gray">{"    "}<span style={{ color: "#e3b341" }}>&quot;metadata&quot;</span>: {"{ "}<span style={{ color: "#e3b341" }}>&quot;name&quot;</span>: <span style={{ color: "var(--green)" }}>&quot;DeFiLlama TVL&quot;</span> {"}"},</Line>
          <Line prompt={false} color="gray">{"    "}<span style={{ color: "#e3b341" }}>&quot;stats&quot;</span>: {"{ "}<span style={{ color: "#e3b341" }}>&quot;successRate&quot;</span>: <span style={{ color: "var(--green)" }}>0.98</span> {"}"}</Line>
          <Line prompt={false} color="gray">{"  }], "}<span style={{ color: "#e3b341" }}>&quot;total&quot;</span>: <span style={{ color: "var(--green)" }}>1</span></Line>
          <Line prompt={false} color="gray">{"}"}</Line>
        </TerminalWindow>
        <p className="mb-2" style={{ color: "var(--text2)" }}>
          Once you have a promising listing id, inspect it before spending:
        </p>
        <TerminalWindow title="terminal — inspect">
          <Line>curl &quot;{BASE_URL}/market/listings/3&quot;</Line>
          <Line prompt={false} color="gray">{"// → { metadata, stats, recentErrors, adminStatus, ... }"}</Line>
        </TerminalWindow>
        <div
          className="rounded-lg p-4 text-sm"
          style={{ background: "rgba(121,192,255,0.08)", border: "1px solid rgba(121,192,255,0.25)", color: "var(--cyan)" }}
        >
          <strong>Tip:</strong> Human-browsable at{" "}
          <a href="/discover" className="underline font-medium" style={{ color: "var(--cyan)" }}>
            /discover
          </a>
          . Filter + click through to see schema hints, examples, and recent seller stats.
        </div>
      </section>

      {/* Step 2 — Inspect */}
      <section id="step2" className="mb-14">
        <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--text)" }}>4. Step 2 — Inspect before you spend</h2>
        <p className="mb-4" style={{ color: "var(--text2)" }}>
          The listing detail response tells you whether a paid call is worth it:
          endpoint/method, example request and response, 30-day success rate,
          latency, and recent policy rejects.
        </p>
        <TerminalWindow title="terminal — what to check">
          <Line prompt={false} color="gray">{"// metadata.endpoint / metadata.method"}</Line>
          <Line prompt={false} color="gray">{"// metadata.inputs_schema / example_request"}</Line>
          <Line prompt={false} color="gray">{"// stats.successRate / stats.avgLatencyMs"}</Line>
          <Line prompt={false} color="gray">{"// recentErrors.breakdown.response_rejected_schema"}</Line>
        </TerminalWindow>
      </section>

      {/* Step 3 — x402 call */}
      <section id="step3" className="mb-14">
        <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--text)" }}>5. Step 3 — Sign and call through x402</h2>
        <p className="mb-4" style={{ color: "var(--text2)" }}>
          The current paid path is a signed USDC authorization sent in the{" "}
          <InlineCode>X-Payment</InlineCode> header to the listing-specific
          x402 route. The gateway executes the seller API first, then settles
          on <InlineCode>ChainLensMarket</InlineCode> only on success.
        </p>
        <p className="mb-4" style={{ color: "var(--text2)" }}>
          Inputs are forwarded as query params for GET listings or request body
          for POST listings, depending on listing metadata. The frontend
          purchase card already handles this flow for human users.
        </p>
        <TerminalWindow title="terminal — x402 paid call">
          <Line>curl -H &quot;X-Payment: &lt;base64url-json&gt;&quot; &quot;{BASE_URL}/x402/3?protocol=uniswap&quot;</Line>
          <Line prompt={false} color="gray">{"// → { jobRef, settleTxHash, safety, untrusted_data, ... }"}</Line>
        </TerminalWindow>
        <div
          className="rounded-lg p-4 text-sm"
          style={{ background: "rgba(255,166,87,0.08)", border: "1px solid rgba(255,166,87,0.25)", color: "var(--orange)" }}
        >
          <strong>Note:</strong> If the seller fails schema validation,
          times out, or trips the policy filter, the v3 gateway drops the
          signed authorization and no USDC moves.
        </div>
      </section>

      {/* Step 4 — verify */}
      <section id="step4" className="mb-14">
        <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--text)" }}>6. Step 4 — Verify settlement and response</h2>
        <p className="mb-4" style={{ color: "var(--text2)" }}>
          A successful v3 call returns the settlement tx hash immediately along
          with the seller response and safety metadata. Legacy v2 clients may
          still poll `/api/evidence/:jobId`, but that is no longer the primary
          buyer path.
        </p>
        <TerminalWindow title="terminal — settlement result">
          <Line>curl -H &quot;X-Payment: &lt;base64url-json&gt;&quot; &quot;{BASE_URL}/x402/3?protocol=uniswap&quot;</Line>
          <Line prompt={false} color="gray">{"{"}</Line>
          <Line prompt={false} color="gray">{"  "}<span style={{ color: "#e3b341" }}>&quot;listingId&quot;</span>: <span style={{ color: "var(--green)" }}>&quot;3&quot;</span>,</Line>
          <Line prompt={false} color="gray">{"  "}<span style={{ color: "#e3b341" }}>&quot;jobRef&quot;</span>: <span style={{ color: "var(--green)" }}>&quot;0xjobref…&quot;</span>,</Line>
          <Line prompt={false} color="gray">{"  "}<span style={{ color: "#e3b341" }}>&quot;settleTxHash&quot;</span>: <span style={{ color: "var(--green)" }}>&quot;0xsettle…&quot;</span>,</Line>
          <Line prompt={false} color="gray">{"  "}<span style={{ color: "#e3b341" }}>&quot;delivery&quot;</span>: <span style={{ color: "var(--green)" }}>&quot;relayed_unmodified&quot;</span>,</Line>
          <Line prompt={false} color="gray">{"  "}<span style={{ color: "#e3b341" }}>&quot;untrusted_data&quot;</span>: {"{ "}<span style={{ color: "#e3b341" }}>&quot;tvl_usd&quot;</span>: <span style={{ color: "var(--green)" }}>&quot;1234567890&quot;</span> {"}"}</Line>
          <Line prompt={false} color="gray">{"}"}</Line>
        </TerminalWindow>
        <p className="mb-2" style={{ color: "var(--text2)" }}>
          For human users, the easiest path is the listing detail page itself at{" "}
          <a href="/discover" className="underline" style={{ color: "var(--cyan)" }}>
            /discover
          </a>{" "}
          plus the Basescan link for the returned settlement tx. Legacy v2
          evidence verification still exists for older jobs.
        </p>
      </section>

      {/* Full quickstart */}
      <section id="quickstart" className="mb-14">
        <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--text)" }}>7. Full quickstart code</h2>
        <p className="mb-4" style={{ color: "var(--text2)" }}>
          Current v3 quickstart is the x402 gateway path. Legacy v2 direct
          contract code is included below for older integrations only.
        </p>
        <CodeBlock code={quickstartCode} language="agent.ts" />
        <p className="mt-6 mb-4" style={{ color: "var(--text2)" }}>
          Legacy v2 quickstart:
        </p>
        <CodeBlock code={legacyQuickstartCode} language="legacy-agent.ts" />
      </section>

      {/* Contract reference */}
      <section id="contract" className="mb-14">
        <h2 className="text-2xl font-bold mb-4" style={{ color: "var(--text)" }}>8. Contract reference</h2>
        <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--border)" }}>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ background: "var(--bg3)" }}>
                <th className="px-4 py-3 text-left font-semibold" style={{ color: "var(--text2)", borderBottom: "1px solid var(--border)" }}>Function</th>
                <th className="px-4 py-3 text-left font-semibold" style={{ color: "var(--text2)", borderBottom: "1px solid var(--border)" }}>Caller</th>
                <th className="px-4 py-3 text-left font-semibold" style={{ color: "var(--text2)", borderBottom: "1px solid var(--border)" }}>Description</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["settle(listingId, buyer, amount, auth, signature, jobRef)", "Gateway", "Current v3 settlement path on ChainLensMarket"],
                ["claim()", "Seller", "Withdraw accumulated seller earnings"],
                ["registerListing(metadataURI, payout)", "Seller", "Create a new market listing"],
                ["deactivateListing(listingId)", "Seller", "Hide a listing from public purchase"],
                ["createJob(...)", "Buyer / Agent", "Legacy v2 escrow path"],
                ["createJobWithAuth(...)", "Buyer / Agent", "Legacy v2 one-sig path"],
              ].map(([fn, caller, desc], i, arr) => (
                <tr key={fn} style={{ borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--purple)", background: "var(--bg2)" }}>{fn}</td>
                  <td className="px-4 py-3" style={{ color: "var(--text2)" }}>{caller}</td>
                  <td className="px-4 py-3" style={{ color: "var(--text2)" }}>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div
          className="mt-4 p-4 rounded-lg text-sm font-mono"
          style={{ background: "var(--bg2)", border: "1px solid var(--border)" }}
        >
          <span style={{ color: "var(--text3)" }}>ChainLensMarket:</span>{" "}
          <a
            href={`https://sepolia.basescan.org/address/${MARKET}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline break-all"
            style={{ color: "var(--cyan)" }}
          >
            {MARKET}
          </a>
          <span className="ml-3" style={{ color: "var(--text3)" }}>Base Sepolia</span>
          <br />
          <span style={{ color: "var(--text3)" }}>USDC:</span>{" "}
          <a
            href={`https://sepolia.basescan.org/address/${USDC}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline break-all"
            style={{ color: "var(--cyan)" }}
          >
            {USDC}
          </a>
        </div>
      </section>

      {/* Alternatives */}
      <section id="alt" className="mb-14">
        <h2 className="text-2xl font-bold mb-4" style={{ color: "var(--text)" }}>9. Alternatives</h2>
        <p className="mb-4" style={{ color: "var(--text2)" }}>
          Two higher-level paths that wrap the steps above:
        </p>
        <ul className="list-disc list-inside space-y-3" style={{ color: "var(--text2)" }}>
          <li>
            <strong style={{ color: "var(--text)" }}>MCP (recommended for Claude Desktop / Cursor / Claude Code agents):</strong>{" "}
            register <InlineCode>@chain-lens/mcp-tool</InlineCode> in your MCP
            client config. The tool exposes{" "}
            <InlineCode>chain-lens.discover</InlineCode> /{" "}
            <InlineCode>chain-lens.inspect</InlineCode> /{" "}
            <InlineCode>chain-lens.status</InlineCode> by default, plus paid{" "}
            <InlineCode>chain-lens.call</InlineCode> when a signer is configured.
            Full walkthrough:{" "}
            <a
              href="https://github.com/Chain-Lens/ChainLens/blob/main/docs/BUYER_GUIDE.md"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
              style={{ color: "var(--cyan)" }}
            >
              BUYER_GUIDE.md
            </a>.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>x402 HTTP facade:</strong>{" "}
            current listing-specific paid path using USDC{" "}
            <InlineCode>ReceiveWithAuthorization</InlineCode>. Point any
            ChainLens-aware client at{" "}
            <InlineCode>{BASE_URL}/x402/{"<listingId>"}</InlineCode>. Standard
            x402 clients can inspect the route, but still need ChainLens-aware
            signing to produce the <InlineCode>X-Payment</InlineCode> payload
            and retry request — that logic lives in{" "}
            <InlineCode>@chain-lens/mcp-tool</InlineCode>.
          </li>
        </ul>
      </section>
    </div>
  );
}
