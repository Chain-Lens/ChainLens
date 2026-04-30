import { TerminalWindow, Line } from "./DocsTerminal";
import { DOCS_BASE_URL } from "@/lib/docs-constants";

export default function DocsStep1Section() {
  return (
    <section id="step1" className="mb-14">
      <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--text)" }}>
        3. Step 1 — Discover a listing
      </h2>
      <p className="mb-4" style={{ color: "var(--text2)" }}>
        Search active approved listings through the public market index. Query by free-text, tags,
        success rate, price ceiling, or sort mode.
      </p>
      <TerminalWindow title="terminal — discover">
        <Line>curl &quot;{DOCS_BASE_URL}/market/listings?q=defillama&amp;sort=score_strict&quot;</Line>
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
          <span style={{ color: "var(--green)" }}>&quot;3&quot;</span>,
        </Line>
        <Line prompt={false} color="gray">
          {"    "}
          <span style={{ color: "#e3b341" }}>&quot;owner&quot;</span>:{" "}
          <span style={{ color: "var(--green)" }}>&quot;0xSellerAddress…&quot;</span>,
        </Line>
        <Line prompt={false} color="gray">
          {"    "}
          <span style={{ color: "#e3b341" }}>&quot;priceUsdc&quot;</span>:{" "}
          <span style={{ color: "var(--green)" }}>&quot;0.050000 USDC&quot;</span>,
        </Line>
        <Line prompt={false} color="gray">
          {"    "}
          <span style={{ color: "#e3b341" }}>&quot;metadata&quot;</span>: {"{ "}
          <span style={{ color: "#e3b341" }}>&quot;name&quot;</span>:{" "}
          <span style={{ color: "var(--green)" }}>&quot;DeFiLlama TVL&quot;</span> {"}"},
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
        Once you have a promising listing id, inspect it before spending:
      </p>
      <TerminalWindow title="terminal — inspect">
        <Line>curl &quot;{DOCS_BASE_URL}/market/listings/3&quot;</Line>
        <Line prompt={false} color="gray">
          {"// → { metadata, stats, recentErrors, adminStatus, ... }"}
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
