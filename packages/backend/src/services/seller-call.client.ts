/**
 * Outbound call to a seller's HTTP API. Behind an interface so the
 * listing-call service can be tested with a deterministic stub instead
 * of a real network round-trip.
 */

export interface SellerCallResult {
  ok: boolean;
  status: number;
  body: unknown;
}

export interface SellerCallClient {
  call(endpoint: string, method: "GET" | "POST", inputs: unknown): Promise<SellerCallResult>;
}

export class FetchSellerCallClient implements SellerCallClient {
  constructor(private readonly timeoutMs: number) {}

  async call(
    endpoint: string,
    method: "GET" | "POST",
    inputs: unknown,
  ): Promise<SellerCallResult> {
    const url = new URL(endpoint);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      if (method === "GET") {
        // Flat key=val query forwarding. Nested inputs require POST —
        // metadata-author choice.
        if (inputs && typeof inputs === "object") {
          for (const [k, v] of Object.entries(inputs as Record<string, unknown>)) {
            url.searchParams.set(k, String(v));
          }
        }
        const r = await fetch(url, {
          method: "GET",
          signal: controller.signal,
          redirect: "error",
        });
        return { ok: r.ok, status: r.status, body: await safeJson(r) };
      }
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inputs ?? {}),
        signal: controller.signal,
        redirect: "error",
      });
      return { ok: r.ok, status: r.status, body: await safeJson(r) };
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function safeJson(r: Response): Promise<unknown> {
  const text = await r.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
