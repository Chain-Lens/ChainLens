import { CHAIN_LENS_MARKET_ADDRESSES, USDC_ADDRESSES } from "@chain-lens/shared";

export const DOCS_CHAIN_ID = 84532;
export const DOCS_MARKET = CHAIN_LENS_MARKET_ADDRESSES[DOCS_CHAIN_ID]!;
export const DOCS_USDC = USDC_ADDRESSES[DOCS_CHAIN_ID]!;
export const DOCS_BASE_URL = "https://chainlens.pelicanlab.dev/api";
export const DOCS_FEE_DISPLAY = "5%";

export const DOCS_QUICKSTART_CODE = `const BASE = "${DOCS_BASE_URL}";
const LISTING_ID = "3";      // from /api/market/listings
const INPUTS = { protocol: "uniswap" };
const X_PAYMENT = "<base64url-json>"; // signed ReceiveWithAuthorization payload

// Call the listing-specific x402 endpoint. The gateway runs the seller
// API, validates the response, and only settles on-chain on success —
// failed calls drop the signature, no USDC moves.
const res = await fetch(
  \`\${BASE}/x402/\${LISTING_ID}?\${new URLSearchParams(INPUTS as Record<string, string>)}\`,
  {
    method: "GET",
    headers: { "X-Payment": X_PAYMENT },
  },
);

if (!res.ok) {
  throw new Error(\`Gateway returned \${res.status} \${res.statusText}\`);
}

const out = await res.json();
console.log({
  listingId: out.listingId,
  jobRef: out.jobRef,
  settleTxHash: out.settleTxHash,
  delivery: out.delivery,
  safety: out.safety,
  untrustedData: out.untrusted_data,
});
`;
