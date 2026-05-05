import type { RankedListing } from "./types.js";
import { ChainLensResolveError } from "./errors.js";

export async function fetchRecommendations(
  gatewayUrl: string,
  task: string,
  maxResults = 5,
): Promise<RankedListing[]> {
  const res = await fetch(`${gatewayUrl}/v1/recommend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task, maxResults }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ChainLensResolveError(`recommend failed: ${res.status} ${body}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await res.json()) as any;
  return (data.listings ?? []) as RankedListing[];
}
