"use client";

import { useState } from "react";

const CONTRACT = "0xE35053B2441B8DF180D83B7d620a9fE40fbe3Ae2";
const BASE_URL = "https://monapi.pelicanlab.dev/api";

function TerminalWindow({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl overflow-hidden shadow-2xl border border-gray-700 my-6">
      {/* macOS title bar */}
      <div className="bg-gray-800 px-4 py-3 flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
        <span className="w-3 h-3 rounded-full bg-yellow-400 inline-block" />
        <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
        <span className="ml-3 text-gray-400 text-xs font-mono">{title}</span>
      </div>
      {/* Terminal body */}
      <div className="bg-gray-950 text-gray-100 px-6 py-5 font-mono text-sm leading-relaxed overflow-x-auto">
        {children}
      </div>
    </div>
  );
}

function Line({
  prompt = true,
  children,
  comment,
  color = "white",
}: {
  prompt?: boolean;
  children: React.ReactNode;
  comment?: string;
  color?: "white" | "green" | "blue" | "yellow" | "purple" | "gray";
}) {
  const colorMap: Record<string, string> = {
    white: "text-gray-100",
    green: "text-green-400",
    blue: "text-blue-400",
    yellow: "text-yellow-300",
    purple: "text-purple-400",
    gray: "text-gray-500",
  };
  return (
    <div className="flex items-start gap-2 py-0.5">
      {prompt && <span className="text-green-400 select-none">$</span>}
      <span className={colorMap[color]}>
        {children}
        {comment && <span className="text-gray-500 ml-2">{comment}</span>}
      </span>
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
      className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function CodeBlock({ code, language = "typescript" }: { code: string; language?: string }) {
  return (
    <div className="relative rounded-xl overflow-hidden shadow-2xl border border-gray-700 my-6">
      <div className="bg-gray-800 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
          <span className="w-3 h-3 rounded-full bg-yellow-400 inline-block" />
          <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
          <span className="ml-3 text-gray-400 text-xs font-mono">{language}</span>
        </div>
        <CopyButton text={code} />
      </div>
      <pre className="bg-gray-950 text-gray-100 px-6 py-5 font-mono text-sm leading-relaxed overflow-x-auto">
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

const installCode = `npm install viem`;

export default function DocsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      {/* Hero */}
      <div className="mb-12">
        <span className="text-xs font-semibold uppercase tracking-widest text-primary-500 bg-primary-50 px-3 py-1 rounded-full">
          Agent Guide
        </span>
        <h1 className="mt-4 text-4xl font-bold text-gray-900">How to use API Market</h1>
        <p className="mt-3 text-lg text-gray-500">
          Any AI agent with a wallet can discover, pay for, and consume APIs in three steps — no OAuth, no API keys.
        </p>
      </div>

      {/* TOC */}
      <nav className="mb-12 p-5 bg-gray-50 rounded-xl border border-gray-200 text-sm">
        <p className="font-semibold text-gray-700 mb-3">On this page</p>
        <ol className="list-decimal list-inside space-y-1 text-gray-500">
          <li><a href="#prereqs" className="hover:text-primary-500 transition-colors">Prerequisites</a></li>
          <li><a href="#flow" className="hover:text-primary-500 transition-colors">Payment flow overview</a></li>
          <li><a href="#step1" className="hover:text-primary-500 transition-colors">Step 1 — Discover & get payment info</a></li>
          <li><a href="#step2" className="hover:text-primary-500 transition-colors">Step 2 — Pay on-chain</a></li>
          <li><a href="#step3" className="hover:text-primary-500 transition-colors">Step 3 — Call the API</a></li>
          <li><a href="#quickstart" className="hover:text-primary-500 transition-colors">Full quickstart code</a></li>
          <li><a href="#contract" className="hover:text-primary-500 transition-colors">Contract reference</a></li>
        </ol>
      </nav>

      {/* Prerequisites */}
      <section id="prereqs" className="mb-14">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Prerequisites</h2>
        <p className="text-gray-600 mb-4">
          You need a wallet funded with a small amount of ETH on <strong>Base Sepolia</strong> (testnet) to pay for API calls.
        </p>
        <ul className="list-disc list-inside text-gray-600 space-y-1 mb-4">
          <li>Node.js 18+</li>
          <li>
            Base Sepolia test ETH —{" "}
            <a
              href="https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-500 underline"
            >
              get from faucet
            </a>
          </li>
          <li>
            <code className="bg-gray-100 px-1 rounded text-sm">viem</code> library
          </li>
        </ul>
        <TerminalWindow title="terminal — install dependencies">
          <Line>npm install viem</Line>
          <Line prompt={false} color="gray">+ viem@2.x.x</Line>
        </TerminalWindow>
      </section>

      {/* Flow overview */}
      <section id="flow" className="mb-14">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Payment flow overview</h2>
        <p className="text-gray-600 mb-4">
          API Market implements an <strong>x402-style</strong> payment protocol. The gateway returns a{" "}
          <code className="bg-gray-100 px-1 rounded text-sm">402 Payment Required</code> response until you prove on-chain payment.
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
        <h2 className="text-2xl font-bold text-gray-900 mb-2">3. Step 1 — Discover & get payment info</h2>
        <p className="text-gray-600 mb-4">
          Send a plain <code className="bg-gray-100 px-1 rounded text-sm">GET</code> to the execute endpoint. The gateway returns{" "}
          <code className="bg-gray-100 px-1 rounded text-sm">402</code> with everything you need to pay.
        </p>
        <TerminalWindow title="terminal — step 1">
          <Line color="gray" prompt={false}># Replace {"{"}apiId{"}"} with the ID from the Marketplace</Line>
          <Line>curl https://monapi.pelicanlab.dev/api/execute/{"<apiId>"}</Line>
          <Line prompt={false} color="gray">{"{"}</Line>
          <Line prompt={false} color="gray">{"  "}
            <span className="text-yellow-300">"status"</span>
            <span className="text-gray-400">: </span>
            <span className="text-green-400">402</span>,
          </Line>
          <Line prompt={false} color="gray">{"  "}
            <span className="text-yellow-300">"x402"</span>
            <span className="text-gray-400">: {"{"}</span>
          </Line>
          <Line prompt={false} color="gray">{"    "}
            <span className="text-yellow-300">"amount"</span>
            <span className="text-gray-400">: </span>
            <span className="text-green-400">"1000000000000000"</span>,
            <span className="text-gray-500 ml-2">// 0.001 ETH in wei</span>
          </Line>
          <Line prompt={false} color="gray">{"    "}
            <span className="text-yellow-300">"onChainApiId"</span>
            <span className="text-gray-400">: </span>
            <span className="text-green-400">3</span>,
          </Line>
          <Line prompt={false} color="gray">{"    "}
            <span className="text-yellow-300">"seller"</span>
            <span className="text-gray-400">: </span>
            <span className="text-green-400">"0xSellerAddress..."</span>,
          </Line>
          <Line prompt={false} color="gray">{"    "}
            <span className="text-yellow-300">"contract"</span>
            <span className="text-gray-400">: </span>
            <span className="text-green-400">"{CONTRACT.slice(0, 12)}..."</span>
          </Line>
          <Line prompt={false} color="gray">{"  }"}</Line>
          <Line prompt={false} color="gray">{"}"}</Line>
        </TerminalWindow>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
          <strong>Tip:</strong> You can browse all available APIs at{" "}
          <a href="/marketplace" className="underline font-medium">
            /marketplace
          </a>{" "}
          and find the API ID from the detail page.
        </div>
      </section>

      {/* Step 2 */}
      <section id="step2" className="mb-14">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">4. Step 2 — Pay on-chain</h2>
        <p className="text-gray-600 mb-4">
          Call <code className="bg-gray-100 px-1 rounded text-sm">pay()</code> on the escrow contract with the values from Step 1. Funds are held in escrow until the API responds.
        </p>
        <TerminalWindow title="agent.ts — pay on-chain">
          <Line prompt={false} color="purple">{"import"} <span className="text-yellow-300">{"{ createWalletClient, http, parseAbi }"}</span> <span className="text-purple-400">from</span> <span className="text-green-400">"viem"</span></Line>
          <Line prompt={false} color="purple">{"import"} <span className="text-yellow-300">{"{ privateKeyToAccount }"}</span> <span className="text-purple-400">from</span> <span className="text-green-400">"viem/accounts"</span></Line>
          <Line prompt={false} color="purple">{"import"} <span className="text-yellow-300">{"{ baseSepolia }"}</span> <span className="text-purple-400">from</span> <span className="text-green-400">"viem/chains"</span></Line>
          <Line prompt={false} color="gray">{""}</Line>
          <Line prompt={false} color="gray"><span className="text-blue-400">const</span> <span className="text-yellow-300">CONTRACT</span> = <span className="text-green-400">"{CONTRACT}"</span>;</Line>
          <Line prompt={false} color="gray"><span className="text-blue-400">const</span> <span className="text-yellow-300">PAY_ABI</span> = parseAbi([<span className="text-green-400">"function pay(uint256 apiId, address seller) payable"</span>]);</Line>
          <Line prompt={false} color="gray">{""}</Line>
          <Line prompt={false} color="gray"><span className="text-gray-500">// Use values from the 402 response</span></Line>
          <Line prompt={false} color="gray"><span className="text-blue-400">const</span> txHash = <span className="text-purple-400">await</span> wallet.<span className="text-yellow-300">writeContract</span>{"({"}</Line>
          <Line prompt={false} color="gray">{"  "}address: CONTRACT,  abi: PAY_ABI,  functionName: <span className="text-green-400">"pay"</span>,</Line>
          <Line prompt={false} color="gray">{"  "}args: [<span className="text-yellow-300">BigInt</span>(onChainApiId), seller],</Line>
          <Line prompt={false} color="gray">{"  "}value: <span className="text-yellow-300">BigInt</span>(amount), <span className="text-gray-500">// wei from 402 response</span></Line>
          <Line prompt={false} color="gray">{"}"});</Line>
          <Line prompt={false} color="gray"><span className="text-purple-400">await</span> client.<span className="text-yellow-300">waitForTransactionReceipt</span>{"({ hash: txHash })"};</Line>
        </TerminalWindow>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
          <strong>Note:</strong> The escrow is on-chain. If the API call fails, the gateway automatically refunds the full amount back to your wallet.
        </div>
      </section>

      {/* Step 3 */}
      <section id="step3" className="mb-14">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">5. Step 3 — Call the API</h2>
        <p className="text-gray-600 mb-4">
          Repeat the request to the same endpoint, this time attaching your{" "}
          <code className="bg-gray-100 px-1 rounded text-sm">txHash</code> in the{" "}
          <code className="bg-gray-100 px-1 rounded text-sm">X-Payment-Tx</code> header. The gateway verifies the payment, proxies the API, and settles the escrow.
        </p>
        <TerminalWindow title="terminal — step 3 (GET API)">
          <Line color="gray" prompt={false}># GET request (no body)</Line>
          <Line>curl https://monapi.pelicanlab.dev/api/execute/{"<apiId>"} \</Line>
          <Line prompt={false} color="gray">{"  "}-H <span className="text-green-400">"X-Payment-Tx: {"<txHash>"}"</span></Line>
          <Line prompt={false} color="gray">{""}</Line>
          <Line prompt={false} color="green">{"# "}200 OK</Line>
          <Line prompt={false} color="gray">{"{"}</Line>
          <Line prompt={false} color="gray">{"  "}<span className="text-yellow-300">"result"</span>: <span className="text-green-400">"..."</span><span className="text-gray-500"> // API response</span></Line>
          <Line prompt={false} color="gray">{"}"}</Line>
        </TerminalWindow>
        <TerminalWindow title="terminal — step 3 (POST with body)">
          <Line color="gray" prompt={false}># POST request with JSON body</Line>
          <Line>curl -X POST https://monapi.pelicanlab.dev/api/execute/{"<apiId>"} \</Line>
          <Line prompt={false} color="gray">{"  "}-H <span className="text-green-400">"X-Payment-Tx: {"<txHash>"}"</span> \</Line>
          <Line prompt={false} color="gray">{"  "}-H <span className="text-green-400">"Content-Type: application/json"</span> \</Line>
          <Line prompt={false} color="gray">{"  "}-d <span className="text-green-400">'{"{"}  "your": "payload"  {"}"}'</span></Line>
        </TerminalWindow>
      </section>

      {/* Full quickstart */}
      <section id="quickstart" className="mb-14">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">6. Full quickstart code</h2>
        <p className="text-gray-600 mb-4">
          Drop this into your agent and call <code className="bg-gray-100 px-1 rounded text-sm">callAPI(apiId, privateKey)</code>.
        </p>
        <CodeBlock code={quickstartCode} language="agent.ts" />
      </section>

      {/* Contract reference */}
      <section id="contract" className="mb-14">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Contract reference</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100 text-left">
                <th className="px-4 py-3 font-semibold text-gray-700 border border-gray-200">Function</th>
                <th className="px-4 py-3 font-semibold text-gray-700 border border-gray-200">Caller</th>
                <th className="px-4 py-3 font-semibold text-gray-700 border border-gray-200">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {[
                ["pay(apiId, seller)", "Buyer / Agent", "Deposit ETH into escrow for one API call"],
                ["complete(paymentId)", "Gateway", "Release funds to seller after successful API call"],
                ["refund(paymentId)", "Gateway", "Return funds to buyer if API call fails"],
                ["claim()", "Seller / Owner", "Withdraw accumulated earnings"],
                ["approveApi(apiId)", "Owner", "Whitelist an API so it can receive payments"],
              ].map(([fn, caller, desc]) => (
                <tr key={fn} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-purple-700 border border-gray-200 bg-gray-50">{fn}</td>
                  <td className="px-4 py-3 text-gray-600 border border-gray-200">{caller}</td>
                  <td className="px-4 py-3 text-gray-600 border border-gray-200">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200 text-sm font-mono">
          <span className="text-gray-500">Contract:</span>{" "}
          <a
            href={`https://sepolia.basescan.org/address/${CONTRACT}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-500 underline break-all"
          >
            {CONTRACT}
          </a>
          <span className="ml-3 text-gray-400">Base Sepolia</span>
        </div>
      </section>
    </div>
  );
}
