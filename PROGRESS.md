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
| 2 | SellerRegistry.sol (ERC-8004 호환) + 테스트 + 배포 | ✅ Done |
| 3-4 | ApiMarketEscrow v2 evolve (Job 개념, ERC-8183 alias, 하위 호환) | ✅ Done |
| 5 | shared ABI + types 업데이트 (v2 + 2개 Registry) | ✅ Done |

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
| SellerRegistry | `contracts/SellerRegistry.sol` + `types/SellerRegistryTypes.sol` | 40/40 passing | ✅ `0xcF36b76b5Da55471D4EBB5349A0653624371BE2c` (Base Sepolia) |
| ApiMarketEscrow v2 | `contracts/ApiMarketEscrowV2.sol` + `types/ApiMarketEscrowV2Types.sol` + `mocks/MockUSDC.sol` | 34/34 passing | ✅ `0xD4c40710576f582c49e5E6417F6cA2023E30d3aD` (Base Sepolia) |

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

- **Week 1 Day 5: shared ABI + 타입 확장 (v2 + 2개 Registry)**
  - [packages/contracts/scripts/copy-abi.ts](packages/contracts/scripts/copy-abi.ts) — 4개 ABI 배치 복사 (ApiMarketEscrow, ApiMarketEscrowV2, SellerRegistry, TaskTypeRegistry)
  - [packages/shared/src/abi/](packages/shared/src/abi/) — 4개 JSON + `index.ts` 에서 전부 재수출
  - [packages/shared/src/constants/contracts.ts](packages/shared/src/constants/contracts.ts) — `CONTRACT_ADDRESSES_V2` / `SELLER_REGISTRY_ADDRESSES` / `TASK_TYPE_REGISTRY_ADDRESSES` 추가 (Base Sepolia 주소 반영)
  - [packages/shared/src/types/job.ts](packages/shared/src/types/job.ts) — `OnChainJob` + `JobStatus` + `jobStatus()` 헬퍼 (v2 getJob 반환형 매칭)
  - [packages/shared/src/types/task-type.ts](packages/shared/src/types/task-type.ts) — `OnChainTaskTypeConfig` + `INITIAL_TASK_TYPE_NAMES`
  - [packages/shared/src/types/seller.ts](packages/shared/src/types/seller.ts) — 기존 `Seller` 유지 + `OnChainSeller` + `REPUTATION_NEUTRAL_BPS`/`REPUTATION_MAX_BPS` 추가
  - `pnpm build` @ `packages/shared` 성공. 백엔드 pre-existing 타입 에러(`api.service.ts:106`)는 이번 변경과 무관 (stash 후 재현 확인)
- **Week 1 Day 3-4 배포: ApiMarketEscrowV2 → Base Sepolia**
  - 주소: `0xD4c40710576f582c49e5E6417F6cA2023E30d3aD`
  - Owner/Gateway: `0xD21dE9470d8A0dbae0dE0b5f705001a6482Db580` (deployer)
  - USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (Base Sepolia 공식)
  - feeRate: 500 bps (5%, v1과 동일)
  - `scripts/verify-escrow-v2.ts` 추가 (owner/gateway/feeRate/usdc/nextJobId/상수 검증)
- **Week 1 Day 3-4 (local): ApiMarketEscrowV2 구현 + 테스트 + Ignition 모듈**
  - [contracts/ApiMarketEscrowV2.sol](packages/contracts/contracts/ApiMarketEscrowV2.sol) — Job 구조체 (taskType/inputsHash/responseHash/evidenceURI 추가), `pay` v2 시그니처 + ERC-8183 alias `createJob`/`submit`, `getJob` view, `Ownable2Step` + `ReentrancyGuard` + SafeERC20 적용. taskType==0 경로는 v1 approvedApis 검증 유지 (하위 호환), taskType!=0 경로는 gateway+TaskTypeRegistry off-chain 검증 전제로 approvedApis 우회.
  - [contracts/types/ApiMarketEscrowV2Types.sol](packages/contracts/contracts/types/ApiMarketEscrowV2Types.sol) — `Job` 구조체 라이브러리 (struct 분리 규칙)
  - [contracts/mocks/MockUSDC.sol](packages/contracts/contracts/mocks/MockUSDC.sol) — 6-decimal 테스트 전용 ERC20 (실제 배포에는 사용 안 함)
  - [test/ApiMarketEscrowV2.test.ts](packages/contracts/test/ApiMarketEscrowV2.test.ts) — 34 케이스 전부 통과 (deploy / approveApi / setFeeRate / setGateway / pay legacy & task-type 경로 / createJob alias / complete & submit alias / refund / claim / Ownable2Step / 수수료 0% 분기 / empty evidence / double-action 반려 등)
  - [ignition/modules/ApiMarketEscrowV2.ts](packages/contracts/ignition/modules/ApiMarketEscrowV2.ts) — `gateway` / `feeRate` / `usdc` 파라미터 (기본: 기존 deployer, 500 bps, Base Sepolia USDC)
  - `pnpm deploy:escrow-v2` 스크립트 추가
  - 로컬 hardhat에서 Ignition flow 검증 + 3개 신규 컨트랙트 104/104 테스트 통과
- **Week 1 Day 2 배포: SellerRegistry → Base Sepolia**
  - 주소: `0xcF36b76b5Da55471D4EBB5349A0653624371BE2c`
  - Owner/Gateway: `0xD21dE9470d8A0dbae0dE0b5f705001a6482Db580` (deployer, 동일 주소로 부트스트랩)
  - `REPUTATION_NEUTRAL_BPS=5000`, `REPUTATION_MAX_BPS=10000` on-chain 읽기 확인
  - `scripts/verify-seller-registry.ts` 추가 (owner/gateway/상수 검증)
- **Week 1 Day 2 (local): SellerRegistry 구현 + 테스트 + Ignition 모듈**
  - [contracts/SellerRegistry.sol](packages/contracts/contracts/SellerRegistry.sol) — OZ `Ownable2Step` + `onlyGateway` 모디파이어, 게이트웨이 로테이션 지원, 5 이벤트 (`SellerRegistered`/`SellerUpdated`/`SellerDeactivated`/`JobResultRecorded`/`GatewayUpdated`)
  - [contracts/types/SellerRegistryTypes.sol](packages/contracts/contracts/types/SellerRegistryTypes.sol) — `Seller` 구조체 라이브러리 (caution.md 규칙 준수)
  - [test/SellerRegistry.test.ts](packages/contracts/test/SellerRegistry.test.ts) — 40 케이스 전부 통과 (deployment / setGateway / registerSeller / updateMetadataURI / deactivate 3-role / recordJobResult / getReputation 4 분기 / view 헬퍼 / Ownable2Step)
  - [ignition/modules/SellerRegistry.ts](packages/contracts/ignition/modules/SellerRegistry.ts) — `gateway` 파라미터 지원 (기본값: 기존 deployer 주소, 배포 시 덮어쓰기 가능)
  - `pnpm deploy:seller-registry` 스크립트 추가 (Base Sepolia 타겟)
  - 로컬 hardhat 네트워크에서 Ignition flow 검증 완료
  - 스펙 §3.2 대비 추가: `updateMetadataURI(seller, metadataURI)` (스펙은 `SellerUpdated` 이벤트만 선언했지만 emit 경로 필요), `GatewayUpdated` 이벤트 (게이트웨이 로테이션 투명성), `isRegistered`/`isActive` view 헬퍼

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
