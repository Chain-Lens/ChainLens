/**
 * Canonical probe payloads used by seller-tester during onboarding. Values
 * are chosen to hit well-known public data so sellers that merely proxy the
 * upstream API produce recognizable responses.
 */
export const TEST_PAYLOADS: Record<string, object> = {
  blockscout_contract_source: {
    contract_address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", // UNI
    chain_id: 1,
  },
  blockscout_tx_info: {
    tx_hash:
      "0x88df016429689c079f3b2f6ad39fa052532c56795b733da78a91ebe6a713944b",
    chain_id: 1,
  },
  defillama_tvl: {
    protocol: "uniswap",
  },
  sourcify_verify: {
    contract_address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
    chain_id: 1,
  },
  chainlink_price_feed: {
    feed: "ETH/USD",
    chain_id: 1,
  },
};

export function getTestPayload(capability: string): object {
  return TEST_PAYLOADS[capability] ?? {};
}
