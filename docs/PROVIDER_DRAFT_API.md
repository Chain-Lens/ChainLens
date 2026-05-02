# Provider Draft / Claim API

Provider drafts connect the open GitHub directory flow with ChainLens paid
listings. The directory or MCP flow can create an executable-listing draft from
public metadata, then the real seller claims it with a wallet-backed seller
session before adding endpoint, price, schema, and on-chain registration data.

## Data Model

`ProviderDraft` is keyed by `providerSlug` and stores:

- Public directory metadata: name, description, category, website, docs, source attestation.
- Raw `directoryMetadata` so future UI/MCP flows can reuse GitHub-reviewed fields.
- GitHub provenance: repository URL, PR URL, reviewed timestamp, sync timestamp.
- Discovery signal: `directoryVerified` powers ChainLens trust badges once linked to a listing.
- Claim state: `UNCLAIMED`, `CLAIMED`, `LISTED`, or `ARCHIVED`.
- Seller ownership: `claimedBy`, `claimedAt`.
- Optional listing linkage: `listingUrl`, `listingOnChainId`.

After deploying this schema, run:

```bash
pnpm --filter @chain-lens/backend db:push
```

For production, set `DIRECTORY_INGEST_TOKEN` so draft upserts require the
`x-chainlens-directory-token` header.

## Endpoints

`POST /api/directory/drafts`

Creates or updates a draft by `providerSlug`. Intended for GitHub Actions,
maintainer tooling, or a seller MCP. If `DIRECTORY_INGEST_TOKEN` is set, callers
must send `x-chainlens-directory-token`.

```json
{
  "providerSlug": "example-data",
  "name": "Example Data",
  "description": "Wallet and token analytics API.",
  "category": "analytics",
  "website": "https://example.com",
  "docs": "https://example.com/docs",
  "sourceAttestation": "https://example.com/docs",
  "directoryVerified": true,
  "sourceRepoUrl": "https://github.com/pelican-lab/awesome-onchain-data-providers",
  "sourcePrUrl": "https://github.com/pelican-lab/awesome-onchain-data-providers/pull/12",
  "reviewedAt": "2026-05-02T00:00:00.000Z",
  "directoryMetadata": {
    "slug": "example-data",
    "chainlens": { "wants_listing": true }
  }
}
```

`GET /api/directory/drafts/:providerSlug`

Returns the draft for register-page prefill, claim UI, or MCP inspection.

`GET /api/directory/drafts/mine`

Requires seller auth. Returns drafts claimed by the current seller wallet.

`POST /api/directory/drafts/:providerSlug/claim`

Requires seller auth. Claims an unclaimed draft for the current wallet. Repeated
claims by the same seller are idempotent; claims by another seller return `409`.

`PATCH /api/directory/drafts/:providerSlug/listing`

Requires seller auth and prior claim by the same wallet. Links the draft to a
created listing.

```json
{
  "listingUrl": "https://chainlens.example/register?provider=example-data",
  "listingOnChainId": 42
}
```

When `listingOnChainId` is set and `directoryVerified` is true, public discovery
responses include a directory trust signal and the frontend can show a GitHub
directory verified badge with the review trail.
