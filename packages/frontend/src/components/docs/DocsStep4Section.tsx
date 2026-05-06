import { TerminalWindow, Line } from "./DocsTerminal";
import { DOCS_BASE_URL } from "@/lib/docs-constants";

export default function DocsStep4Section() {
  return (
    <section id="step4" className="mb-14">
      <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--text)" }}>
        6. Step 4 — Verify settlement and response
      </h2>
      <p className="mb-4" style={{ color: "var(--text2)" }}>
        A successful SDK or CLI call returns the seller response and settlement data immediately.
        Failed calls return typed failure metadata and do not submit settlement.
      </p>
      <TerminalWindow title="terminal — settlement result">
        <Line>chainlens call 13 &apos;{"{"}&quot;symbol&quot;:&quot;MSFT&quot;{"}"}&apos;</Line>
        <Line prompt={false} color="gray">
          {"{"}
        </Line>
        <Line prompt={false} color="gray">
          {"  "}
          <span style={{ color: "#e3b341" }}>&quot;Amount&quot;</span>:{" "}
          <span style={{ color: "var(--green)" }}>&quot;$1.000000 USDC&quot;</span>,
        </Line>
        <Line prompt={false} color="gray">
          {"  "}
          <span style={{ color: "#e3b341" }}>&quot;Fee&quot;</span>:{" "}
          <span style={{ color: "var(--green)" }}>&quot;$0.010000 USDC&quot;</span>,
        </Line>
        <Line prompt={false} color="gray">
          {"  "}
          <span style={{ color: "#e3b341" }}>&quot;TxHash&quot;</span>:{" "}
          <span style={{ color: "var(--green)" }}>&quot;0xsettle…&quot;</span>,
        </Line>
        <Line prompt={false} color="gray">
          {"  "}
          <span style={{ color: "#e3b341" }}>&quot;Response&quot;</span>: {"{ "}
          <span style={{ color: "#e3b341" }}>&quot;symbol&quot;</span>:{" "}
          <span style={{ color: "var(--green)" }}>&quot;MSFT&quot;</span> {"}"}
        </Line>
        <Line prompt={false} color="gray">
          {"  "}
          <span style={{ color: "var(--text3)" }}>{"// schema_mismatch / timeout → no settlement"}</span>
        </Line>
        <Line prompt={false} color="gray">
          {"}"}
        </Line>
      </TerminalWindow>
      <p className="mb-2" style={{ color: "var(--text2)" }}>
        For human users, the easiest path is still the listing detail page at{" "}
        <a href="/discover" className="underline" style={{ color: "var(--cyan)" }}>
          /discover
        </a>{" "}
        plus the Basescan link for the returned settlement tx hash.
      </p>
    </section>
  );
}
