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
        Any AI agent with a wallet can pay for ChainLens-reviewed APIs in USDC. The flow is short:
        discover a listing, inspect it, then pay through the x402 gateway. Settlement happens
        on-chain only after the seller call succeeds — failed calls move no USDC.
      </p>
    </div>
  );
}
