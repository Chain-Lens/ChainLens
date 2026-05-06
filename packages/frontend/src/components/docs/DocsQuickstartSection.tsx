import DocsCodeBlock from "./DocsCodeBlock";
import { DOCS_QUICKSTART_CODE } from "@/lib/docs-constants";

export default function DocsQuickstartSection() {
  return (
    <section id="quickstart" className="mb-14">
      <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--text)" }}>
        7. Full quickstart code
      </h2>
      <p className="mb-4" style={{ color: "var(--text2)" }}>
        Minimal TypeScript buyer flow using the SDK. It signs, pays, validates, records local
        telemetry, and returns the settlement receipt.
      </p>
      <DocsCodeBlock code={DOCS_QUICKSTART_CODE} language="agent.ts" />
    </section>
  );
}
