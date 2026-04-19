# @chain-lens/sample-sellers

Reference seller agents demonstrating how a ChainLens Type 2 seller can be
implemented. Each wrapper runs a small Express service that the gateway can
call to fulfill a registered task type.

## Contract

Each server exposes:

- `GET /health` → `{ status: "ok", seller, capabilities: string[] }`
- `POST /` with body `{ task_type: string, inputs: object }` → task-specific
  JSON response. Responses are plain JSON and must pass the task type's
  schema + injection filter (no backticks, curly-brace macros, etc.).

## Wrappers

| Task types | Directory | Default port | Upstream |
| --- | --- | --- | --- |
| `blockscout_contract_source`, `blockscout_tx_info` | `src/blockscout/` | `8081` | Blockscout v2 API (per chain) |
| `defillama_tvl` | `src/defillama/` | `8082` | `https://api.llama.fi` |
| `sourcify_verify` | `src/sourcify/` | `8083` | `https://sourcify.dev/server` |

## Running locally

```bash
pnpm --filter @chain-lens/sample-sellers dev:blockscout   # :8081
pnpm --filter @chain-lens/sample-sellers dev:defillama    # :8082
pnpm --filter @chain-lens/sample-sellers dev:sourcify     # :8083
```

Example call:

```bash
curl -X POST http://localhost:8082/ \
  -H 'Content-Type: application/json' \
  -d '{"task_type":"defillama_tvl","inputs":{"protocol":"uniswap"}}'
```

## Docker

```bash
docker build -f packages/sample-sellers/docker/Dockerfile.blockscout -t chain-lens/blockscout-wrapper .
docker build -f packages/sample-sellers/docker/Dockerfile.defillama  -t chain-lens/defillama-wrapper  .
docker build -f packages/sample-sellers/docker/Dockerfile.sourcify   -t chain-lens/sourcify-wrapper   .

docker run -p 8082:8082 chain-lens/defillama-wrapper
```

The Dockerfiles expect to be built from the repo root so pnpm can resolve the
workspace. `PORT` is overridable via env. Each image only contains the
compiled JS for that wrapper's module tree; no workspace siblings are shipped.

## Tests

```bash
pnpm --filter @chain-lens/sample-sellers test
```

Handlers are written as `makeXxxHandler(deps)` where `deps.fetch` is
injected, so every handler test runs without network access.
