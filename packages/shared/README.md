# @chainlens/shared

Shared TypeScript types, contract ABIs, deployed addresses, chain configs, and
task-type registry for [ChainLens](https://github.com/lejuho/ChainLens) — a
Web2-data relay market for autonomous agents on Base.

Used internally by:

- `@chainlens/mcp-tool` — MCP client for Claude Desktop
- `@chainlens/backend` — gateway service
- `@chainlens/frontend` — marketplace UI

## Install

```bash
npm install @chainlens/shared
```

## Usage

```ts
import {
  ApiMarketEscrowV2Abi,
  SellerRegistryAbi,
  baseSepolia,
  INITIAL_TASK_TYPE_NAMES,
  PaymentStatus,
} from "@chainlens/shared";
```

Exports include:

- **ABIs** — `ApiMarketEscrowV2Abi`, `SellerRegistryAbi`, `TaskTypeRegistryAbi`
- **Addresses** — `ESCROW_V2_ADDRESS`, `SELLER_REGISTRY_ADDRESS`, `TASK_TYPE_REGISTRY_ADDRESS`, `USDC_ADDRESS` (Base Sepolia)
- **Chains** — `baseSepolia`, `baseMainnet` (viem `Chain` objects)
- **Task types** — `INITIAL_TASK_TYPE_NAMES`, schemas, `OnChainTaskTypeConfig`
- **Types** — `PaymentStatus`, `ApiStatus`, `ApiListingPublic`, `PreparePaymentResponse`

## License

MIT
