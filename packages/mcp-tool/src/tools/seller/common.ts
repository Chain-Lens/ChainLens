/** Shared helpers for seller Phase A tools. No network, no file I/O. */

export type FetchFn = typeof fetch;

/** Fetch JSON from a URL, throw on non-2xx. */
export async function fetchJson<T = unknown>(
  url: string,
  fetchFn: FetchFn,
  options?: RequestInit,
): Promise<T> {
  const res = await fetchFn(url, options);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} from ${url}${text ? `: ${text}` : ""}`);
  }
  return res.json() as Promise<T>;
}

/** Lower-kebab with only a-z, 0-9, hyphens. */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
}

/** Return true when the URL looks like an official docs/blog/about page (https required). */
export function isOfficialLookingUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const MARKETING_PATTERNS = [
  /\bbest\s+(in\s+class|in\s+breed|ever)\b/i,
  /\b(revolutionary|game[- ]changing|world[- ]class|industry[- ]leading)\b/i,
  /\b(lightning[- ]fast|blazing[- ]fast|ultra[- ]fast)\b/i,
  /\b(seamless(ly)?|effortless(ly)?)\b/i,
];

/** Return marketing-language matches found in text. */
export function findMarketingLanguage(text: string): string[] {
  return MARKETING_PATTERNS.filter((p) => p.test(text)).map((p) => p.source);
}

const STALE_DAYS = 180;

/** Return true when last_verified is older than STALE_DAYS days (or absent). */
export function isStaleVerified(lastVerified: string | undefined | null): boolean {
  if (!lastVerified) return true;
  const d = Date.parse(lastVerified);
  if (Number.isNaN(d)) return true;
  return Date.now() - d > STALE_DAYS * 86_400_000;
}

/** Convert a USDC display amount (e.g. 0.05) to atomic units (50000). */
export function usdcToAtomic(displayAmount: number): string {
  return String(Math.round(displayAmount * 1_000_000));
}

/** Basic Ethereum address validation (0x + 40 hex chars). */
export function isValidEvmAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

/** Safely parse JSON, returning null on failure. */
export function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Assert value is a plain object (not array, not null). */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
