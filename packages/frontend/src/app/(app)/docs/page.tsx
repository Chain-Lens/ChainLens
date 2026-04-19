"use client";

import { useState } from "react";

const CONTRACT = "0xE35053B2441B8DF180D83B7d620a9fE40fbe3Ae2";
const BASE_URL = "https://monapi.pelicanlab.dev/api";

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

const quickstartCode = `import { createWalletClient, createPublicClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const CONTRACT = "${CONTRACT}";
const BASE_URL  = "${BASE_URL}";
const PAY_ABI   = parseAbi(["function pay(uint256 apiId, address seller) payable"]);

async function callAPI(apiId: string, privateKey: \`0x\${string}\`, payload?: object) {
  const account = privateKeyToAccount(privateKey);
  const wallet  = createWalletClient({ account, chain: baseSepolia, transport: http() });
  const client  = createPublicClient({ chain: baseSepolia, transport: http() });

  // Step 1 — Get payment instructions (returns 402 if no payment header)
  const info = await fetch(\`\${BASE_URL}/execute/\${apiId}\`).then(r => r.json());
  const { amount, onChainApiId, seller } = info.x402;

  // Step 2 — Pay on-chain into escrow
  const txHash = await wallet.writeContract({
    address: CONTRACT, abi: PAY_ABI, functionName: "pay",
    args: [BigInt(onChainApiId), seller], value: BigInt(amount),
  });
  await client.waitForTransactionReceipt({ hash: txHash });

  // Step 3 — Call the API with payment proof
  return fetch(\`\${BASE_URL}/execute/\${apiId}\`, {
    method: payload ? "POST" : "GET",
    headers: { "X-Payment-Tx": txHash, "Content-Type": "application/json" },
    body: payload ? JSON.stringify(payload) : undefined,
  }).then(r => r.json());
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
          Any AI agent with a wallet can discover, pay for, and consume APIs in three steps — no OAuth, no API keys.
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
            ["#prereqs",   "Prerequisites"],
            ["#flow",      "Payment flow overview"],
            ["#step1",     "Step 1 — Discover & get payment info"],
            ["#step2",     "Step 2 — Pay on-chain"],
            ["#step3",     "Step 3 — Call the API"],
            ["#quickstart","Full quickstart code"],
            ["#contract",  "Contract reference"],
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
          You need a wallet funded with USDC on <strong style={{ color: "var(--text)" }}>Base Sepolia</strong> (testnet) to pay for API calls.
        </p>
        <ul className="list-disc list-inside space-y-1 mb-4" style={{ color: "var(--text2)" }}>
          <li>Node.js 18+</li>
          <li>
            Base Sepolia USDC —{" "}
            <a
              href="https://faucet.circle.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--cyan)" }}
              className="underline"
            >
              get from faucet
            </a>
          </li>
          <li><InlineCode>viem</InlineCode> library</li>
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
          ChainLens implements an <strong style={{ color: "var(--text)" }}>x402-style</strong> payment protocol. The gateway returns a{" "}
          <InlineCode>402 Payment Required</InlineCode> response until you prove on-chain payment.
        </p>
        <TerminalWindow title="terminal — flow diagram">
          <Line prompt={false} color="blue">┌─────────────────────────────────────────────────────────────┐</Line>
          <Line prompt={false} color="blue">│                     Payment Flow                            │</Line>
          <Line prompt={false} color="blue">├─────────────────────────────────────────────────────────────┤</Line>
          <Line prompt={false} color="yellow">│  1. GET /api/execute/:apiId                                 │</Line>
          <Line prompt={false} color="gray">│     → 402  &#123; x402: &#123; amount, onChainApiId, seller &#125; &#125;        │</Line>
          <Line prompt={false} color="blue">│                                                             │</Line>
          <Line prompt={false} color="yellow">│  2. contract.pay(onChainApiId, seller)  value=amount        │</Line>
          <Line prompt={false} color="gray">│     → txHash  (funds held in escrow)                        │</Line>
          <Line prompt={false} color="blue">│                                                             │</Line>
          <Line prompt={false} color="yellow">│  3. GET /api/execute/:apiId                                 │</Line>
          <Line prompt={false} color="gray">│     Header: X-Payment-Tx: txHash                            │</Line>
          <Line prompt={false} color="green">│     → 200  &#123; result: ... &#125;  (gateway settles on-chain)      │</Line>
          <Line prompt={false} color="blue">└─────────────────────────────────────────────────────────────┘</Line>
        </TerminalWindow>
      </section>

      {/* Step 1 */}
      <section id="step1" className="mb-14">
        <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--text)" }}>3. Step 1 — Discover &amp; get payment info</h2>
        <p className="mb-4" style={{ color: "var(--text2)" }}>
          Send a plain <InlineCode>GET</InlineCode> to the execute endpoint. The gateway returns{" "}
          <InlineCode>402</InlineCode> with everything you need to pay.
        </p>
        <TerminalWindow title="terminal — step 1">
          <Line color="gray" prompt={false}># Replace {"{"}apiId{"}"} with the ID from the Marketplace</Line>
          <Line>curl https://monapi.pelicanlab.dev/api/execute/{"<apiId>"}</Line>
          <Line prompt={false} color="gray">{"{"}</Line>
          <Line prompt={false} color="gray">{"  "}<span style={{ color: "#e3b341" }}>"status"</span><span style={{ color: "var(--text3)" }}>: </span><span style={{ color: "var(--green)" }}>402</span>,</Line>
          <Line prompt={false} color="gray">{"  "}<span style={{ color: "#e3b341" }}>"x402"</span><span style={{ color: "var(--text3)" }}>: {"{"}</span></Line>
          <Line prompt={false} color="gray">{"    "}<span style={{ color: "#e3b341" }}>"amount"</span><span style={{ color: "var(--text3)" }}>: </span><span style={{ color: "var(--green)" }}>"1000000"</span>,<span style={{ color: "var(--text3)" }} className="ml-2">// 1.00 USDC (6 decimals)</span></Line>
          <Line prompt={false} color="gray">{"    "}<span style={{ color: "#e3b341" }}>"onChainApiId"</span><span style={{ color: "var(--text3)" }}>: </span><span style={{ color: "var(--green)" }}>3</span>,</Line>
          <Line prompt={false} color="gray">{"    "}<span style={{ color: "#e3b341" }}>"seller"</span><span style={{ color: "var(--text3)" }}>: </span><span style={{ color: "var(--green)" }}>"0xSellerAddress..."</span>,</Line>
          <Line prompt={false} color="gray">{"    "}<span style={{ color: "#e3b341" }}>"contract"</span><span style={{ color: "var(--text3)" }}>: </span><span style={{ color: "var(--green)" }}>"{CONTRACT.slice(0, 12)}..."</span></Line>
          <Line prompt={false} color="gray">{"  }"}</Line>
          <Line prompt={false} color="gray">{"}"}</Line>
        </TerminalWindow>
        <div
          className="rounded-lg p-4 text-sm"
          style={{ background: "rgba(121,192,255,0.08)", border: "1px solid rgba(121,192,255,0.25)", color: "var(--cyan)" }}
        >
          <strong>Tip:</strong> You can browse all available APIs at{" "}
          <a href="/marketplace" className="underline font-medium" style={{ color: "var(--cyan)" }}>
            /marketplace
          </a>{" "}
          and find the API ID from the detail page.
        </div>
      </section>

      {/* Step 2 */}
      <section id="step2" className="mb-14">
        <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--text)" }}>4. Step 2 — Pay on-chain</h2>
        <p className="mb-4" style={{ color: "var(--text2)" }}>
          Call <InlineCode>pay()</InlineCode> on the escrow contract with the values from Step 1. Funds are held in escrow until the API responds.
        </p>
        <TerminalWindow title="agent.ts — pay on-chain">
          <Line prompt={false} color="purple">{"import"} <span style={{ color: "#e3b341" }}>{"{ createWalletClient, http, parseAbi }"}</span> <span style={{ color: "var(--purple)" }}>from</span> <span style={{ color: "var(--green)" }}>"viem"</span></Line>
          <Line prompt={false} color="purple">{"import"} <span style={{ color: "#e3b341" }}>{"{ privateKeyToAccount }"}</span> <span style={{ color: "var(--purple)" }}>from</span> <span style={{ color: "var(--green)" }}>"viem/accounts"</span></Line>
          <Line prompt={false} color="purple">{"import"} <span style={{ color: "#e3b341" }}>{"{ baseSepolia }"}</span> <span style={{ color: "var(--purple)" }}>from</span> <span style={{ color: "var(--green)" }}>"viem/chains"</span></Line>
          <Line prompt={false} color="gray">{""}</Line>
          <Line prompt={false} color="gray"><span style={{ color: "var(--cyan)" }}>const</span> <span style={{ color: "#e3b341" }}>CONTRACT</span> = <span style={{ color: "var(--green)" }}>"{CONTRACT}"</span>;</Line>
          <Line prompt={false} color="gray"><span style={{ color: "var(--cyan)" }}>const</span> <span style={{ color: "#e3b341" }}>PAY_ABI</span> = parseAbi([<span style={{ color: "var(--green)" }}>"function pay(uint256 apiId, address seller) payable"</span>]);</Line>
          <Line prompt={false} color="gray">{""}</Line>
          <Line prompt={false} color="gray"><span style={{ color: "var(--text3)" }}>// Use values from the 402 response</span></Line>
          <Line prompt={false} color="gray"><span style={{ color: "var(--cyan)" }}>const</span> txHash = <span style={{ color: "var(--purple)" }}>await</span> wallet.<span style={{ color: "#e3b341" }}>writeContract</span>{"({"}</Line>
          <Line prompt={false} color="gray">{"  "}address: CONTRACT,  abi: PAY_ABI,  functionName: <span style={{ color: "var(--green)" }}>"pay"</span>,</Line>
          <Line prompt={false} color="gray">{"  "}args: [<span style={{ color: "#e3b341" }}>BigInt</span>(onChainApiId), seller],</Line>
          <Line prompt={false} color="gray">{"  "}value: <span style={{ color: "#e3b341" }}>BigInt</span>(amount), <span style={{ color: "var(--text3)" }}>// wei from 402 response</span></Line>
          <Line prompt={false} color="gray">{"}"});</Line>
          <Line prompt={false} color="gray"><span style={{ color: "var(--purple)" }}>await</span> client.<span style={{ color: "#e3b341" }}>waitForTransactionReceipt</span>{"({ hash: txHash })"};</Line>
        </TerminalWindow>
        <div
          className="rounded-lg p-4 text-sm"
          style={{ background: "rgba(255,166,87,0.08)", border: "1px solid rgba(255,166,87,0.25)", color: "var(--orange)" }}
        >
          <strong>Note:</strong> The escrow is on-chain. If the API call fails, the gateway automatically refunds the full amount back to your wallet.
        </div>
      </section>

      {/* Step 3 */}
      <section id="step3" className="mb-14">
        <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--text)" }}>5. Step 3 — Call the API</h2>
        <p className="mb-4" style={{ color: "var(--text2)" }}>
          Repeat the request to the same endpoint, this time attaching your{" "}
          <InlineCode>txHash</InlineCode> in the{" "}
          <InlineCode>X-Payment-Tx</InlineCode> header. The gateway verifies the payment, proxies the API, and settles the escrow.
        </p>
        <TerminalWindow title="terminal — step 3 (GET API)">
          <Line color="gray" prompt={false}># GET request (no body)</Line>
          <Line>curl https://monapi.pelicanlab.dev/api/execute/{"<apiId>"} \</Line>
          <Line prompt={false} color="gray">{"  "}-H <span style={{ color: "var(--green)" }}>"X-Payment-Tx: {"<txHash>"}"</span></Line>
          <Line prompt={false} color="gray">{""}</Line>
          <Line prompt={false} color="green">{"# "}200 OK</Line>
          <Line prompt={false} color="gray">{"{"}</Line>
          <Line prompt={false} color="gray">{"  "}<span style={{ color: "#e3b341" }}>"result"</span>: <span style={{ color: "var(--green)" }}>"..."</span><span style={{ color: "var(--text3)" }} className="ml-2">// API response</span></Line>
          <Line prompt={false} color="gray">{"}"}</Line>
        </TerminalWindow>
        <TerminalWindow title="terminal — step 3 (POST with body)">
          <Line color="gray" prompt={false}># POST request with JSON body</Line>
          <Line>curl -X POST https://monapi.pelicanlab.dev/api/execute/{"<apiId>"} \</Line>
          <Line prompt={false} color="gray">{"  "}-H <span style={{ color: "var(--green)" }}>"X-Payment-Tx: {"<txHash>"}"</span> \</Line>
          <Line prompt={false} color="gray">{"  "}-H <span style={{ color: "var(--green)" }}>"Content-Type: application/json"</span> \</Line>
          <Line prompt={false} color="gray">{"  "}-d <span style={{ color: "var(--green)" }}>'{"{"}  "your": "payload"  {"}"}'</span></Line>
        </TerminalWindow>
      </section>

      {/* Full quickstart */}
      <section id="quickstart" className="mb-14">
        <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--text)" }}>6. Full quickstart code</h2>
        <p className="mb-4" style={{ color: "var(--text2)" }}>
          Drop this into your agent and call <InlineCode>callAPI(apiId, privateKey)</InlineCode>.
        </p>
        <CodeBlock code={quickstartCode} language="agent.ts" />
      </section>

      {/* Contract reference */}
      <section id="contract" className="mb-14">
        <h2 className="text-2xl font-bold mb-4" style={{ color: "var(--text)" }}>7. Contract reference</h2>
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
                ["pay(apiId, seller)",  "Buyer / Agent", "Deposit ETH into escrow for one API call"],
                ["complete(paymentId)", "Gateway",       "Release funds to seller after successful API call"],
                ["refund(paymentId)",   "Gateway",       "Return funds to buyer if API call fails"],
                ["claim()",             "Seller / Owner","Withdraw accumulated earnings"],
                ["approveApi(apiId)",   "Owner",         "Whitelist an API so it can receive payments"],
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
          <span style={{ color: "var(--text3)" }}>Contract:</span>{" "}
          <a
            href={`https://sepolia.basescan.org/address/${CONTRACT}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline break-all"
            style={{ color: "var(--cyan)" }}
          >
            {CONTRACT}
          </a>
          <span className="ml-3" style={{ color: "var(--text3)" }}>Base Sepolia</span>
        </div>
      </section>
    </div>
  );
}
