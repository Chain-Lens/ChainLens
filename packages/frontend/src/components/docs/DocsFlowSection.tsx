import InlineCode from "./InlineCode";
import { TerminalWindow, Line } from "./DocsTerminal";
import { DOCS_BASE_URL } from "@/lib/docs-constants";

export default function DocsFlowSection() {
  return (
    <section id="flow" className="mb-14">
      <h2 className="text-2xl font-bold mb-4" style={{ color: "var(--text)" }}>
        2. Payment flow overview
      </h2>
      <p className="mb-4" style={{ color: "var(--text2)" }}>
        SDK and CLI calls use <InlineCode>{DOCS_BASE_URL}/v1/call</InlineCode>. The buyer signs a
        USDC <InlineCode>ReceiveWithAuthorization</InlineCode>, the gateway executes the seller API,
        validates the response, and settles on <InlineCode>ChainLensMarket</InlineCode> only after a
        successful verified response. The response reports amount, protocol fee, seller net, and
        settlement tx hash.
      </p>
      <TerminalWindow title="terminal — flow diagram">
        <Line prompt={false} color="blue">
          ┌─────────────────────────────────────────────────────────────┐
        </Line>
        <Line prompt={false} color="blue">
          │ ChainLens v3 payment flow │
        </Line>
        <Line prompt={false} color="blue">
          ├─────────────────────────────────────────────────────────────┤
        </Line>
        <Line prompt={false} color="yellow">
          │ 1. POST /api/v1/recommend {"{ task, maxResults }"} │
        </Line>
        <Line prompt={false} color="gray">
          │ → ChainLens verified + Coinbase Bazaar candidates │
        </Line>
        <Line prompt={false} color="blue">
          │ │
        </Line>
        <Line prompt={false} color="yellow">
          │ 2. GET /api/v1/listings/&lt;listingId&gt; │
        </Line>
        <Line prompt={false} color="gray">
          │ → full metadata, examples, recent errors │
        </Line>
        <Line prompt={false} color="blue">
          │ │
        </Line>
        <Line prompt={false} color="yellow">
          │ 3. POST /api/v1/call │
        </Line>
        <Line prompt={false} color="yellow">
          │ + signed ReceiveWithAuthorization │
        </Line>
        <Line prompt={false} color="blue">
          │ │
        </Line>
        <Line prompt={false} color="gray">
          │ Gateway calls seller → validates response → │
        </Line>
        <Line prompt={false} color="gray">
          │ settles on ChainLensMarket only on success │
        </Line>
        <Line prompt={false} color="blue">
          │ │
        </Line>
        <Line prompt={false} color="yellow">
          │ 4. Response includes response + settlement + amount/fee/net │
        </Line>
        <Line prompt={false} color="green">
          │ → {"{ ok, response, settlement, amount, fee, net }"} │
        </Line>
        <Line prompt={false} color="blue">
          └─────────────────────────────────────────────────────────────┘
        </Line>
      </TerminalWindow>
    </section>
  );
}
