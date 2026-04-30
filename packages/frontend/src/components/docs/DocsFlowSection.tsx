import InlineCode from "./InlineCode";
import { TerminalWindow, Line } from "./DocsTerminal";
import { DOCS_FEE_DISPLAY } from "@/lib/docs-constants";

export default function DocsFlowSection() {
  return (
    <section id="flow" className="mb-14">
      <h2 className="text-2xl font-bold mb-4" style={{ color: "var(--text)" }}>
        2. Payment flow overview
      </h2>
      <p className="mb-4" style={{ color: "var(--text2)" }}>
        Paid calls route through <InlineCode>ChainLensMarket</InlineCode> and the listing-specific{" "}
        <InlineCode>/api/x402/:listingId</InlineCode> gateway path. The buyer signs a USDC{" "}
        <InlineCode>ReceiveWithAuthorization</InlineCode>, the gateway executes the seller API, and
        settlement happens on-chain only after a successful response. Failed seller calls drop the
        signed authorization, so no USDC moves. ChainLens earns a flat{" "}
        <strong style={{ color: "var(--text)" }}>{DOCS_FEE_DISPLAY}</strong> USDC fee on each settled
        call — sellers receive the remainder.
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
          │ 1. GET /api/market/listings?q=&lt;search&gt; │
        </Line>
        <Line prompt={false} color="gray">
          │ → [{"{ listingId, metadata, stats, score, ... }"}] │
        </Line>
        <Line prompt={false} color="blue">
          │ │
        </Line>
        <Line prompt={false} color="yellow">
          │ 2. GET /api/market/listings/&lt;listingId&gt; │
        </Line>
        <Line prompt={false} color="gray">
          │ → full metadata, examples, recent errors │
        </Line>
        <Line prompt={false} color="blue">
          │ │
        </Line>
        <Line prompt={false} color="yellow">
          │ 3. GET /api/x402/&lt;listingId&gt;?inputs... │
        </Line>
        <Line prompt={false} color="yellow">
          │ + X-Payment: signed ReceiveWithAuthorization │
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
          │ 4. Response includes settleTxHash + seller payload │
        </Line>
        <Line prompt={false} color="green">
          │ → {"{ jobRef, settleTxHash, safety, untrusted_data }"} │
        </Line>
        <Line prompt={false} color="blue">
          └─────────────────────────────────────────────────────────────┘
        </Line>
      </TerminalWindow>
    </section>
  );
}
