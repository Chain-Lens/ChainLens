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
| 1-2 | `/marketplace` 개선 + `/evidence/[jobId]` + `/reputation/[sellerAddress]` + 훅 3개 | ✅ Done |
| 3-4 | `packages/mcp-tool/` 신규 + discover/request/status 3개 도구 | ✅ Done |
| 5 | Sample seller 3개 (Blockscout/DeFiLlama/Sourcify) | ✅ Done |
| 6-7 | 통합·문서·데모 시나리오·영상 | ✅ Done (영상 제외) |

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

- **Phase A: npm 퍼블리싱 사전 준비 — `@apimarket/*` → `@chainlens/*` 리네임**
  - 전수 치환: `grep -rl '@apimarket/' | xargs sed -i 's|@apimarket/|@chainlens/|g'` 43개 파일 (package.json 5종, 소스 임포트, Dockerfile, README, 루트 package.json scripts, PROGRESS 기록).
  - `packages/shared/package.json` — `private: true` 제거, `license: MIT`, `repository`, `files: [dist, README.md]`, `prepublishOnly: "pnpm build"`, `publishConfig.access: public` 추가. 외부 퍼블리싱 가능한 라이브러리로 전환.
  - `packages/shared/README.md` — 신규. 외부 소비자용 usage 예시 (`@chainlens/shared` 임포트, 노출 심볼 카테고리별 요약).
  - `packages/mcp-tool/package.json` — `license`, `repository`, `keywords` (mcp/claude/base/web3/agents), `prepublishOnly`, `publishConfig.access: public` 추가. `bin: chainlens-mcp`와 `files: [dist, README.md]`는 기존 유지.
  - `packages/mcp-tool/README.md` — 사용자 가이드를 `npx -y @chainlens/mcp-tool` 중심으로 재작성. Claude Desktop config 예시도 `command: "npx"` 형태로 교체 (git clone + 절대 경로 제거). Alchemy/Infura RPC 권장 노트 추가.
  - 루트 `package.json` 이름 `monapi-market` → `chainlens`.
  - 검증: `pnpm install` 성공(workspace 해결), `@chainlens/shared` + `@chainlens/mcp-tool` build 성공, MCP 17/17 pass, frontend `tsc --noEmit` 클린. `pnpm publish --dry-run`은 네트워크/인증 필요해 보류 — workspace:* 자동 버전 치환은 pnpm 공식 동작.
  - 설계 결정: v0.1.0 그대로 유지 (아직 미출판 초기 릴리즈). 실제 `pnpm publish`는 npm 로그인 + 2FA 필요하므로 사용자가 직접 실행.

- **Week 3 Day 6-7: 문서 + 데모 시나리오 (Type 2 MVP 완료)**
  - [README.md](README.md) — v1 중심의 원래 README를 Type 2 Market 관점으로 전면 재작성. v2 배포 주소(ApiMarketEscrowV2/SellerRegistry/TaskTypeRegistry), 6-패키지 모노레포 레이아웃, 초기 5 task type, 보안 포스처 요약, MCP 연결 예시(Claude Desktop config JSON) 포함. 레거시 `pay()` x402 설명은 제거 — v2는 `createJob` 기반이라 혼란 방지.
  - [docs/DEMO.md](docs/DEMO.md) — 데모 시나리오 3종: **(A) 브라우저 바이어** (marketplace → wallet sign → evidence explorer에서 client-side 해시 매치 확인), **(B) MCP 에이전트** (Claude Desktop에 mcp-tool 등록 → 자연어 프롬프트로 discover/request/status 체이닝), **(C) Seller 온보딩** (sample-sellers Express 앱 → `/api/sellers/register` → seller-tester 자동 검증 → 마켓플레이스 등록). 각 시나리오의 "무엇을 가리킬지" 포인트와 Base Sepolia 예상 타이밍표(전체 ~6-10s) 명시. 추가로 **refund 경로 실패 데모**(injection 필터가 실제로 돈을 돌려보내는지 10초 내 증명) 제공 — 필터가 장식이 아니라 load-bearing임을 보여주는 용도.
  - 영상/Loom 녹화는 스펙에 있지만 문서 단계에서는 제외 (대본 역할은 DEMO.md가 수행, 실제 녹화는 데모 당일).
  - 킥스타트 공개 페이지는 별도 마케팅 산출물이라 레포에는 포함하지 않고 README + DEMO.md를 primary artefact로 유지.
  - `AGENT_API.md`는 v1 레거시 플로우 가이드로 유지 (기존 `ApiMarketEscrow` 배포가 아직 살아있음) — v2 쪽은 README의 MCP 섹션 + `packages/mcp-tool/README.md`가 담당.
  - **Type 2 MVP 21일치 전체 완료**: contracts 34/34, backend 79/79, mcp-tool 17/17, sample-sellers 18/18. frontend tsc 클린. 모든 Day 체크박스 ✅.

