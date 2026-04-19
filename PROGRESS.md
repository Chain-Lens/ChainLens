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
| 1 | schema-validator (ajv) + injection-filter (OWASP) | ✅ Done |
| 2 | seller-tester 자동 API 테스트 서비스 | ✅ Done |
| 3 | Gateway 확장 (validation + responseHash/evidenceURI + reputation) | ✅ Done |
| 4 | Evidence 저장 (Phase 1: DB) + `/api/evidence/:jobId` | ✅ Done |
| 5 | Prisma 마이그레이션 (Job, SellerProfile, ApiTestResult) + reputation 엔드포인트 | ✅ Done |
| 6-7 | Event listener 확장 + E2E 테스트 | ✅ Done |

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

- **Week 2 Day 6-7: V2 Event Listener + E2E 테스트**
  - [packages/backend/src/services/v2-event-listener.service.ts](packages/backend/src/services/v2-event-listener.service.ts) — 4개 이벤트 구독 (스펙 3개 + 데이터 정합성을 위해 `PaymentRefunded` 추가). 각 핸들러는 pure DI 함수: `handleJobCreated`(PAID 행 생성 — `evidenceURI`는 `buildEvidenceURI(jobId, PLATFORM_URL)` 캐노니컬, taskType==0x00은 `null`로 저장해 legacy 경로 명시), `handleJobSubmitted`(`status=COMPLETED`, `responseHash` 이벤트에서 직접 복사), `handlePaymentRefunded`(`status=REFUNDED`), `handleJobResultRecorded`(로그만 — reputation은 on-chain이 authoritative). 모든 핸들러는 store/logger 실패를 **삼킨 뒤 error 로그만 남김** — 이벤트 구독이 한 번의 실패로 끊기면 후속 이벤트를 전부 놓치므로 격리. `startV2EventListener({chainId, publicClient, deps})`가 wiring을 담당, 미배포 체인에서는 명시적 throw (fail-fast). 반환값은 `stop()` 언서브 함수.
  - [packages/backend/src/index.ts](packages/backend/src/index.ts) — v1 리스너 `try/catch`는 그대로 유지, v2 리스너를 별도 `try/catch`로 래핑해 한쪽 실패가 다른 쪽을 막지 않도록 분리 (v2만 배포된 dev 환경 + v1만 남은 legacy 환경 모두 동일하게 동작).
  - [packages/backend/src/services/v2-event-listener.service.test.ts](packages/backend/src/services/v2-event-listener.service.test.ts) — 핸들러 단위 테스트 7 케이스: JobCreated(happy / ZERO_BYTES32 → null / store 실패시 swallow+error 로그), JobSubmitted(happy / record missing race), PaymentRefunded(REFUNDED 전환), JobResultRecorded(로그만).
  - [packages/backend/src/services/v2-event-listener.start.test.ts](packages/backend/src/services/v2-event-listener.start.test.ts) — start 통합 2 케이스: 미배포 chainId에 대한 throw / 4개 이벤트 구독 + 각 onLogs 경로가 올바른 핸들러로 라우팅됨 + stop()이 모두 언서브.
  - [packages/backend/src/services/job-flow.e2e.test.ts](packages/backend/src/services/job-flow.e2e.test.ts) — **E2E 2 케이스** (in-memory store + fake on-chain deps로 실제 프로덕션 코드 경로 전체 주행): **정상 경로** JobCreated → 게이트웨이 `finalizeJob` (responseHash keccak256 생성 + submit + recordSellerResult) → JobSubmitted → JobResultRecorded → 최종 상태 검증 (`status=COMPLETED`, `responseHash` 일치, `completedAt` 세팅, JobResultRecorded는 DB 미변경). **환불 경로** JobCreated → 게이트웨이가 injection 탐지로 refund → PaymentRefunded → `status=REFUNDED`. 가짜 deps만 viem/env를 대체하고, 게이트웨이·리스너·evidence 서비스는 전부 실제 코드.
  - **73/73 통과**, `tsc --noEmit` 클린. E2E 테스트가 "Seller 등록 → Job 요청 → 정산" 전체 파이프라인을 DB/RPC 없이 검증.

