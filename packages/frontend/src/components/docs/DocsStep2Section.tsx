import { TerminalWindow, Line } from "./DocsTerminal";

export default function DocsStep2Section() {
  return (
    <section id="step2" className="mb-14">
      <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--text)" }}>
        4. Step 2 — Inspect before you spend
      </h2>
      <p className="mb-4" style={{ color: "var(--text2)" }}>
        The listing detail response tells you whether a paid call is worth it: endpoint/method,
        example request and response, 30-day success rate, latency, and recent policy rejects.
      </p>
      <TerminalWindow title="terminal — what to check">
        <Line prompt={false} color="gray">
          {"// metadata.endpoint / metadata.method"}
        </Line>
        <Line prompt={false} color="gray">
          {"// metadata.inputs_schema / example_request"}
        </Line>
        <Line prompt={false} color="gray">
          {"// stats.successRate / stats.avgLatencyMs"}
        </Line>
        <Line prompt={false} color="gray">
          {"// recentErrors.breakdown.response_rejected_schema"}
        </Line>
      </TerminalWindow>
    </section>
  );
}
