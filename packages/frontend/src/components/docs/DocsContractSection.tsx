import { DOCS_MARKET, DOCS_USDC } from "@/lib/docs-constants";

const ROWS: ReadonlyArray<readonly [string, string, string]> = [
  [
    "settle(listingId, buyer, amount, auth, signature, jobRef)",
    "Gateway",
    "Pulls signed USDC, credits seller (95%) and protocol fee (5%), emits Settled",
  ],
  ["claim()", "Seller", "Withdraw accumulated seller earnings"],
  [
    "registerListing(metadataURI, payout)",
    "Seller",
    "Create a new market listing (requires ChainLens approval to go public)",
  ],
  ["deactivateListing(listingId)", "Seller", "Hide a listing from public purchase"],
];

export default function DocsContractSection() {
  return (
    <section id="contract" className="mb-14">
      <h2 className="text-2xl font-bold mb-4" style={{ color: "var(--text)" }}>
        8. Contract reference
      </h2>
      <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--border)" }}>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr style={{ background: "var(--bg3)" }}>
              {["Function", "Caller", "Description"].map((h) => (
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
            {ROWS.map(([fn, caller, desc], i) => (
              <tr
                key={fn}
                style={{
                  borderBottom: i < ROWS.length - 1 ? "1px solid var(--border)" : "none",
                }}
              >
                <td
                  className="px-4 py-3 font-mono text-xs"
                  style={{ color: "var(--purple)", background: "var(--bg2)" }}
                >
                  {fn}
                </td>
                <td className="px-4 py-3" style={{ color: "var(--text2)" }}>
                  {caller}
                </td>
                <td className="px-4 py-3" style={{ color: "var(--text2)" }}>
                  {desc}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div
        className="mt-4 p-4 rounded-lg text-sm font-mono"
        style={{ background: "var(--bg2)", border: "1px solid var(--border)" }}
      >
        <span style={{ color: "var(--text3)" }}>ChainLensMarket:</span>{" "}
        <a
          href={`https://sepolia.basescan.org/address/${DOCS_MARKET}`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline break-all"
          style={{ color: "var(--cyan)" }}
        >
          {DOCS_MARKET}
        </a>
        <span className="ml-3" style={{ color: "var(--text3)" }}>
          Base Sepolia
        </span>
        <br />
        <span style={{ color: "var(--text3)" }}>USDC:</span>{" "}
        <a
          href={`https://sepolia.basescan.org/address/${DOCS_USDC}`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline break-all"
          style={{ color: "var(--cyan)" }}
        >
          {DOCS_USDC}
        </a>
      </div>
    </section>
  );
}
