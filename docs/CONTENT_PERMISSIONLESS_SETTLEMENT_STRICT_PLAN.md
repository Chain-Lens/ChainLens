# 콘텐츠 Permissionless, 정산 Strict 전환 계획

이 문서는 ChainLens v3 호출 경로를 아래 원칙으로 재정렬하기 위한
실행 계획이다.

- 콘텐츠: 가능한 한 릴레이하고 위험은 `warnings[]`로 표시한다.
- 정산: 셀러 호출 전에 결제 성립 가능성을 엄격하게 확인한다.

핵심 목표는 검증 축을 분리하는 것이다.

- 콘텐츠 품질 이슈는 가능한 한 `soft warning`으로 낮춘다.
- 결제 유효성 이슈는 `preflight gate`로 앞당긴다.

관련 현재 정책 문서는 [RELAY_AND_SETTLEMENT_POLICY.md](./RELAY_AND_SETTLEMENT_POLICY.md)를
참고한다. 이 문서는 정책 설명이 아니라 구현 순서와 작업 범위를 정리한 실행 문서다.

## 배경

현재 paid call 흐름은 대략 아래 순서다.

1. 가격 체크
2. 셀러 HTTP 호출
3. 응답 스캔
4. 스키마 검증
5. `settle()` 호출
6. 바이어에게 응답 릴레이

이 구조에서는 결제 실패가 셀러 호출 이후에 발견될 수 있다. 그 결과:

- 셀러가 컴퓨트 비용을 쓴 뒤 정산이 revert될 수 있다.
- 반대로 응답 품질 검사는 너무 엄격해서 의미상 경미한 문제도 `422`로 차단한다.

전환 후 목표 흐름은 아래와 같다.

1. 가격 체크
2. `simulateSettlement()` preflight
3. 셀러 HTTP 호출
4. 응답 스캔 및 스키마 검증
5. warning 수집
6. 실제 `settle()` 호출
7. 바이어에게 응답 릴레이

원칙은 간단하다.

- 결제 불능 요청은 셀러까지 보내지 않는다.
- 셀러 응답은 가능하면 버리지 않고 경고와 함께 전달한다.

## PR 분해

## PR 1. 정산 preflight 뼈대 추가

범위:

- [packages/backend/src/services/settlement.service.ts](/Users/Shared/srv/ChainLens/packages/backend/src/services/settlement.service.ts)
- [packages/backend/src/services/listing-call.service.test.ts](/Users/Shared/srv/ChainLens/packages/backend/src/services/listing-call.service.test.ts)

할 일:

- `SettlementService` 인터페이스에 `simulateSettlement(...)` 추가
- `OnChainSettlementService`에 `publicClient.simulateContract` 기반 구현 추가
- 실패 시 의미 있는 에러를 던지도록 정리
- 테스트용 settlement stub에도 `simulateSettlement` 추가

완료 조건:

- preflight를 독립 호출할 수 있다
- 기존 테스트가 새 인터페이스에 맞게 다시 통과한다

## PR 2. 결제 게이트를 셀러 호출 앞으로 이동

범위:

- [packages/backend/src/services/listing-call.service.ts](/Users/Shared/srv/ChainLens/packages/backend/src/services/listing-call.service.ts)
- [packages/backend/src/services/listing-call.service.test.ts](/Users/Shared/srv/ChainLens/packages/backend/src/services/listing-call.service.test.ts)

할 일:

- 호출 순서를 `price check -> simulateSettlement -> seller call`로 변경
- preflight 실패 시 즉시 종료
- preflight 실패 시 seller client가 호출되지 않도록 보장
- preflight 실패 시 실제 `settle()` write도 호출되지 않도록 보장

완료 조건:

- 결제 불능 요청이 셀러까지 가지 않는다
- 관련 단위 테스트가 추가된다

## PR 3. preflight 실패 결과 타입과 HTTP 매핑 추가

범위:

- [packages/backend/src/services/listing-call.service.ts](/Users/Shared/srv/ChainLens/packages/backend/src/services/listing-call.service.ts)
- [packages/backend/src/routes/market.routes.ts](/Users/Shared/srv/ChainLens/packages/backend/src/routes/market.routes.ts)

