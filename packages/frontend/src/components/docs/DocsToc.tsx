"use client";

const ENTRIES: ReadonlyArray<readonly [string, string]> = [
  ["#prereqs", "Prerequisites"],
  ["#sdk", "SDK quickstart"],
  ["#cli", "CLI reference"],
  ["#flow", "Payment flow overview"],
  ["#step1", "Discover a listing"],
  ["#step2", "Inspect before you spend"],
  ["#step3", "Low-level x402 path"],
  ["#step4", "Verify settlement and response"],
  ["#quickstart", "Full SDK quickstart code"],
  ["#mcp", "MCP buyer and seller tools"],
  ["#contract", "Contract reference"],
  ["#alt", "Low-level alternatives"],
];

export default function DocsToc() {
  return (
    <nav
      className="mb-12 p-5 rounded-xl text-sm"
      style={{ background: "var(--bg2)", border: "1px solid var(--border)" }}
    >
      <p className="font-semibold mb-3" style={{ color: "var(--text)" }}>
        On this page
      </p>
      <ol className="list-decimal list-inside space-y-1" style={{ color: "var(--text2)" }}>
        {ENTRIES.map(([href, label]) => (
          <li key={href}>
            <a
              href={href}
              className="transition-colors"
              style={{ color: "var(--text2)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--green)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text2)")}
            >
              {label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
