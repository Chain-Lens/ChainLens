import { keccak256, parseUnits, stringToBytes } from "viem";

export interface InitialTaskType {
  id: `0x${string}`;
  name: string;
  schemaURI: string;
  maxResponseTime: bigint;
  minBudget: bigint;
}

function tt(
  name: string,
  maxResponseTime: bigint,
  minBudgetUsd: string,
): InitialTaskType {
  return {
    id: keccak256(stringToBytes(name)),
    name,
    schemaURI: "",
    maxResponseTime,
    minBudget: parseUnits(minBudgetUsd, 6),
  };
}

export const INITIAL_TASK_TYPES: InitialTaskType[] = [
  tt("blockscout_contract_source", 15n, "0.01"),
  tt("blockscout_tx_info", 10n, "0.01"),
  tt("defillama_tvl", 20n, "0.02"),
  tt("sourcify_verify", 30n, "0.05"),
  tt("chainlink_price_feed", 5n, "0.01"),
];
