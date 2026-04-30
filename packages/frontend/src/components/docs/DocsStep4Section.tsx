import { TerminalWindow, Line } from "./DocsTerminal";
import { DOCS_BASE_URL } from "@/lib/docs-constants";

export default function DocsStep4Section() {
  return (
    <section id="step4" className="mb-14">
      <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--text)" }}>
        6. Step 4 — Verify settlement and response
      </h2>
      <p className="mb-4" style={{ color: "var(--text2)" }}>
        A successful call returns the settlement tx hash immediately along with the seller response
        and safety metadata — there is no separate polling step.
      </p>
      <TerminalWindow title="terminal — settlement result">
        <Line>
          curl -H &quot;X-Payment: &lt;base64url-json&gt;&quot; &quot;{DOCS_BASE_URL}
          /x402/3?protocol=uniswap&quot;
        </Line>
        <Line prompt={false} color="gray">
          {"{"}
        </Line>
        <Line prompt={false} color="gray">
          {"  "}
          <span style={{ color: "#e3b341" }}>&quot;listingId&quot;</span>:{" "}
          <span style={{ color: "var(--green)" }}>&quot;3&quot;</span>,
        </Line>
        <Line prompt={false} color="gray">
          {"  "}
          <span style={{ color: "#e3b341" }}>&quot;jobRef&quot;</span>:{" "}
          <span style={{ color: "var(--green)" }}>&quot;0xjobref…&quot;</span>,
        </Line>
        <Line prompt={false} color="gray">
          {"  "}
          <span style={{ color: "#e3b341" }}>&quot;settleTxHash&quot;</span>:{" "}
          <span style={{ color: "var(--green)" }}>&quot;0xsettle…&quot;</span>,
        </Line>
        <Line prompt={false} color="gray">
          {"  "}
          <span style={{ color: "#e3b341" }}>&quot;delivery&quot;</span>:{" "}
          <span style={{ color: "var(--green)" }}>&quot;relayed_unmodified&quot;</span>,
        </Line>
        <Line prompt={false} color="gray">
          {"  "}
          <span style={{ color: "#e3b341" }}>&quot;untrusted_data&quot;</span>: {"{ "}
          <span style={{ color: "#e3b341" }}>&quot;tvl_usd&quot;</span>:{" "}
          <span style={{ color: "var(--green)" }}>&quot;1234567890&quot;</span> {"}"}
        </Line>
        <Line prompt={false} color="gray">
          {"}"}
        </Line>
      </TerminalWindow>
      <p className="mb-2" style={{ color: "var(--text2)" }}>
        For human users, the easiest path is the listing detail page itself at{" "}
        <a href="/discover" className="underline" style={{ color: "var(--cyan)" }}>
          /discover
        </a>{" "}
        plus the Basescan link for the returned settlement tx hash.
      </p>
    </section>
  );
}