- **Week 2 Day 5: SellerProfile/ApiTestResult 스키마 + reputation/jobs 엔드포인트**
  - [packages/backend/prisma/schema.prisma](packages/backend/prisma/schema.prisma) — `SellerProfile` (`sellerAddress` unique, `endpointUrl`, `capabilities Json`, `pricePerCall Decimal(18,6)`, `status` + `@@index`, `jobsCompleted/jobsFailed/totalEarnings` 캐시) + `ApiTestResult` (`sellerAddress` + `capability`별 테스트 기록, `responseTimeMs`/`schemaValid`/`injectionFree`/`statusCode`) 모델 추가. `pnpm prisma generate`로 타입 재생성.
  - [packages/backend/src/services/on-chain.service.ts](packages/backend/src/services/on-chain.service.ts) — SellerRegistry read 3종 추가: `getSellerInfo(addr)` (registeredAt===0n 시 null 반환해 "미등록" 명시), `getSellerReputationBps(addr)`, `getSellerStats(addr)` (completed/failed/earnings를 `Promise.all`로 1-RTT). `OnChainSellerInfo`/`OnChainSellerStats` 인터페이스 노출.
  - [packages/backend/src/services/reputation.service.ts](packages/backend/src/services/reputation.service.ts) — pure DI 레이어: `ReputationDeps` (getSellerInfo/getSellerReputationBps/getSellerStats), `getSellerReputation(address, deps)`가 info 없으면 **조기 null** 반환 (불필요한 on-chain read 방지) → `Promise.all`로 bps+stats 병렬 조회 → bigint 전부 `.toString()` 직렬화한 `SellerReputation` 반환. `defaultReputationDeps()`는 lazy `import()` — 유닛 테스트가 viem/env 로드 없이 실행 가능.
  - [packages/backend/src/services/jobs.service.ts](packages/backend/src/services/jobs.service.ts) — pure 페이지네이션 레이어: `normalizeFilter(filter)`가 limit [1, 100] 클램프 + `Math.floor` + buyer/seller `toLowerCase()` (DB 대소문자 매칭 일관성), `listJobs(filter, store)`가 `JobsStore` 인터페이스에 위임. 런타임 prisma import 없음.
  - [packages/backend/src/services/jobs-store.ts](packages/backend/src/services/jobs-store.ts) — prisma 기반 `prismaJobsStore` (evidence-store.ts와 동일한 SRP 분리 패턴). `findMany`+`count`를 `Promise.all`로 병렬 실행, `orderBy: createdAt desc`, BigInt/Decimal/DateTime 전부 `.toString()`/`.toISOString()`로 `EvidenceView` 형태로 직렬화.
  - [packages/backend/src/routes/reputation.routes.ts](packages/backend/src/routes/reputation.routes.ts) — `GET /api/reputation/:sellerAddress`. 0x40 정규식 검증 → lazy dep 싱글턴 → `getSellerReputation` → `{400: invalid_address, 404: seller_not_registered}`.
  - [packages/backend/src/routes/jobs.routes.ts](packages/backend/src/routes/jobs.routes.ts) — `GET /api/jobs`. Zod `safeParse`로 쿼리 검증 (buyer/seller 0x40, taskType, status enum, limit/offset 숫자 강제 변환) → `listJobs(filter, prismaJobsStore)`. 검증 실패 시 `{400: invalid_query, details: zod.flatten()}`.
  - [packages/backend/src/routes/index.ts](packages/backend/src/routes/index.ts) — `/reputation`, `/jobs` 마운트.
  - 테스트: [reputation.service.test.ts](packages/backend/src/services/reputation.service.test.ts) 4 케이스 (미등록 null / shape 매핑 / uint256 초과값 직렬화 / 미등록 시 bps·stats 호출 차단), [jobs.service.test.ts](packages/backend/src/services/jobs.service.test.ts) 7 케이스 (normalizeFilter 6개: defaults / limit 클램프 / offset 클램프 / 주소 소문자 / taskType·status 패스스루 / 빈 필드 omit, listJobs 1개: store 정규화 필터 전달 + 페이지 리턴).
  - 전체 **62/62 통과**, `tsc --noEmit` 클린.

