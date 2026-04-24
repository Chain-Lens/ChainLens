# @chain-lens/shared

Shared TypeScript types, contract ABIs, deployed addresses, chain configs, and
task-type registry for [ChainLens](https://github.com/Chain-Lens/ChainLens) — a
Web2-data relay market for autonomous agents on Base.

Used internally by:

- `@chain-lens/mcp-tool` — MCP client for Claude Desktop
- `@chain-lens/backend` — gateway service
- `@chain-lens/frontend` — marketplace UI

## Install

```bash
npm install @chain-lens/shared
```

## Usage

```ts
import {
  ApiMarketEscrowV2Abi,
  SellerRegistryAbi,
  baseSepolia,
  INITIAL_TASK_TYPE_NAMES,
  PaymentStatus,
} from "@chain-lens/shared";
```

Exports include:

- **ABIs** — `ApiMarketEscrowV2Abi`, `SellerRegistryAbi`, `TaskTypeRegistryAbi`
- **Addresses** — `CONTRACT_ADDRESSES_V2`, `SELLER_REGISTRY_ADDRESSES`, `TASK_TYPE_REGISTRY_ADDRESSES`, `CHAIN_LENS_MARKET_ADDRESSES`, `USDC_ADDRESSES`
- **Chains** — `baseSepolia`, `baseMainnet` (viem `Chain` objects)
- **Task types** — `INITIAL_TASK_TYPE_NAMES`, schemas, `OnChainTaskTypeConfig`
- **Types** — `PaymentStatus`, `ApiStatus`, `ApiListingPublic`, `PreparePaymentResponse`

## License

MIT
