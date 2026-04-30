/** "0x1234...abcd" — first 6 + last 4 chars, ellipsis in between. */
export function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
