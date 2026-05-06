import InlineCode from "./InlineCode";
import { DOCS_BASE_URL } from "@/lib/docs-constants";

export default function DocsAltSection() {
  return (
    <section id="alt" className="mb-14">
      <h2 className="text-2xl font-bold mb-4" style={{ color: "var(--text)" }}>
        10. Low-level alternatives
      </h2>
      <p className="mb-4" style={{ color: "var(--text2)" }}>
        Most developers should start with the SDK or CLI. These lower-level paths are useful when
        building custom agents or protocol integrations:
      </p>
      <ul className="list-disc list-inside space-y-3" style={{ color: "var(--text2)" }}>
        <li>
          <strong style={{ color: "var(--text)" }}>
            MCP:
          </strong>{" "}
          register <InlineCode>@chain-lens/mcp-tool</InlineCode> in your MCP client config. The tool
          exposes <InlineCode>chain-lens.discover</InlineCode> /{" "}
          <InlineCode>chain-lens.inspect</InlineCode> / <InlineCode>chain-lens.status</InlineCode> by
          default, plus paid <InlineCode>chain-lens.call</InlineCode> when a signer is configured.
          Full walkthrough:{" "}
          <a
            href="https://github.com/Chain-Lens/ChainLens/blob/main/docs/BUYER_GUIDE.md"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
            style={{ color: "var(--cyan)" }}
          >
            BUYER_GUIDE.md
          </a>
          .
        </li>
        <li>
          <strong style={{ color: "var(--text)" }}>x402 HTTP facade:</strong> listing-specific paid
          path using USDC <InlineCode>ReceiveWithAuthorization</InlineCode>.
          Point any ChainLens-aware client at{" "}
          <InlineCode>
            {DOCS_BASE_URL}/x402/{"<listingId>"}
          </InlineCode>
          . Standard x402 clients can inspect the route, but still need ChainLens-aware signing to
          produce the <InlineCode>X-Payment</InlineCode> payload and retry request — that logic
          lives in <InlineCode>@chain-lens/mcp-tool</InlineCode>.
        </li>
      </ul>
    </section>
  );
}
