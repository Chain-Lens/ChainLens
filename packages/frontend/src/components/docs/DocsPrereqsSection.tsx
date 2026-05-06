import InlineCode from "./InlineCode";
import { TerminalWindow, Line } from "./DocsTerminal";

export default function DocsPrereqsSection() {
  return (
    <section id="prereqs" className="mb-14">
      <h2 className="text-2xl font-bold mb-4" style={{ color: "var(--text)" }}>
        1. Prerequisites
      </h2>
      <p className="mb-4" style={{ color: "var(--text2)" }}>
        For live paid calls, use a wallet on{" "}
        <strong style={{ color: "var(--text)" }}>Base Sepolia</strong> with testnet ETH for gas and
        testnet USDC for payment. Recommendation and discovery calls do not require a funded wallet.
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
        <li>
          <InlineCode>@chain-lens/sdk</InlineCode>, <InlineCode>@chain-lens/cli</InlineCode>, or{" "}
          <InlineCode>@chain-lens/mcp-tool</InlineCode>
        </li>
      </ul>
      <TerminalWindow title="terminal — install dependencies">
        <Line>npm install @chain-lens/sdk viem</Line>
        <Line>npm install -g @chain-lens/cli</Line>
        <Line>npm install -g @chain-lens/mcp-tool</Line>
        <Line prompt={false} color="gray">
          # SDK for app code, CLI for terminal flows, MCP for agent clients
        </Line>
      </TerminalWindow>
    </section>
  );
}
