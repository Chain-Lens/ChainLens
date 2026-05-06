import InlineCode from "./InlineCode";
import { TerminalWindow, Line } from "./DocsTerminal";
import { DOCS_BASE_URL, DOCS_CLI_VERSION } from "@/lib/docs-constants";

export default function DocsCliSection() {
  return (
    <section id="cli" className="mb-14">
      <h2 className="text-2xl font-bold mb-4" style={{ color: "var(--text)" }}>
        3. CLI reference
      </h2>
      <p className="mb-4" style={{ color: "var(--text2)" }}>
        Use the CLI for one-shot calls, demos, local spend reports, debugging, and provider claim
        flows. The default gateway is <InlineCode>{DOCS_BASE_URL}</InlineCode>.
      </p>
      <TerminalWindow title="terminal — install and configure">
        <Line>npm install -g @chain-lens/cli@^{DOCS_CLI_VERSION}</Line>
        <Line>chainlens init</Line>
        <Line>export WALLET_PRIVATE_KEY=0x...</Line>
        <Line>export RPC_URL=https://sepolia.base.org</Line>
        <Line>export CHAIN_ID=84532</Line>
      </TerminalWindow>
      <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--border)" }}>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr style={{ background: "var(--bg3)" }}>
              {["Command", "Purpose"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left font-semibold"
                  style={{ color: "var(--text2)", borderBottom: "1px solid var(--border)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ["chainlens version", "Print the installed CLI version."],
              ["chainlens estimate 13", "Resolve listing price, category, latency limit, and active state."],
              [
                "chainlens call 13 '{\"symbol\":\"MSFT\"}'",
                "Call a listing, pay with USDC only on verified success, and print amount/fee/net/tx hash.",
              ],
              [
                "chainlens recommend \"stock price MSFT\"",
                "Rank ChainLens verified listings together with external Coinbase Bazaar candidates.",
              ],
              ["chainlens report", "Read local telemetry and summarize spend, latency, and failures."],
              ["chainlens debug --listing 13", "Explain dominant local failure patterns and next debugging steps."],
              ["chainlens claim", "Claim accumulated provider or treasury USDC for the connected wallet."],
              ["chainlens listing 13", "Show provider dashboard metrics for a listing owned by the connected wallet."],
            ].map(([cmd, purpose], i, rows) => (
              <tr
                key={cmd}
                style={{ borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none" }}
              >
                <td
                  className="px-4 py-3 font-mono text-xs whitespace-nowrap"
                  style={{ color: "var(--purple)", background: "var(--bg2)" }}
                >
                  {cmd}
                </td>
                <td className="px-4 py-3" style={{ color: "var(--text2)" }}>
                  {purpose}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TerminalWindow title="terminal — typical buyer flow">
        <Line>chainlens recommend &quot;stock price MSFT&quot;</Line>
        <Line>chainlens estimate 13</Line>
        <Line>chainlens call 13 &apos;{"{"}&quot;symbol&quot;:&quot;MSFT&quot;{"}"}&apos;</Line>
        <Line>chainlens report</Line>
        <Line>chainlens debug --listing 13</Line>
      </TerminalWindow>
    </section>
  );
}