할 일:

- `CallResult`에 `payment_preflight_failed` 추가
- 응답 필드에 `detail`과 가능한 진단 정보 포함
- `sendCallResult()`에 새 분기 추가
- 상태 코드는 `412` 또는 `402` 중 하나로 확정

완료 조건:

- preflight 실패와 실제 settle 실패가 API 레벨에서 구분된다

## PR 4. 성공 결과 타입에 warnings/schema 상태 추가

범위:

- [packages/backend/src/services/listing-call.service.ts](/Users/Shared/srv/ChainLens/packages/backend/src/services/listing-call.service.ts)

할 일:

- `OkResult`에 `warnings: string[]` 추가
- 필요하면 `schemaApplicable`를 `schemaValid: boolean | null` 중심으로 정리
- 성공 경로에서도 스캔/스키마 결과를 들고 가도록 변경

완료 조건:

- 성공 결과가 safety 메타데이터를 함께 담는다

## PR 5. scan/schema 실패를 hard reject에서 soft warning으로 전환

범위:

- [packages/backend/src/services/listing-call.service.ts](/Users/Shared/srv/ChainLens/packages/backend/src/services/listing-call.service.ts)
- [packages/backend/src/routes/market.routes.ts](/Users/Shared/srv/ChainLens/packages/backend/src/routes/market.routes.ts)

할 일:

- `scanResponse()` 실패 시 `response_rejected` 대신 warning 추가
- `validateResponseShape()` 실패 시 `response_rejected` 대신 warning 추가
- 성공 응답으로 계속 진행
- 단, truly-unrelayable 케이스는 별도 실패로 유지

완료 조건:

- 콘텐츠 품질 이슈가 자동 차단 사유가 아니게 된다
- 경고는 `warnings[]`로 노출된다

## PR 6. `422 response_rejected` 경로 정리

범위:

- [packages/backend/src/services/listing-call.service.ts](/Users/Shared/srv/ChainLens/packages/backend/src/services/listing-call.service.ts)
- [packages/backend/src/routes/market.routes.ts](/Users/Shared/srv/ChainLens/packages/backend/src/routes/market.routes.ts)

할 일:

- `response_rejected` 타입이 정말 필요한지 재판단
- 필요 없으면 제거
- 필요하면 "전달 자체가 불가능한 경우" 전용으로 축소
- `sendCallResult()`의 `422` 분기를 최소화
- `422`에서 `200 + safety.warnings[]`로 바뀐 의미 차이를 코드 주석과 route contract 설명에 반영
- 소비자가 더 이상 `schema/injection mismatch -> 422`를 기본 가정하지 않도록 계약 문구 정리

완료 조건:

- `422` 의미가 정책과 충돌하지 않게 정리된다
- hard reject와 soft warning의 경계가 문서와 코드에서 같은 뜻으로 읽힌다

## PR 7. 성공 응답의 safety 필드 강화

범위:

- [packages/backend/src/routes/market.routes.ts](/Users/Shared/srv/ChainLens/packages/backend/src/routes/market.routes.ts)
- [packages/backend/src/routes/x402.routes.ts](/Users/Shared/srv/ChainLens/packages/backend/src/routes/x402.routes.ts)
- [packages/mcp-tool/src/tools/call.ts](/Users/Shared/srv/ChainLens/packages/mcp-tool/src/tools/call.ts)
- [packages/frontend/src/types/market.ts](/Users/Shared/srv/ChainLens/packages/frontend/src/types/market.ts)

할 일:

- 성공 응답의 `safety.warnings`에 실제 warning 반영
- `schemaValid`를 실제 결과값으로 반영
- x402 경로와 `/market/call/:listingId` 응답 의미를 맞춤
- 필요하면 응답 문구와 필드 설명을 정리
- MCP tool과 프론트 타입이 `200 + warnings` 의미를 그대로 반영하는지 확인
- `delivery`와 `safety`를 소비하는 클라이언트가 warning을 실패 없이 해석할 수 있도록 응답 계약 설명 보강

완료 조건:

