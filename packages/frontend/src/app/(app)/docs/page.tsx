"use client";

import { useState } from "react";
import { CONTRACT_ADDRESSES_V2, USDC_ADDRESSES } from "@chain-lens/shared";

const CHAIN_ID = 84532;
const ESCROW = CONTRACT_ADDRESSES_V2[CHAIN_ID]!;
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

const quickstartCode = `import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  keccak256,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const ESCROW = "${ESCROW}";
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
          page walks through the direct-contract path — approve, createJob,
          poll evidence. See alternatives at the end.
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
            ["#step2",      "Step 2 — Approve USDC"],
            ["#step3",      "Step 3 — createJob (lock USDC + start the job)"],
            ["#step4",      "Step 4 — Poll evidence + verify the hash"],
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
          ChainLens escrows USDC in{" "}
          <InlineCode>ApiMarketEscrowV2</InlineCode> while the gateway calls
          the seller and verifies the response. A successful call releases
          funds to the seller and commits{" "}
          <InlineCode>responseHash</InlineCode> on-chain; a failed validation
          refunds the buyer automatically.
        </p>
        <TerminalWindow title="terminal — flow diagram">
          <Line prompt={false} color="blue">┌─────────────────────────────────────────────────────────────┐</Line>
          <Line prompt={false} color="blue">│                 ChainLens v2 payment flow                   │</Line>
          <Line prompt={false} color="blue">├─────────────────────────────────────────────────────────────┤</Line>
          <Line prompt={false} color="yellow">│  1. GET /api/apis?task_type=&lt;t&gt;                             │</Line>
          <Line prompt={false} color="gray">│     → [{"{ id, onChainId, seller, price, ... }"}]                  │</Line>
          <Line prompt={false} color="blue">│                                                             │</Line>
          <Line prompt={false} color="yellow">│  2. usdc.approve(escrow, amount)                            │</Line>
          <Line prompt={false} color="blue">│                                                             │</Line>
          <Line prompt={false} color="yellow">│  3. escrow.createJob(seller, taskType, amount,              │</Line>
          <Line prompt={false} color="yellow">│                      inputsHash, apiId)                     │</Line>
          <Line prompt={false} color="gray">│     → emits JobCreated(jobId, …)                            │</Line>
          <Line prompt={false} color="blue">│                                                             │</Line>
          <Line prompt={false} color="gray">│     Gateway calls seller → validates response against       │</Line>
          <Line prompt={false} color="gray">│     task-type schema → submits responseHash on-chain OR     │</Line>
          <Line prompt={false} color="gray">│     refunds if the seller fails validation.                 │</Line>
          <Line prompt={false} color="blue">│                                                             │</Line>
          <Line prompt={false} color="yellow">│  4. GET /api/evidence/&lt;jobId&gt;                               │</Line>
          <Line prompt={false} color="green">│     → {"{ status, response, responseHash, evidenceURI }"}         │</Line>
          <Line prompt={false} color="blue">└─────────────────────────────────────────────────────────────┘</Line>
        </TerminalWindow>
      </section>

      {/* Step 1 — Discover */}
      <section id="step1" className="mb-14">
        <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--text)" }}>3. Step 1 — Discover a listing</h2>
        <p className="mb-4" style={{ color: "var(--text2)" }}>
          Fetch APPROVED listings from the public registry. Filter by{" "}
          <InlineCode>task_type</InlineCode> (one of{" "}
          <InlineCode>blockscout_contract_source</InlineCode>,{" "}
          <InlineCode>blockscout_tx_info</InlineCode>,{" "}
          <InlineCode>defillama_tvl</InlineCode>,{" "}
          <InlineCode>sourcify_verify</InlineCode>,{" "}
          <InlineCode>chainlink_price_feed</InlineCode>).
        </p>
        <TerminalWindow title="terminal — discover">
          <Line>curl &quot;{BASE_URL}/apis?task_type=defillama_tvl&quot;</Line>
          <Line prompt={false} color="gray">{"{"}</Line>
          <Line prompt={false} color="gray">{"  "}<span style={{ color: "#e3b341" }}>&quot;items&quot;</span>: [{"{"}</Line>
          <Line prompt={false} color="gray">{"    "}<span style={{ color: "#e3b341" }}>&quot;id&quot;</span>: <span style={{ color: "var(--green)" }}>&quot;abc-uuid&quot;</span>,</Line>
          <Line prompt={false} color="gray">{"    "}<span style={{ color: "#e3b341" }}>&quot;onChainId&quot;</span>: <span style={{ color: "var(--green)" }}>3</span>,</Line>
          <Line prompt={false} color="gray">{"    "}<span style={{ color: "#e3b341" }}>&quot;seller&quot;</span>: <span style={{ color: "var(--green)" }}>&quot;0xSellerAddress…&quot;</span>,</Line>
          <Line prompt={false} color="gray">{"    "}<span style={{ color: "#e3b341" }}>&quot;price&quot;</span>: <span style={{ color: "var(--green)" }}>&quot;50000&quot;</span>,<span style={{ color: "var(--text3)" }} className="ml-2">// 0.05 USDC (6 decimals)</span></Line>
          <Line prompt={false} color="gray">{"    "}<span style={{ color: "#e3b341" }}>&quot;category&quot;</span>: <span style={{ color: "var(--green)" }}>&quot;defillama_tvl&quot;</span></Line>
          <Line prompt={false} color="gray">{"  }], "}<span style={{ color: "#e3b341" }}>&quot;total&quot;</span>: <span style={{ color: "var(--green)" }}>1</span></Line>
          <Line prompt={false} color="gray">{"}"}</Line>
        </TerminalWindow>
        <p className="mb-2" style={{ color: "var(--text2)" }}>
          You&apos;ll also need the <InlineCode>taskType</InlineCode> as a
          bytes32 — fetch it from the task-type registry:
        </p>
        <TerminalWindow title="terminal — task type id">
          <Line>curl &quot;{BASE_URL}/task-types&quot;</Line>
          <Line prompt={false} color="gray">{"// → [{ name: 'defillama_tvl', id: '0x…32-byte hash', enabled: true }]"}</Line>
        </TerminalWindow>
        <div
          className="rounded-lg p-4 text-sm"
          style={{ background: "rgba(121,192,255,0.08)", border: "1px solid rgba(121,192,255,0.25)", color: "var(--cyan)" }}
        >
          <strong>Tip:</strong> Human-browsable at{" "}
          <a href="/marketplace" className="underline font-medium" style={{ color: "var(--cyan)" }}>
            /marketplace
          </a>
          . Filter + click through to see sample requests and seller stats.
        </div>
      </section>

      {/* Step 2 — Approve */}
      <section id="step2" className="mb-14">
        <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--text)" }}>4. Step 2 — Approve USDC</h2>
        <p className="mb-4" style={{ color: "var(--text2)" }}>
          ERC-20 allowance so <InlineCode>ApiMarketEscrowV2</InlineCode> can
          pull the payment when you call{" "}
          <InlineCode>createJob</InlineCode>. One-time per allowance cap —
          approve a larger amount if you plan multiple calls.
        </p>
        <TerminalWindow title="agent.ts — approve USDC">
          <Line prompt={false} color="purple">{"import"} <span style={{ color: "#e3b341" }}>{"{ createWalletClient, http, parseAbi }"}</span> <span style={{ color: "var(--purple)" }}>from</span> <span style={{ color: "var(--green)" }}>&quot;viem&quot;</span></Line>
          <Line prompt={false} color="purple">{"import"} <span style={{ color: "#e3b341" }}>{"{ privateKeyToAccount }"}</span> <span style={{ color: "var(--purple)" }}>from</span> <span style={{ color: "var(--green)" }}>&quot;viem/accounts&quot;</span></Line>
          <Line prompt={false} color="purple">{"import"} <span style={{ color: "#e3b341" }}>{"{ baseSepolia }"}</span> <span style={{ color: "var(--purple)" }}>from</span> <span style={{ color: "var(--green)" }}>&quot;viem/chains&quot;</span></Line>
          <Line prompt={false} color="gray">{""}</Line>
          <Line prompt={false} color="gray"><span style={{ color: "var(--cyan)" }}>const</span> <span style={{ color: "#e3b341" }}>ESCROW</span> = <span style={{ color: "var(--green)" }}>&quot;{ESCROW}&quot;</span>;</Line>
          <Line prompt={false} color="gray"><span style={{ color: "var(--cyan)" }}>const</span> <span style={{ color: "#e3b341" }}>USDC</span>   = <span style={{ color: "var(--green)" }}>&quot;{USDC}&quot;</span>;</Line>
          <Line prompt={false} color="gray">{""}</Line>
          <Line prompt={false} color="gray"><span style={{ color: "var(--purple)" }}>await</span> wallet.<span style={{ color: "#e3b341" }}>writeContract</span>({"{"}</Line>
          <Line prompt={false} color="gray">{"  "}address: USDC,</Line>
          <Line prompt={false} color="gray">{"  "}abi: parseAbi([<span style={{ color: "var(--green)" }}>&quot;function approve(address,uint256) returns (bool)&quot;</span>]),</Line>
          <Line prompt={false} color="gray">{"  "}functionName: <span style={{ color: "var(--green)" }}>&quot;approve&quot;</span>,</Line>
          <Line prompt={false} color="gray">{"  "}args: [ESCROW, amount], <span style={{ color: "var(--text3)" }}>// amount in USDC wei (6 decimals)</span></Line>
          <Line prompt={false} color="gray">{"}"});</Line>
        </TerminalWindow>
      </section>

      {/* Step 3 — createJob */}
      <section id="step3" className="mb-14">
        <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--text)" }}>5. Step 3 — createJob</h2>
        <p className="mb-4" style={{ color: "var(--text2)" }}>
          Locks USDC in escrow and emits{" "}
          <InlineCode>JobCreated(jobId, buyer, seller, apiId, taskType, amount, inputsHash, …)</InlineCode>.
          The gateway picks up the event and calls the seller.
        </p>
        <p className="mb-4" style={{ color: "var(--text2)" }}>
          <InlineCode>inputsHash</InlineCode> is{" "}
          <InlineCode>keccak256(canonicalJSON(inputs))</InlineCode> — the
          gateway recomputes it and rejects the job if it mismatches, so
          callers can&apos;t swap inputs after payment.
        </p>
        <TerminalWindow title="agent.ts — createJob">
          <Line prompt={false} color="gray"><span style={{ color: "var(--text3)" }}>// Canonical JSON: sorted keys at every level. Matches the gateway&apos;s stableStringify.</span></Line>
          <Line prompt={false} color="gray"><span style={{ color: "var(--cyan)" }}>const</span> hash = keccak256(toHex(canonicalJSON(inputs)));</Line>
          <Line prompt={false} color="gray">{""}</Line>
          <Line prompt={false} color="gray"><span style={{ color: "var(--cyan)" }}>const</span> txHash = <span style={{ color: "var(--purple)" }}>await</span> wallet.<span style={{ color: "#e3b341" }}>writeContract</span>({"{"}</Line>
          <Line prompt={false} color="gray">{"  "}address: ESCROW,</Line>
          <Line prompt={false} color="gray">{"  "}abi: parseAbi([<span style={{ color: "var(--green)" }}>&quot;function createJob(address,bytes32,uint256,bytes32,uint256) returns (uint256)&quot;</span>]),</Line>
          <Line prompt={false} color="gray">{"  "}functionName: <span style={{ color: "var(--green)" }}>&quot;createJob&quot;</span>,</Line>
          <Line prompt={false} color="gray">{"  "}args: [seller, taskType, amount, hash, apiId],</Line>
          <Line prompt={false} color="gray">{"}"});</Line>
          <Line prompt={false} color="gray"><span style={{ color: "var(--cyan)" }}>const</span> receipt = <span style={{ color: "var(--purple)" }}>await</span> pub.<span style={{ color: "#e3b341" }}>waitForTransactionReceipt</span>({"{ hash: txHash }"});</Line>
          <Line prompt={false} color="gray"><span style={{ color: "var(--cyan)" }}>const</span> jobId   = <span style={{ color: "#e3b341" }}>BigInt</span>(receipt.logs[0].topics[1]);</Line>
        </TerminalWindow>
        <div
          className="rounded-lg p-4 text-sm"
          style={{ background: "rgba(255,166,87,0.08)", border: "1px solid rgba(255,166,87,0.25)", color: "var(--orange)" }}
        >
          <strong>Note:</strong> If the seller fails schema validation or
          trips the prompt-injection filter, the gateway calls{" "}
          <InlineCode>refund(jobId)</InlineCode> and your USDC returns to your
          wallet — usually within 10 seconds.
        </div>
      </section>

      {/* Step 4 — Poll evidence */}
      <section id="step4" className="mb-14">
        <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--text)" }}>6. Step 4 — Poll evidence + verify the hash</h2>
        <p className="mb-4" style={{ color: "var(--text2)" }}>
          Evidence appears once the gateway submits <InlineCode>submitJob</InlineCode>
          (success) or <InlineCode>refund</InlineCode> (failure). Status
          stays <InlineCode>PAID</InlineCode> during execution and flips to{" "}
          <InlineCode>COMPLETED</InlineCode> or <InlineCode>REFUNDED</InlineCode>{" "}
          at finalization.
        </p>
        <TerminalWindow title="terminal — evidence">
          <Line>curl &quot;{BASE_URL}/evidence/{"<jobId>"}&quot;</Line>
          <Line prompt={false} color="gray">{"{"}</Line>
          <Line prompt={false} color="gray">{"  "}<span style={{ color: "#e3b341" }}>&quot;onchainJobId&quot;</span>: <span style={{ color: "var(--green)" }}>&quot;42&quot;</span>,</Line>
          <Line prompt={false} color="gray">{"  "}<span style={{ color: "#e3b341" }}>&quot;status&quot;</span>: <span style={{ color: "var(--green)" }}>&quot;COMPLETED&quot;</span>,</Line>
          <Line prompt={false} color="gray">{"  "}<span style={{ color: "#e3b341" }}>&quot;response&quot;</span>: {"{ "}<span style={{ color: "#e3b341" }}>&quot;tvl_usd&quot;</span>: <span style={{ color: "var(--green)" }}>&quot;1234567890&quot;</span> {"}"},</Line>
          <Line prompt={false} color="gray">{"  "}<span style={{ color: "#e3b341" }}>&quot;responseHash&quot;</span>: <span style={{ color: "var(--green)" }}>&quot;0xabc…&quot;</span>,</Line>
          <Line prompt={false} color="gray">{"  "}<span style={{ color: "#e3b341" }}>&quot;evidenceURI&quot;</span>: <span style={{ color: "var(--green)" }}>&quot;{BASE_URL}/evidence/42&quot;</span></Line>
          <Line prompt={false} color="gray">{"}"}</Line>
        </TerminalWindow>
        <p className="mb-2" style={{ color: "var(--text2)" }}>
          Recompute <InlineCode>keccak256(JSON.stringify(response))</InlineCode> and
          compare against <InlineCode>responseHash</InlineCode> to verify the
          answer wasn&apos;t altered post-commit. The{" "}
          <a href="/evidence" className="underline" style={{ color: "var(--cyan)" }}>
            /evidence
          </a>{" "}
          explorer does this client-side for you.
        </p>
      </section>

      {/* Full quickstart */}
      <section id="quickstart" className="mb-14">
        <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--text)" }}>7. Full quickstart code</h2>
        <p className="mb-4" style={{ color: "var(--text2)" }}>
          Drop into your agent and call{" "}
          <InlineCode>callAPI({"{"} apiId, seller, taskType, amount, inputs, privateKey {"}"})</InlineCode>.
        </p>
        <CodeBlock code={quickstartCode} language="agent.ts" />
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
                ["createJob(seller, taskType, amount, inputsHash, apiId)",                  "Buyer / Agent", "Pull USDC from allowance into escrow; emit JobCreated"],
                ["createJobWithAuth(seller, taskType, amount, inputsHash, apiId, auth, sig)", "Buyer / Agent", "EIP-3009 one-sig variant — no prior approve() needed"],
                ["submitJob(jobId, responseHash, evidenceURI)",                              "Gateway",       "Release USDC to seller, commit the response hash"],
                ["refund(jobId)",                                                            "Gateway",       "Return USDC to buyer on validation failure"],
                ["claim()",                                                                  "Seller",        "Withdraw accumulated earnings"],
                ["approveApi(apiId)",                                                        "Admin",         "Promote listing from PENDING to APPROVED on-chain"],
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
          <span style={{ color: "var(--text3)" }}>ApiMarketEscrowV2:</span>{" "}
          <a
            href={`https://sepolia.basescan.org/address/${ESCROW}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline break-all"
            style={{ color: "var(--cyan)" }}
          >
            {ESCROW}
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
            <InlineCode>chain-lens.request</InlineCode> /{" "}
            <InlineCode>chain-lens.status</InlineCode> and handles the approve
            + createJob + poll flow internally. Full walkthrough:{" "}
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
            one-POST flow using EIP-3009{" "}
            <InlineCode>transferWithAuthorization</InlineCode> — no prior
            approve, one signature. Point any x402-aware HTTP client at{" "}
            <InlineCode>{BASE_URL}/x402/{"<apiId>"}</InlineCode>; the 402
            response carries <InlineCode>payTo</InlineCode> and{" "}
            <InlineCode>extra.chainlens</InlineCode> describing the required{" "}
            <InlineCode>createJobWithAuth</InlineCode> call. Standard x402
            clients can parse the 402 but need ChainLens-aware signing to
            complete payment — that logic lives in{" "}
            <InlineCode>@chain-lens/mcp-tool</InlineCode>.
          </li>
        </ul>
      </section>
    </div>
  );
}