- **Week 3 Day 5: Sample seller 에이전트 3종 + Dockerfile**
  - [packages/sample-sellers/package.json](packages/sample-sellers/package.json) + [tsconfig.json](packages/sample-sellers/tsconfig.json) — 신규 워크스페이스 `@chainlens/sample-sellers`. 래퍼 3종은 한 패키지 안의 별도 엔트리(`dist/blockscout|defillama|sourcify/index.js`) — 3개 패키지로 쪼개면 lib/types/server 중복 발생하고 Dockerfile은 어차피 각각이므로, 패키지 1 × 진입점 3 이 SRP와 배포 유연성을 동시에 만족.
  - [packages/sample-sellers/src/lib/server.ts](packages/sample-sellers/src/lib/server.ts) + [lib/types.ts](packages/sample-sellers/src/lib/types.ts) — `createSellerApp({name, handlers})` Express 앱 팩토리. 공통 컨트랙트: `POST /` `{task_type, inputs}` → 핸들러 디스패치. `GET /health` 에 capabilities 목록 노출. `BadInputError` → 400 / `UpstreamError(code)` → 그 code / 그 외 Error → 500 으로 분기해 seller-tester·게이트웨이가 원인별로 구분 가능. body limit 64kb.
  - [packages/sample-sellers/src/blockscout/handler.ts](packages/sample-sellers/src/blockscout/handler.ts) + [index.ts](packages/sample-sellers/src/blockscout/index.ts) — `blockscout_contract_source` + `blockscout_tx_info` 2종. `DEFAULT_BLOCKSCOUT_BASES`(Ethereum mainnet / Base / Base Sepolia) + `baseUrlFor(chainId)` DI로 미지원 체인은 `BadInputError`. 응답은 필드 white-list로 정규화 (업스트림 필드 변경에 덜 민감하게 + schema 맞추기). 기본 포트 8081.
  - [packages/sample-sellers/src/defillama/handler.ts](packages/sample-sellers/src/defillama/handler.ts) + [index.ts](packages/sample-sellers/src/defillama/index.ts) — `defillama_tvl`. `protocol` 슬러그 regex(`/^[a-z0-9][a-z0-9-]{0,63}$/`)로 검증 → URL 인젝션·path traversal 차단. `chainTvls`를 `{chain: tvl}` 맵으로 요약, 수치 아닌 항목 제거. 기본 포트 8082.
  - [packages/sample-sellers/src/sourcify/handler.ts](packages/sample-sellers/src/sourcify/handler.ts) + [index.ts](packages/sample-sellers/src/sourcify/index.ts) — `sourcify_verify`. `/check-all-by-addresses` 호출, `status: "perfect"|"partial"` → `verified=true`. 기본 포트 8083.
  - Docker: [docker/Dockerfile.blockscout](packages/sample-sellers/docker/Dockerfile.blockscout) / [Dockerfile.defillama](packages/sample-sellers/docker/Dockerfile.defillama) / [Dockerfile.sourcify](packages/sample-sellers/docker/Dockerfile.sourcify). 3개 모두 repo root에서 빌드 (pnpm workspace 해석 필요), multi-stage (node:20-alpine build → alpine runtime). CMD만 바뀌어 세 이미지가 **같은 dist에서 다른 진입점**을 실행.
  - 테스트: [blockscout/handler.test.ts](packages/sample-sellers/src/blockscout/handler.test.ts) 6 / [defillama/handler.test.ts](packages/sample-sellers/src/defillama/handler.test.ts) 3 / [sourcify/handler.test.ts](packages/sample-sellers/src/sourcify/handler.test.ts) 4 / [lib/server.test.ts](packages/sample-sellers/src/lib/server.test.ts) 5. 모두 `fakeFetch` DI로 네트워크 없이 실행. 서버 통합 테스트는 `http.createServer(app)` + 랜덤 포트 + 실제 fetch로 디스패치/에러 매핑 4경로 검증.
  - **18/18 pass**, `tsc --noEmit` 클린. 백엔드 79/79 + MCP 17/17 회귀 없음.
  - README에 curl 예시 + Docker build/run 명령 포함 — 세 이미지는 팀이 각자 호스트에 올려 `POST /api/sellers/register` 로 등록하면 바로 사용 가능.

