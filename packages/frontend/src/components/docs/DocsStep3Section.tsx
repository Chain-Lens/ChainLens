import InlineCode from "./InlineCode";
import { TerminalWindow, Line } from "./DocsTerminal";
import { DOCS_BASE_URL } from "@/lib/docs-constants";

export default function DocsStep3Section() {
  return (
    <section id="step3" className="mb-14">
      <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--text)" }}>
        5. Low-level x402 path
      </h2>
      <p className="mb-4" style={{ color: "var(--text2)" }}>
        SDK and CLI are the recommended surfaces. The lower-level x402 route is still available for
        MCP and ChainLens-aware clients that construct an <InlineCode>X-Payment</InlineCode> header.
      </p>
      <p className="mb-4" style={{ color: "var(--text2)" }}>
        Inputs are forwarded as query params. The MCP tool handles the signing details for agent
        clients.
      </p>
      <TerminalWindow title="terminal — x402 paid call">
        <Line>
          curl -H &quot;X-Payment: &lt;base64url-json&gt;&quot; &quot;{DOCS_BASE_URL}
          /x402/3?protocol=uniswap&quot;
        </Line>
        <Line prompt={false} color="gray">
          {"// → { jobRef, settleTxHash, safety, untrusted_data, ... }"}
        </Line>
      </TerminalWindow>
      <div
        className="rounded-lg p-4 text-sm"
        style={{
          background: "rgba(255,166,87,0.08)",
          border: "1px solid rgba(255,166,87,0.25)",
          color: "var(--orange)",
        }}
      >
        <strong>Note:</strong> If the seller fails schema validation, times out, or trips the policy
        filter, the gateway drops the signed authorization and no USDC moves.
      </div>
    </section>
  );
}