- **Week 2 Day 4: Evidence 저장 Phase 1 (DB) + `/api/evidence/:jobId`**
  - [packages/backend/prisma/schema.prisma](packages/backend/prisma/schema.prisma) — `Job` 모델 + `JobStatus` enum 추가 (`onchainJobId BigInt @unique`, `amount Decimal(18,6)`, `inputs/response Json?`, `inputsHash/responseHash/evidenceURI/errorReason`, `buyer/seller/taskType/status` 인덱스). `pnpm prisma generate`로 타입 재생성. `adminActions` pre-existing 타입 에러도 재생성으로 해결.
  - [packages/backend/src/config/env.ts](packages/backend/src/config/env.ts) + [.env.example](packages/backend/.env.example) — `PLATFORM_URL` 추가 (기본값 `http://localhost:3001`). `buildEvidenceURI()`의 베이스.
  - [packages/backend/src/services/evidence.service.ts](packages/backend/src/services/evidence.service.ts) — pure 레이어: `buildEvidenceURI(jobId, platformUrl)`(trailing slash 정규화), `EvidenceStore` 인터페이스 (create/complete/findByOnchainId), `EvidenceView` 직렬화 친화 타입 (BigInt은 string), 3개 함수 `recordJobPaid`/`recordJobCompletion`/`getEvidence`가 store를 DI로 받음. prisma 런타임 import 전혀 없음 → 테스트에서 DATABASE_URL 없이 로드 가능.
  - [packages/backend/src/services/evidence-store.ts](packages/backend/src/services/evidence-store.ts) — prisma 기반 `EvidenceStore` 구현 전용 파일 (static `import prisma`). evidence.service.ts와 분리해서 SRP 유지.
  - [packages/backend/src/services/evidence.service.test.ts](packages/backend/src/services/evidence.service.test.ts) — 8 케이스 (buildEvidenceURI 경로 정규화 2, recordJobPaid 기본/override 상태 2, recordJobCompletion COMPLETED/REFUNDED/FAILED 2, getEvidence null/hit 2). fake store로 DB 없이 실행.
  - [packages/backend/src/routes/evidence.routes.ts](packages/backend/src/routes/evidence.routes.ts) — `GET /api/evidence/:jobId`. 숫자 정규식 검증 (uint256 무제한 허용), BigInt 변환, `{404: evidence_not_found, 400: invalid_job_id}`.
  - [packages/backend/src/routes/evidence.routes.test.ts](packages/backend/src/routes/evidence.routes.test.ts) — 4 케이스 (400/404/200/큰 uint256 허용). express 5 앱을 랜덤 포트에서 띄우고 fetch로 검증. prisma 연결 없이 fake store로 통합 테스트.
  - 전체 51/51 통과, `tsc --noEmit` 클린.

- **Week 2 Day 3: Gateway 확장 (validation + responseHash/evidenceURI + reputation)**
  - [packages/backend/src/services/task-type.service.ts](packages/backend/src/services/task-type.service.ts) — `getTaskTypeConfigById(bytes32)` 추가 (Gateway는 on-chain Job 구조체에서 이미 bytes32 id를 가지므로 이름 재계산 없이 직접 조회). `getTaskTypeConfig(name)`은 이 함수로 위임 리팩터링.
  - [packages/backend/src/services/on-chain.service.ts](packages/backend/src/services/on-chain.service.ts) — v2 계약 쓰기 3종: `submitJob({jobId,responseHash,evidenceURI})`, `refundJob({jobId})`, `recordSellerResult({seller,success,earningsUsdc})`. chainId 기반 주소 조회 + `waitForTransactionReceipt`까지 동기화.
  - [packages/backend/src/services/job-gateway.service.ts](packages/backend/src/services/job-gateway.service.ts) — `finalizeJob(input, deps?)` 오케스트레이션. 판정 순서: task_type → scan → schema → hash → submit. taskType=0x00은 레거시 경로로 검증 스킵. 모든 실패는 자동 refund+reputation 하향. submit 성공 후 reputation 실패는 **로그만** (에스크로 정산이 이미 끝난 시점이라 사용자 응답 차단 금지). refund 자체가 실패하면 `status:"failed", reason:"refund_failed:<원인>"` 로 gateway 운영자에게 수동 대응 신호 전달. 모든 on-chain 호출은 DI (`getConfigById`/`submitJobOnChain`/`refundJobOnChain`/`recordSellerResult`), 기본값은 lazy `import()` — 유닛 테스트가 viem/env를 로드하지 않도록 격리.
  - [packages/backend/src/services/job-gateway.service.test.ts](packages/backend/src/services/job-gateway.service.test.ts) — 14 케이스: task_type_not_found/disabled, injection_detected (scan이 schema보다 먼저 실행됨 검증 포함), schema_invalid (ajv 에러 전달), schema_fetch_failed, response_unserializable (legacy 경로), 정상 submit (해시 일치, evidenceURI 통과), taskType=0x00 시 scan/schema 스킵, schemaURI="" 시 submit, recordSellerResult 실패 시에도 submitted 유지, submit revert 시 failed, refund revert 시 `refund_failed:<reason>`, 해시 결정성. 전체 39/39 통과.