- **Week 3 Day 3-4: MCP Tool 패키지 (discover / request / status) + `/api/sellers` 백엔드**
  - [packages/backend/src/services/sellers.service.ts](packages/backend/src/services/sellers.service.ts) — pure 페이지네이션 레이어. `SELLERS_DEFAULT_LIMIT=20`, `SELLERS_MAX_LIMIT=100`, `normalizeSellerFilter`가 `activeOnly`를 **기본 true** (마켓플레이스 UX상 미사용 seller 노출 제한이 합리적 기본), limit `Math.floor` + [1,100] 클램프, negative offset 클램프. `listSellers(filter, store)`는 `SellersStore`에 위임 — prisma 런타임 import 없음 → 유닛 테스트 DB 없이 실행.
  - [packages/backend/src/services/sellers-store.ts](packages/backend/src/services/sellers-store.ts) — prisma 기반 `prismaSellersStore`. `whereFrom(filter)`이 `taskType` 필터를 `capabilities: { array_contains: taskType }` JSON 쿼리로 변환 (`Prisma.JsonFilter<"SellerProfile">` 캐스트 필요 — `InputJsonValue`로 캐스트하면 where 필드 할당 오류). `findMany`+`count`를 `Promise.all`로 병렬 실행, `orderBy: updatedAt desc`, Decimal/DateTime을 string 직렬화해서 `SellerView`로 변환.
  - [packages/backend/src/routes/sellers.routes.ts](packages/backend/src/routes/sellers.routes.ts) — `GET /api/sellers`. Zod `safeParse`로 쿼리 검증 (task_type, active_only 'true'/'false' → boolean transform, limit/offset coerce.number). 실패 시 `{400: invalid_query, details: flatten()}`.
  - [packages/backend/src/routes/index.ts](packages/backend/src/routes/index.ts) — `/sellers` 마운트.
  - [packages/backend/src/services/sellers.service.test.ts](packages/backend/src/services/sellers.service.test.ts) — 6 케이스 (activeOnly 기본/명시 false / limit·offset 클램프 / taskType 패스스루 / listSellers가 정규화 필터로 store 호출).
  - [packages/mcp-tool/package.json](packages/mcp-tool/package.json) + [packages/mcp-tool/tsconfig.json](packages/mcp-tool/tsconfig.json) + [packages/mcp-tool/README.md](packages/mcp-tool/README.md) — 신규 워크스페이스 패키지 `@chainlens/mcp-tool`, `bin: chainlens-mcp` 바이너리. `@modelcontextprotocol/sdk` + `viem` + `@chainlens/shared` + `@types/node` 의존.
  - [packages/mcp-tool/src/config.ts](packages/mcp-tool/src/config.ts) — env → `McpConfig`. `CHAINLENS_API_URL` 트레일링 슬래시 제거, `CHAIN_ID` 정수 검증, `WALLET_PRIVATE_KEY` 0x64hex 정규식 검증 (실패 시 fail-fast). `WALLET_PRIVATE_KEY`가 없으면 request 툴 비활성화, discover/status는 여전히 사용 가능.
  - [packages/mcp-tool/src/tools/discover.ts](packages/mcp-tool/src/tools/discover.ts) — `chainlens.discover` pure 핸들러. `URLSearchParams`로 `task_type / limit / offset / active_only` 쿼리 빌드, 필터 없으면 `?` 자체를 붙이지 않음. 백엔드 non-ok는 명시적 `Error` throw.
  - [packages/mcp-tool/src/tools/status.ts](packages/mcp-tool/src/tools/status.ts) — `chainlens.status` pure 핸들러. `job_id` bigint/number/string 모두 수용, decimal 정규식 검증, 404 시 `{found:false}` (예외 아님 — "존재하지 않음"은 정상 응답).
  - [packages/mcp-tool/src/tools/request.ts](packages/mcp-tool/src/tools/request.ts) — `chainlens.request` DI-pure 핸들러. 4단계: (1) USDC approve → (2) `createJob(seller, taskType, amount, inputsHash, apiId)` → (3) receipt의 `JobCreated` 이벤트 `topics[1]` (indexed jobId)에서 jobId 파싱 → (4) `GET /api/evidence/:jobId` 폴링 (deadline 기반 loop, terminal set `{COMPLETED, REFUNDED, FAILED}`). 404는 "아직 미기록"으로 간주하고 계속 폴링. 타임아웃 시 `status: "TIMEOUT"` + 마지막 evidence 반환. `keccak256`/`taskTypeId`/`inputsHash`/`wait`을 모두 DI로 받아 테스트가 viem 없이 실행 가능.
  - [packages/mcp-tool/src/server.ts](packages/mcp-tool/src/server.ts) — `@modelcontextprotocol/sdk` `Server` 인스턴스 조립. `ListToolsRequestSchema` / `CallToolRequestSchema` 핸들러 등록, request 툴은 deps.request 없으면 목록에서 제외 + 호출 시 명시적 에러. 결과는 `content:[{type:"text",text:JSON.stringify(...)}]`로 반환하되 **custom replacer로 BigInt → string** (MCP 클라이언트는 JSON만 이해). 핸들러 내부 throw는 `isError:true` + 메시지로 래핑해 stdio 연결이 끊기지 않도록 격리.
  - [packages/mcp-tool/src/index.ts](packages/mcp-tool/src/index.ts) — 프로덕션 wiring. `chainFor(chainId)`로 baseSepolia/baseMainnet 선택, 미배포 체인에 대해 fail-fast throw, `bytes32FromName = keccak256(utf8(name))`(게이트웨이 인코딩과 일치), `canonicalInputsHash`는 **키 정렬 stable stringify** 후 keccak256 (buyer·gateway inputs hash 불일치 방지). `WALLET_PRIVATE_KEY` 부재 시 request deps 자체를 `undefined`로 넘겨 read-only 모드.
  - 테스트: [config.test.ts](packages/mcp-tool/src/config.test.ts) 5 / [discover.test.ts](packages/mcp-tool/src/tools/discover.test.ts) 4 / [status.test.ts](packages/mcp-tool/src/tools/status.test.ts) 4 / [request.test.ts](packages/mcp-tool/src/tools/request.test.ts) 4. Fake `fetch`가 URL을 기록하고, fake publicClient/walletClient가 writeContract 호출을 기록한 뒤 JobCreated 로그를 합성 → on-chain/RPC 없이 4단계 플로우 전체 검증.
  - **MCP 17/17 pass, 백엔드 79/79 pass, 양쪽 `tsc --noEmit` 클린**. Claude Desktop 예시 config은 README에 포함.
  - 미구현(의도): `@modelcontextprotocol/sdk` peer 경고(valtio/react 19) 및 `zod 4` vs `abitype` peer는 viem 내부 이슈 — 실제 런타임에 영향 없어 보류.

