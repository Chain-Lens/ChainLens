/**
 * Mirror of `TaskTypeRegistryTypes.TaskTypeConfig` — returned by
 * `TaskTypeRegistry.getConfig(taskType)`.
 */
export interface OnChainTaskTypeConfig {
  name: string;
  schemaURI: string;
  maxResponseTime: bigint;
  minBudget: bigint;
  enabled: boolean;
  registeredAt: bigint;
}

/** Canonical task type ids registered on deploy (spec §8). */
export const INITIAL_TASK_TYPE_NAMES = [
  "blockscout_contract_source",
  "blockscout_tx_info",
  "defillama_tvl",
  "sourcify_verify",
  "chainlink_price_feed",
] as const;

export type InitialTaskTypeName = (typeof INITIAL_TASK_TYPE_NAMES)[number];
