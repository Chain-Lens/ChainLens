import InlineCode from "./InlineCode";
import { TerminalWindow, Line } from "./DocsTerminal";

const SELLER_TOOLS = [
  "seller.prepare_provider_entry",
  "seller.import_directory_provider",
  "seller.preflight_endpoint",
  "seller.draft_output_schema",
  "seller.prepare_paid_listing",
  "seller.publish_listing_metadata_gist",
  "seller.open_directory_pr",
  "seller.register_paid_listing",
  "seller.onboard_provider",
];

export default function DocsMcpSection() {
  return (
    <section id="mcp" className="mb-14">
      <h2 className="text-2xl font-bold mb-4" style={{ color: "var(--text)" }}>
        8. MCP for buyer and seller agents
      </h2>
      <p className="mb-4" style={{ color: "var(--text2)" }}>
        Install the MCP server when you want Claude Desktop, Claude Code, Cursor, or another MCP
        client to discover listings, inspect schemas, call paid APIs, or onboard a seller without
        writing custom glue code.
      </p>
      <TerminalWindow title="terminal — MCP install">
        <Line>npm install -g @chain-lens/mcp-tool</Line>
        <Line prompt={false} color="gray">
          # binary: chain-lens-mcp
        </Line>
      </TerminalWindow>
      <div className="grid gap-4 md:grid-cols-2">
        <div
          className="rounded-lg p-4"
          style={{ background: "var(--bg2)", border: "1px solid var(--border)" }}
        >
          <h3 className="font-semibold mb-3" style={{ color: "var(--text)" }}>
            Buyer tools
          </h3>
          <ul className="space-y-2 text-sm" style={{ color: "var(--text2)" }}>
            {["chain-lens.discover", "chain-lens.inspect", "chain-lens.call", "chain-lens.status"].map(
              (tool) => (
                <li key={tool}>
                  <InlineCode>{tool}</InlineCode>
                </li>
              ),
            )}
          </ul>
        </div>
        <div
          className="rounded-lg p-4"
          style={{ background: "var(--bg2)", border: "1px solid var(--border)" }}
        >
          <h3 className="font-semibold mb-3" style={{ color: "var(--text)" }}>
            Seller onboarding tools
          </h3>
          <ul className="space-y-2 text-sm" style={{ color: "var(--text2)" }}>
            {SELLER_TOOLS.map((tool) => (
              <li key={tool}>
                <InlineCode>{tool}</InlineCode>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-4 text-sm" style={{ color: "var(--text2)" }}>
        GitHub-backed publishing tools require <InlineCode>GITHUB_TOKEN</InlineCode>. On-chain
        registration requires <InlineCode>CHAIN_LENS_WALLET_PRIVATE_KEY</InlineCode> or{" "}
        <InlineCode>CHAIN_LENS_SIGN_SOCKET</InlineCode>.
      </p>
    </section>
  );
}