- **Week 2 Day 2: seller-tester 자동 API 테스트 서비스**
  - [packages/backend/src/services/task-type.service.ts](packages/backend/src/services/task-type.service.ts) — viem `publicClient.readContract` 래퍼. `taskTypeId(name)` = keccak256(utf8), `getTaskTypeConfig(name)` (on-chain "not found" 감지 시 `null`), `isTaskTypeEnabled(name)`. registry 주소는 chainId별 `TASK_TYPE_REGISTRY_ADDRESSES` 조회 + 미배포 체인/제로 주소에서 명시적 에러.
  - [packages/backend/src/services/test-payloads.ts](packages/backend/src/services/test-payloads.ts) — 5개 초기 task_type 캐노니컬 프로브 페이로드 (UNI 컨트랙트 주소, 유명 트랜잭션 해시, `uniswap` protocol, ETH/USD 피드). `getTestPayload(cap)`는 미등록 시 `{}` 폴백.
  - [packages/backend/src/services/seller-tester.service.ts](packages/backend/src/services/seller-tester.service.ts) — `testSeller({sellerAddress,endpointUrl,capabilities}, deps?)`. DI로 `getConfig`/`fetchImpl`/`payloadFor` 오버라이드 가능 (테스트 시 on-chain·네트워크 의존성 제거). capability별 `probeCapability`: POST `{task_type, inputs}` → `AbortSignal.timeout(maxResponseTime*1000)` → HTTP/JSON 파싱 → `scanResponse` (주입 차단) → `validateAgainstSchema` 순서. 스키마 페치 실패는 **해당 capability만 실패** 처리해서 registry placeholder 단계에서 전체 온보딩이 막히지 않도록 방어. 기본 `getConfig`는 lazy `import()` — 테스트가 viem/env 체인을 로드하지 않도록 분리.
  - [packages/backend/src/services/seller-tester.service.test.ts](packages/backend/src/services/seller-tester.service.test.ts) — 13 케이스 (unknown_task_type / disabled / HTTP 503 / network error / invalid_json / injection 탐지 / schema_invalid / schema_fetch_failed(단일 capability만 실패) / 정상 경로 / schemaURI 빈 문자열 / 빈 capabilities / mixed pass+fail / 요청 body 구조 검증). 전체 25/25 통과.

- **Week 2 Day 1: schema-validator + injection-filter (백엔드 보안 서비스)**
  - [packages/backend/src/services/schema-validator.service.ts](packages/backend/src/services/schema-validator.service.ts) — ajv (strict + allErrors) + ajv-formats, **컴파일된 validator 캐싱**(스펙은 raw schema만 캐시해서 compile 반복 — 개선), `primeSchemaCache`/`clearSchemaCache` 테스트 훅 노출, ipfs:// → https://ipfs.io 게이트웨이 변환
  - [packages/backend/src/services/injection-filter.service.ts](packages/backend/src/services/injection-filter.service.ts) — 13개 OWASP LLM01 패턴 (`[SYSTEM:`, `<|im_start|>`, `[INST]`, ignore/disregard/forget previous, persona hijack 등) + 1MB 사이즈 캡 + cycle/bigint/function 직렬화 실패 방어 (`response_unserializable`)
  - [packages/backend/src/services/*.test.ts](packages/backend/src/services/) — node:test 기반 12 케이스 전부 통과 (injection 패턴 12개 + benign 4개 + scanResponse 5개 + schema 5개)
  - `pnpm test` 스크립트 추가 (`tsx --test 'src/**/*.test.ts'`) — 별도 테스트 런타임 없이 Node 내장 사용
  - 의존성: `ajv@^8.18`, `ajv-formats@^3.0` 추가
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
