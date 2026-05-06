export default function DocsHero() {
  return (
    <div className="mb-12">
      <span
        className="text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full"
        style={{ background: "var(--accent-dim)", color: "var(--accent)" }}
      >
        Agent Guide
      </span>
      <h1 className="mt-4 text-4xl font-bold" style={{ color: "var(--text)" }}>
        How to use ChainLens
      </h1>
      <p className="mt-3 text-lg" style={{ color: "var(--text2)" }}>
        ChainLens turns external API calls into verified execution for coding agents. Use the SDK
        in your app, the CLI for one-shot calls and reports, or the MCP tool when an agent should
        discover, inspect, call, or onboard providers. Settlement happens on-chain only after the
        seller response passes gateway checks — failed calls move no USDC.
      </p>
    </div>
  );
}
