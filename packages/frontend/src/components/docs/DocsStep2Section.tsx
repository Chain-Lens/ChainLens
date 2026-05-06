import { TerminalWindow, Line } from "./DocsTerminal";

export default function DocsStep2Section() {
  return (
    <section id="step2" className="mb-14">
      <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--text)" }}>
        4. Step 2 — Inspect before you spend
      </h2>
      <p className="mb-4" style={{ color: "var(--text2)" }}>
        The listing detail response tells the SDK what it needs before signing: price, max latency,
        task category, output schema, payout address, and active state. The SDK checks local budget
        before signing and records telemetry after success or failure.
      </p>
      <TerminalWindow title="terminal — what to check">
        <Line prompt={false} color="gray">
          {"// priceAtomic / maxLatencyMs"}
        </Line>
        <Line prompt={false} color="gray">
          {"// outputSchema"}
        </Line>
        <Line prompt={false} color="gray">
          {"// active / payout"}
        </Line>
        <Line prompt={false} color="gray">
          {"// local budget check before signing"}
        </Line>
      </TerminalWindow>
    </section>
  );
}