- **Week 3 Day 1-2: Evidence Explorer + Reputation Views + 훅 3종**
  - [packages/frontend/src/hooks/useJob.ts](packages/frontend/src/hooks/useJob.ts) — `GET /api/evidence/:jobId`를 래핑. jobId는 `string | bigint | undefined` 수용 (언마운트/누락 시 로딩만 해제하고 요청은 보내지 않음). `cancelled` 플래그로 리랜더 중 응답 폐기. 프론트엔드 내부 `JobEvidence` 타입은 백엔드 `EvidenceView`와 1:1 (string 직렬화 포함).
  - [packages/frontend/src/hooks/useReputation.ts](packages/frontend/src/hooks/useReputation.ts) — `GET /api/reputation/:sellerAddress`. 동일 패턴(`undefined` 가드 + cancel). BigInt 값은 모두 문자열로 렌더에 넘김.
  - [packages/frontend/src/hooks/useTaskTypes.ts](packages/frontend/src/hooks/useTaskTypes.ts) — 현재 MVP에선 shared의 `INITIAL_TASK_TYPE_NAMES` 정적 리스트만 반환. 주석으로 백엔드 `/api/task-types` 추가 시 확장 경로 명시 (premature abstraction 회피).
  - [packages/frontend/src/app/(app)/evidence/[jobId]/page.tsx](packages/frontend/src/app/(app)/evidence/[jobId]/page.tsx) — Evidence Explorer. Job 상세 + 상태 뱃지 + 해시 섹션에서 **로컬 `keccak256(stringToBytes(JSON.stringify(response)))`와 on-chain `responseHash` 비교 표시** (스펙 "responseHash 검증 UI"). Seller 주소는 reputation 페이지로 연결. 입력/응답 JSON pretty-printed. `inputsHash` / `evidenceURI` / 에러 원인 모두 노출. 재사용 UI는 기존 `StatusBadge` / `LoadingSpinner` / `.card` 스타일 재활용.
  - [packages/frontend/src/app/(app)/reputation/[sellerAddress]/page.tsx](packages/frontend/src/app/(app)/reputation/[sellerAddress]/page.tsx) — Seller Reputation. 0x40 regex로 라우트 파라미터 검증, active/inactive 뱃지, reputationBps → 퍼센트 표시, `jobsCompleted / (completed+failed)` 기반 success rate 계산. 총 earnings는 raw uint256 문자열을 BigInt로 나눠 6 decimals USDC 포맷 (float 오차 회피). 등록 시각은 유닉스 초 → 날짜. capabilities / metadataURI(ipfs:// 자동 게이트웨이 변환) 섹션 포함.
  - marketplace task_type 필터는 의도적으로 미반영: `ApiListing`이 taskType 컬럼/필터를 지원하지 않음 → UI만 추가하면 백엔드와 불일치. 훅은 준비됐고 Week 3 Day 3-4 MCP 단계나 백엔드 필터 확장 시점에 붙일 예정.
  - `tsc --noEmit` 클린 (ES2017 타겟이라 `1_000_000n` 리터럴 대신 `BigInt(1_000_000)` 사용). 백엔드 73/73 회귀 없음.

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