- 클라이언트가 응답 위험도를 기계적으로 해석할 수 있다
- 기존 소비자가 status code만 보고 품질을 판단하던 가정이 제거되거나 명시적으로 보완된다

## PR 8. 로그/메트릭 축 분리

범위:

- [packages/backend/src/services/listing-call.service.ts](/Users/Shared/srv/ChainLens/packages/backend/src/services/listing-call.service.ts)
- 호출 로그 저장 관련 서비스 및 스키마

할 일:

- `errorReason`에 `payment_preflight_failed` 추가
- warning 관련 reason 또는 count 기록
- 가능하면 `schemaValid`, `warningCount` 저장
- 운영에서 결제 실패와 콘텐츠 경고를 따로 볼 수 있게 정리
- `packages/mcp-tool/src/tools/inspect.ts`와 관련 설명에서 warning 기반 해석으로 옮겨야 할 지표가 있는지 점검
- 기존 `response_rejected_schema` / `response_rejected_injection` 중심 설명이 남아 있으면 deprecated 또는 transitional note 추가

완료 조건:

- 셀러 보호 지표와 콘텐츠 품질 지표가 분리된다
- 운영 지표와 사용자-facing inspect 설명이 새 정책과 충돌하지 않는다

## PR 9. 테스트 정리

범위:

- [packages/backend/src/services/listing-call.service.test.ts](/Users/Shared/srv/ChainLens/packages/backend/src/services/listing-call.service.test.ts)
- 필요 시 route 테스트 파일
- 필요 시 MCP tool / 프론트 소비 타입 테스트

할 일:

- preflight 실패 시 seller 미호출 테스트
- warning만 있는 성공 응답 테스트
- seller non-2xx 유지 테스트
- 실제 settle write 실패 유지 테스트
- success + warnings 로깅 테스트
- `payment_preflight_failed -> 412` route 매핑 테스트
- `schema/injection warning -> 200 ok + warnings[]` 소비자 계약 테스트

완료 조건:

- 새 정책이 테스트 이름과 시나리오에서 드러난다
- status-code semantics와 response-body semantics가 함께 고정된다

## PR 10. 문서와 운영 가이드 업데이트

범위:

- `docs/` 문서 전반

할 일:

- 현재 순서와 변경 후 순서 문서화
- "콘텐츠는 permissionless, 정산은 strict" 원칙 명시
- `warnings[]` 의미 정의
- preflight 실패와 settle 실패의 차이 설명
- `422 response_rejected` 중심으로 적힌 문서와 예제를 `200 + warnings[]` 정책에 맞게 업데이트
- 프론트/문서 예제에서 `schema mismatch`와 `injection warning`이 이제 hard failure가 아닐 수 있음을 명시
- buyer-facing 문서, MCP/tooling 설명, 운영 문서에서 "기존 등록 API는 대체로 호환되지만 소비자 해석은 바뀔 수 있음"을 migration note로 추가
- `packages/frontend/src/lib/docs-constants.ts` 및 관련 docs 화면 문구가 새 응답 의미를 반영하는지 점검

완료 조건:

- 팀원이 코드를 읽지 않아도 정책과 의도를 이해할 수 있다
- 기존 클라이언트/문서 독자가 status-code 변화와 warning 모델 전환을 오해하지 않는다

## 권장 병합 순서

1. PR 1
2. PR 2
3. PR 3
4. PR 4
5. PR 5
6. PR 6
7. PR 7
8. PR 8
9. PR 9
10. PR 10

## 최종 기대 상태

전환이 끝나면 아래 상태를 만족해야 한다.

- 결제 불능 요청은 셀러까지 가지 않는다
- 셀러 응답이 다소 거칠어도 릴레이는 유지된다
- 위험 정보는 `warnings[]`로 명시된다
- 셀러 보호와 permissionless delivery가 동시에 성립한다

## 메모

- 이 문서는 구현 작업 분해용이다.
- 상태 코드 선택은 `412`와 `402` 중 하나로 조기에 통일하는 편이 좋다.
- `x402.routes.ts`의 EIP-712 챌린지 포맷은 그대로 두되, paid path의 실행 순서를 바꾸는 것이 이번 전환의 핵심이다.
