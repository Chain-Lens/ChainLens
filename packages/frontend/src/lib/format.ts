// USDC has 6 decimals. Backend returns the raw base-unit bigint as a string;
// dividing as bigint avoids floating-point loss on large values.
const USDC_UNIT = BigInt(1_000_000);

export function formatUsdc(raw: string): string {
  try {
    const base = BigInt(raw);
    const whole = base / USDC_UNIT;
    const frac = base % USDC_UNIT;
    return `${whole.toString()}.${frac.toString().padStart(6, "0")}`;
  } catch {
    return raw;
  }
}

/**
 * Compact USDC label with trailing zeros trimmed and a "USDC" suffix.
 * Returns "Unavailable" when the input is missing or malformed.
 */
export function formatUsdcLabel(amount: string | undefined): string {
  if (!amount || !/^\d+$/.test(amount)) return "Unavailable";
  const base = BigInt(amount);
  const whole = base / USDC_UNIT;
  const frac = base % USDC_UNIT;
  const fracStr = frac.toString().padStart(6, "0").replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr} USDC` : `${whole} USDC`;
}
