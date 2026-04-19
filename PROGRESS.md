# ChainLens — Implementation Progress

> [TYPE2_MVP_CLEAN_BUILD_SPEC.md](./TYPE2_MVP_CLEAN_BUILD_SPEC.md) 기반 3주 스프린트 진행 현황. 상세 스펙은 해당 문서 참조.

**기준 커밋**: d1be20b (origin/main, v1 ApiMarketEscrow)
**전략**: Evolve — 기존 v1 유지 + v2/신규 Registry 추가

---

## Sprint Timeline (spec §7)

### Week 1 — 컨트랙트 확장

| Day | 작업 | Status |
|-----|------|--------|
| 1 | TaskTypeRegistry.sol + 테스트 + Ignition + 배포 + task_type 5개 등록 | 📅 Next |
| 2 | SellerRegistry.sol (ERC-8004 호환) + 테스트 + 배포 | 📅 Planned |
| 3-4 | ApiMarketEscrow v2 evolve (Job 개념, ERC-8183 alias, 하위 호환) | 📅 Planned |
| 5 | shared ABI + types 업데이트 (v2 + 2개 Registry) | 📅 Planned |

### Week 2 — 백엔드 확장

| Day | 작업 | Status |
|-----|------|--------|
| 1 | schema-validator (ajv) + injection-filter (OWASP) | 📅 Planned |
| 2 | seller-tester 자동 API 테스트 서비스 | 📅 Planned |
| 3 | Gateway 확장 (validation + responseHash/evidenceURI + reputation) | 📅 Planned |
| 4 | Evidence 저장 (Phase 1: DB) + `/api/evidence/:jobId` | 📅 Planned |
| 5 | Prisma 마이그레이션 (Job, SellerProfile, ApiTestResult) + reputation 엔드포인트 | 📅 Planned |
| 6-7 | Event listener 확장 + E2E 테스트 | 📅 Planned |

### Week 3 — 프론트엔드 + MCP + 데모

| Day | 작업 | Status |
|-----|------|--------|
| 1-2 | `/marketplace` 개선 + `/evidence/[jobId]` + `/reputation/[sellerAddress]` + 훅 3개 | 📅 Planned |
| 3-4 | `packages/mcp-tool/` 신규 + discover/request/status 3개 도구 | 📅 Planned |
| 5 | Sample seller 3개 (Blockscout/DeFiLlama/Sourcify) | 📅 Planned |
| 6-7 | 통합·문서·데모 시나리오·영상 | 📅 Planned |

---

## Smart Contracts (spec §3)

| Contract | File | Tests | Deployed |
|----------|------|-------|----------|
| ApiMarketEscrow (v1, legacy) | `contracts/ApiMarketEscrow.sol` | 기존 457L | `0xDAa04e9BD451F9D27EcEd569303181c71F0A7b27` (Base Sepolia) |
| TaskTypeRegistry | TBD | — | — |
| SellerRegistry | TBD | — | — |
| ApiMarketEscrow v2 | TBD | — | — |

---

## 초기 Task Types (spec §8, Week 1 Day 1 등록 예정)

1. `blockscout_contract_source` — Verified contract source code
2. `blockscout_tx_info` — Transaction details
3. `defillama_tvl` — DeFi protocol TVL
4. `sourcify_verify` — Contract bytecode verification
5. `chainlink_price_feed` — Price oracle read

각 JSON 스키마: `packages/shared/src/schemas/task-types/` (Week 2 Day 1에 작성)

---

## 현재 블로커

(없음 — Week 1 Day 1 착수 가능)

---

## Changelog

> 작업 단위(커밋 기준)로 누적 기록. 최신이 위.

### 2026-04-19

- **Sprint kickoff** — `@openzeppelin/contracts@5.6.1` 설치, `PROGRESS.md` 스켈레톤 생성 ([TYPE2_MVP_CLEAN_BUILD_SPEC.md](./TYPE2_MVP_CLEAN_BUILD_SPEC.md) §7 기반)
