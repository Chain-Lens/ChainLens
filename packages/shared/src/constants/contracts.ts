export const CONTRACT_ADDRESSES: Record<number, `0x${string}`> = {
  84532: "0xE35053B2441B8DF180D83B7d620a9fE40fbe3Ae2", // Base Sepolia (legacy MonApiEscrow)
  8453: "0x0000000000000000000000000000000000000000", // Base Mainnet - fill after deploy
  31337: "0x0000000000000000000000000000000000000000", // Hardhat Local - fill after deploy
};

/**
 * ApiMarketEscrow v2 (Type 2 MVP).
 * Job concept with taskType / inputsHash / responseHash / evidenceURI plus ERC-8183 aliases.
 * Backward-compatible with v1 callers via taskType == bytes32(0).
 */
export const CONTRACT_ADDRESSES_V2: Record<number, `0x${string}`> = {
  84532: "0xD4c40710576f582c49e5E6417F6cA2023E30d3aD", // Base Sepolia
  8453: "0x0000000000000000000000000000000000000000",
  31337: "0x0000000000000000000000000000000000000000",
};

/** ERC-8004-compatible seller directory. Gateway registers sellers and records results. */
export const SELLER_REGISTRY_ADDRESSES: Record<number, `0x${string}`> = {
  84532: "0xcF36b76b5Da55471D4EBB5349A0653624371BE2c", // Base Sepolia
  8453: "0x0000000000000000000000000000000000000000",
  31337: "0x0000000000000000000000000000000000000000",
};

/** TaskTypeRegistry — initial 5 task types (spec §8) are registered at deploy time. */
export const TASK_TYPE_REGISTRY_ADDRESSES: Record<number, `0x${string}`> = {
  84532: "0xD2ab227417B26f4d8311594C27c59adcA046501F", // Base Sepolia
  8453: "0x0000000000000000000000000000000000000000",
  31337: "0x0000000000000000000000000000000000000000",
};

export const USDC_ADDRESSES: Record<number, `0x${string}`> = {
  84532: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia USDC
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base Mainnet USDC
  31337: "0x0000000000000000000000000000000000000000",
};
