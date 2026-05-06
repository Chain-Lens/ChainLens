import type { TelemetryEntry } from "@chain-lens/sdk";

const FAILURE_DOCS: Record<string, { cause: string; steps: string[] }> = {
  schema_mismatch: {
    cause: "Provider response did not match the listing output_schema.",
    steps: [
      "Inspect the listing output_schema.",
      "Check whether the provider API recently changed its response shape.",
      "Try a recommended provider for the same task category.",
    ],
  },
  timeout: {
    cause: "Provider did not respond within the allowed time window.",
    steps: [
      "Check provider status or try again later.",
      "Use a listing with a higher maxLatencyMs tolerance.",
      "Try a recommended provider with a lower p50 latency.",
    ],
  },
  http_5xx: {
    cause: "Provider returned a 5xx server error.",
    steps: [
      "Check provider status or try again later.",
      "Try a recommended provider for the same task category.",
    ],
  },
  http_4xx: {
    cause: "Provider rejected the request (client error).",
    steps: [
      "Check that the request params match the listing inputs_schema.",
      "Verify the listing is still active.",
    ],
  },
  auth: {
    cause: "Authorization failed — the payment signature was rejected.",
    steps: [
      "Verify your wallet address and private key are correct.",
      "Check that your USDC balance is sufficient.",
    ],
  },
  rate_limit: {
    cause: "Provider is rate-limiting your requests.",
    steps: [
      "Slow down request frequency.",
      "Consider a different provider with more capacity.",
    ],
  },
  budget: {
    cause: "Off-chain budget limit was exceeded before the call was attempted.",
    steps: [
      "Check your current spend with `chainlens report`.",
      "Increase your budget config if intentional.",
    ],
  },
  gateway_error: {
    cause: "The ChainLens Gateway encountered an internal error.",
    steps: ["Retry the request.", "Check gateway status."],
  },
  unknown: {
    cause: "An unexpected error occurred.",
    steps: ["Check your network connection.", "Retry the request."],
  },
};

export interface DebugSummary {
  totalCalls: number;
  failedCalls: number;
  dominantFailure: string | null;
  listingFilter: number | undefined;
  text: string;
}

export function buildDebugSummary(
  entries: TelemetryEntry[],
  listingFilter?: number,
): string {
  const filtered =
    listingFilter != null ? entries.filter((e) => e.listingId === listingFilter) : entries;

  if (filtered.length === 0) {
    if (listingFilter != null) {
      return `ChainLens Debug Trace\n\nNo telemetry found for listing #${listingFilter}.`;
    }
    return "ChainLens Debug Trace\n\nNo telemetry recorded yet.";
  }

  const failures = filtered.filter((e) => !e.ok && e.failure);
  const kindCount = new Map<string, number>();
  for (const e of failures) {
    const kind = e.failure!.kind;
    kindCount.set(kind, (kindCount.get(kind) ?? 0) + 1);
  }

  const dominant = [...kindCount.entries()].sort((a, b) => b[1] - a[1])[0];
  const dominantKind = dominant?.[0] ?? null;
  const doc = dominantKind ? (FAILURE_DOCS[dominantKind] ?? FAILURE_DOCS["unknown"]!) : null;

  const lines: string[] = ["ChainLens Debug Trace", ""];

  if (listingFilter != null) {
    lines.push(`Listing filter: #${listingFilter}`);
    lines.push("");
  }

  lines.push(`Total calls:   ${filtered.length}`);
  lines.push(`Failures:      ${failures.length}`);
  lines.push(`Success rate:  ${(((filtered.length - failures.length) / filtered.length) * 100).toFixed(1)}%`);

  if (kindCount.size > 0) {
    lines.push("");
    lines.push("Failure breakdown:");
    for (const [kind, count] of [...kindCount.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`  ${kind}: ${count}`);
    }
  }

  if (dominantKind && doc) {
    lines.push("");
    lines.push(`Primary failure:`);
    lines.push(`  ${dominantKind} on ${listingFilter != null ? `listing #${listingFilter}` : "recent calls"}`);
    lines.push("");
    lines.push(`Likely cause:`);
    lines.push(`  ${doc.cause}`);
    lines.push("");
    lines.push(`Impact:`);
    lines.push(`  Settlement was not submitted for failed calls.`);
    lines.push(`  No USDC moved for those calls.`);
    lines.push("");
    lines.push(`Suggested next steps:`);
    for (let i = 0; i < doc.steps.length; i++) {
      lines.push(`  ${i + 1}. ${doc.steps[i]}`);
    }
  }

  return lines.join("\n");
}
