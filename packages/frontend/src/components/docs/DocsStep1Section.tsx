import { TerminalWindow, Line } from "./DocsTerminal";
import { DOCS_BASE_URL } from "@/lib/docs-constants";

export default function DocsStep1Section() {
  return (
    <section id="step1" className="mb-14">
      <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--text)" }}>
        3. Step 1 — Discover a listing
      </h2>
      <p className="mb-4" style={{ color: "var(--text2)" }}>
        Search ChainLens verified listings and external x402 candidates through the recommendation
        endpoint. External Bazaar candidates are discoverable but are not ChainLens-verified until
        wrapped as ChainLens listings.
      </p>
      <TerminalWindow title="terminal — discover">
        <Line>chainlens recommend &quot;stock price MSFT&quot;</Line>
        <Line>curl -X POST &quot;{DOCS_BASE_URL}/v1/recommend&quot; \</Line>
        <Line prompt={false}>  -H &quot;Content-Type: application/json&quot; \</Line>
        <Line prompt={false}>  --data &apos;{"{"}&quot;task&quot;:&quot;stock price MSFT&quot;,&quot;maxResults&quot;:5{"}"}&apos;</Line>
        <Line prompt={false} color="gray">
          {"{"}
        </Line>
        <Line prompt={false} color="gray">
          {"  "}
          <span style={{ color: "#e3b341" }}>&quot;items&quot;</span>: [{"{"}
        </Line>
        <Line prompt={false} color="gray">
          {"    "}
          <span style={{ color: "#e3b341" }}>&quot;listingId&quot;</span>:{" "}
          <span style={{ color: "var(--green)" }}>13</span>,
        </Line>
        <Line prompt={false} color="gray">
          {"    "}
          <span style={{ color: "#e3b341" }}>&quot;source&quot;</span>:{" "}
          <span style={{ color: "var(--green)" }}>&quot;chainlens&quot;</span>,
        </Line>
        <Line prompt={false} color="gray">
          {"    "}
          <span style={{ color: "#e3b341" }}>&quot;verifiedByChainLens&quot;</span>:{" "}
          <span style={{ color: "var(--green)" }}>true</span>,
        </Line>
        <Line prompt={false} color="gray">
          {"    "}
          <span style={{ color: "#e3b341" }}>&quot;name&quot;</span>:{" "}
          <span style={{ color: "var(--green)" }}>&quot;MSFT STOCK ANALYSTIC&quot;</span>,
        </Line>
        <Line prompt={false} color="gray">
          {"    "}
          <span style={{ color: "#e3b341" }}>&quot;name&quot;</span>:{" "}
          <span style={{ color: "var(--green)" }}>&quot;external ...&quot;</span>,
          <span style={{ color: "var(--text3)" }}> // Coinbase Bazaar candidate</span>
        </Line>
        <Line prompt={false} color="gray">
          {"    "}
          <span style={{ color: "#e3b341" }}>&quot;stats&quot;</span>: {"{ "}
          <span style={{ color: "#e3b341" }}>&quot;successRate&quot;</span>:{" "}
          <span style={{ color: "var(--green)" }}>0.98</span> {"}"}
        </Line>
        <Line prompt={false} color="gray">
          {"  }], "}
          <span style={{ color: "#e3b341" }}>&quot;total&quot;</span>:{" "}
          <span style={{ color: "var(--green)" }}>1</span>
        </Line>
        <Line prompt={false} color="gray">
          {"}"}
        </Line>
      </TerminalWindow>
      <p className="mb-2" style={{ color: "var(--text2)" }}>
        Once you have a promising ChainLens listing id, inspect it before spending:
      </p>
      <TerminalWindow title="terminal — inspect">
        <Line>chainlens estimate 13</Line>
        <Line>curl &quot;{DOCS_BASE_URL}/v1/listings/13&quot;</Line>
        <Line prompt={false} color="gray">
          {"// → { listingId, name, priceAtomic, maxLatencyMs, taskCategory, outputSchema, active }"}
        </Line>
      </TerminalWindow>
      <div
        className="rounded-lg p-4 text-sm"
        style={{
          background: "rgba(121,192,255,0.08)",
          border: "1px solid rgba(121,192,255,0.25)",
          color: "var(--cyan)",
        }}
      >
        <strong>Tip:</strong> Human-browsable at{" "}
        <a href="/discover" className="underline font-medium" style={{ color: "var(--cyan)" }}>
          /discover
        </a>
        . Filter + click through to see schema hints, examples, and recent seller stats.
      </div>
    </section>
  );
}
