# ChainLens — Implementation Progress

> [TYPE2_MVP_CLEAN_BUILD_SPEC.md](./TYPE2_MVP_CLEAN_BUILD_SPEC.md) 기반 3주 스프린트 진행 현황. 상세 스펙은 해당 문서 참조.

**기준 커밋**: d1be20b (origin/main, v1 ApiMarketEscrow)
**전략**: Evolve — 기존 v1 유지 + v2/신규 Registry 추가

---

## Sprint Timeline (spec §7)

### Week 1 — 컨트랙트 확장

| Day | 작업 | Status |
|-----|------|--------|
| 1 | TaskTypeRegistry.sol + 테스트 + Ignition + 배포 + task_type 5개 등록 | ✅ Done |
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
| TaskTypeRegistry | `contracts/TaskTypeRegistry.sol` + `types/TaskTypeRegistryTypes.sol` | 30/30 passing | ✅ `0xD2ab227417B26f4d8311594C27c59adcA046501F` (Base Sepolia) |
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

- **Week 1 Day 1 배포: TaskTypeRegistry → Base Sepolia**
  - 주소: `0xD2ab227417B26f4d8311594C27c59adcA046501F`
  - Owner: `0xD21dE9470d8A0dbae0dE0b5f705001a6482Db580` (deployer)
  - 5개 task_type 모두 `isEnabled=true`로 등록 확인 (on-chain read 검증)
  - 총 가스 ≈ 0.00001 ETH (1 deploy + 5 register)
- **Week 1 Day 1 (local): TaskTypeRegistry 구현 + 테스트 + Ignition 모듈**
  - [contracts/TaskTypeRegistry.sol](packages/contracts/contracts/TaskTypeRegistry.sol) — OZ `Ownable2Step` 상속, require-string 검증, 3 이벤트
  - [contracts/types/TaskTypeRegistryTypes.sol](packages/contracts/contracts/types/TaskTypeRegistryTypes.sol) — `TaskTypeConfig` 구조체 라이브러리 (caution.md 규칙 준수)
  - [test/TaskTypeRegistry.test.ts](packages/contracts/test/TaskTypeRegistry.test.ts) — 30 케이스 전부 통과 (deployment / register / update / setEnabled / isEnabled·getConfig / Ownable2Step 2단계 전환)
  - [ignition/modules/TaskTypeRegistry.ts](packages/contracts/ignition/modules/TaskTypeRegistry.ts) + [ignition/task-types.ts](packages/contracts/ignition/task-types.ts) — 5개 초기 task_type 상수화, 배포 시 `registerTaskType` 5회 자동 호출
  - [hardhat.config.ts](packages/contracts/hardhat.config.ts) — 루트 `.env` 로드 경로 수정 (`dotenv.config({ path: '../../.env' })`)
  - `pnpm deploy:task-type-registry` 스크립트 추가 (Base Sepolia 타겟)
  - 로컬 hardhat 네트워크에서 전체 Ignition flow 검증 완료 (배포 + 5회 등록 성공)
- **Sprint kickoff** — `@openzeppelin/contracts@5.6.1` 설치, `PROGRESS.md` 스켈레톤 생성 ([TYPE2_MVP_CLEAN_BUILD_SPEC.md](./TYPE2_MVP_CLEAN_BUILD_SPEC.md) §7 기반)
