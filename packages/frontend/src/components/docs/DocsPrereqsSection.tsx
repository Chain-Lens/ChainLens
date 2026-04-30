import InlineCode from "./InlineCode";
import { TerminalWindow, Line } from "./DocsTerminal";

export default function DocsPrereqsSection() {
  return (
    <section id="prereqs" className="mb-14">
      <h2 className="text-2xl font-bold mb-4" style={{ color: "var(--text)" }}>
        1. Prerequisites
      </h2>
      <p className="mb-4" style={{ color: "var(--text2)" }}>
        A wallet on <strong style={{ color: "var(--text)" }}>Base Sepolia</strong> with testnet ETH
        (for gas) and testnet USDC (for payment).
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
          <InlineCode>viem</InlineCode>
        </li>
      </ul>
      <TerminalWindow title="terminal — install dependencies">
        <Line>npm install viem</Line>
        <Line prompt={false} color="gray">
          + viem@2.x.x
        </Line>
      </TerminalWindow>
    </section>
  );
}
