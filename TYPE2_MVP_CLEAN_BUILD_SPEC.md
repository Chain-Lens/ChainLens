# ChainLens Type 2 MVP — Evolve from v1 (d1be20b)

> 기존 v1 (ApiMarketEscrow 기반 API 마켓플레이스)를 Type 2 MVP로 진화시키는 명세. 깨끗한 재빌드 아니라 **확장**. 기존 코드 최대 재사용.

**작성일**: 2026-04-19  
**기준 커밋**: d1be20b (origin/main)  
**전략**: Evolve (기존 컨트랙트·백엔드·프론트 확장) — 3~4주  
**목표**: Type 2 (Web2 Data Relay) MVP 완성 + ERC-8183/8004 호환 레이어

---

## 1. 현 v1 상태와 Gap

### v1이 이미 가진 것

**컨트랙트 (`ApiMarketEscrow.sol`)**:
- [x] USDC 에스크로 (pay/complete/refund/claim)
- [x] API 승인 시스템 (approveApi)
- [x] Gateway 권한 분리 (complete/refund는 gateway만)
- [x] 수수료 5% (platform fee)
- [x] 이벤트 시스템 (PaymentReceived, PaymentCompleted, PaymentRefunded)
- [x] Base Sepolia 배포 완료

**백엔드**:
- [x] x402 프로토콜 구현 (`/execute/{apiId}`)
- [x] Gateway 프록시 (seller API 호출 + 응답 검증)
- [x] Payment 검증 (X-Payment-Tx 헤더)
- [x] Admin 승인 플로우
- [x] Event listener
- [x] Prisma + PostgreSQL
- [x] Routes: admin, api, auth, execute, payment, x402

**프론트엔드**:
- [x] Next.js 15 + RainbowKit + wagmi
- [x] 페이지: admin, apis, marketplace, register, seller, requests
- [x] 훅 10개 (useApiDetail/usePayment/useClaim 등)

### Type 2 MVP 달성까지의 Gap

**필요 확장**:
- [ ] API 개념 → Job 개념 진화 (taskType, responseHash, evidenceURI)
- [ ] SellerRegistry 컨트랙트 (ERC-8004 호환 reputation)
- [ ] TaskTypeRegistry 컨트랙트 (task_type별 schema·정책)
- [ ] Schema validator 서비스 (JSON schema 강제)
- [ ] Injection filter 서비스 (OWASP LLM Top 10 패턴)
- [ ] Seller 자동 API 테스트 서비스 (등록 시)
- [ ] Reputation tracking 서비스
- [ ] IPFS Evidence 저장 (선택, Phase 1엔 DB)
- [ ] MCP tool 패키지
- [ ] Evidence Explorer 프론트 페이지
- [ ] Reputation 뷰 프론트 페이지

**재사용 가능 (그대로 유지)**:
- [x] x402 프로토콜 흐름
- [x] Gateway proxy 구조
- [x] Admin approval 플로우
- [x] USDC 에스크로 메커니즘
- [x] 모든 프론트엔드 페이지 (일부만 수정)

---

## 2. 전체 아키텍처 (확장 후)

```
┌─────────────────────────────────────────────────────┐
│ Client (Buyer Agent)                                │
│ - MCP 또는 직접 API 호출                             │
│ - x402 Payment-Tx 헤더                              │
└──────────────────┬──────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────┐
│ ChainLens Platform (Phase 1 중앙)                    │
│ ┌─────────────────────────────────────────────────┐ │
│ │ API Gateway (기존)                              │ │
│ │ + Schema Validator (신규)                       │ │
│ │ + Injection Filter (신규)                       │ │
│ │ + Reputation Updater (신규)                     │ │
│ └──────────┬──────────────────────┬───────────────┘ │
│            ↓                      ↓                 │
│ ┌──────────────────┐    ┌─────────────────────────┐│
│ │ Seller Service   │    │ Payment Service (기존)  ││
│ │ + Auto Tester    │    │ (ApiMarketEscrow 호출)  ││
│ │ (신규)           │    └─────────────────────────┘│
│ └──────────────────┘                                │
└──────────────────┬──────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────┐
│ Smart Contracts                                     │
│ - ApiMarketEscrow (evolved → Job 개념 포함)          │
│ - SellerRegistry (신규, ERC-8004)                    │
│ - TaskTypeRegistry (신규)                            │
└─────────────────────────────────────────────────────┘
```

---

## 3. 컨트랙트 변경

### 3.1 `ApiMarketEscrow.sol` Evolve (기존 컨트랙트 확장)

**전략**: 새 배포 아니고 기존 컨트랙트에 **필드·함수 추가**. 단, storage layout 변경은 upgradeable proxy 없으면 불가능 — **현재 v1은 non-upgradeable** 이므로 **새 버전 배포**가 필요.

실용적 해법:
- **v1 컨트랙트 유지** (legacy, 기존 사용자)
- **v2 컨트랙트 새 배포** (확장 필드 포함)
- 백엔드가 두 컨트랙트 다 지원 (과도기)
- 프론트엔드는 v2로 전환

**v2 변경사항** (`ApiMarketEscrow.sol` 유지하되 필드 추가):

```solidity
// 기존 Payment 구조체 확장
struct Payment {
    // 기존
    address buyer;
    address seller;
    uint256 apiId;
    uint256 amount;
    PaymentStatus status;
    uint256 timestamp;
    
    // v2 추가
    bytes32 taskType;         // 등록된 task_type (빈 값이면 legacy API 호환)
    bytes32 inputsHash;       // keccak256(요청 파라미터)
    bytes32 responseHash;     // Gateway가 complete 시 기록
    string evidenceURI;       // IPFS 또는 Platform URL
}

// 기존 함수 시그니처 변경 (v2)
function pay(
    uint256 apiId,
    address seller,
    uint256 amount,
    bytes32 taskType,         // v2 신규 파라미터
    bytes32 inputsHash        // v2 신규 파라미터
) external returns (uint256 paymentId);

// 기존 complete 확장
function complete(
    uint256 paymentId,
    bytes32 responseHash,     // v2 신규
    string calldata evidenceURI // v2 신규
) external onlyGateway;

// 신규 view: Job 조회 (ERC-8183 스타일)
function getJob(uint256 paymentId) external view returns (Payment memory);
```

**하위 호환**:
- `taskType = bytes32(0)`인 경우 legacy API call 취급
- 기존 v1 클라이언트가 `bytes32(0)` 넘기면 v1과 동일하게 작동
- Gateway가 complete 시 responseHash/evidenceURI는 Optional (빈 값 허용)

**ERC-8183 호환 함수 (alias)**:

```solidity
// ERC-8183 인터페이스 호환 이름 제공 (기능은 기존 pay/complete와 동일)
function createJob(address seller, bytes32 taskType, uint256 amount, bytes32 inputsHash, uint256 apiId) 
    external returns (uint256 jobId) {
    return pay(apiId, seller, amount, taskType, inputsHash);
}

function submit(uint256 jobId, bytes32 responseHash, string calldata evidenceURI) external onlyGateway {
    // complete의 alias
    _complete(jobId, responseHash, evidenceURI);
}
```

**이벤트 추가**:

```solidity
event JobCreated(uint256 indexed paymentId, address indexed buyer, address indexed seller, bytes32 taskType);
event JobSubmitted(uint256 indexed paymentId, bytes32 responseHash, string evidenceURI);
// 기존 PaymentReceived/Completed/Refunded는 유지
```

### 3.2 `SellerRegistry.sol` (신규, ERC-8004 호환)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable2Step.sol";

contract SellerRegistry is Ownable2Step {
    struct Seller {
        address sellerAddress;
        string name;
        bytes32[] capabilities;    // task_type IDs
        string metadataURI;        // IPFS: 상세 정보
        uint64 registeredAt;
        bool active;
    }
    
    address public gateway;        // platform backend address
    
    mapping(address => Seller) public sellers;
    mapping(bytes32 => address[]) public sellersByCapability;
    mapping(address => uint256) public jobsCompleted;
    mapping(address => uint256) public jobsFailed;
    mapping(address => uint256) public totalEarnings;
    
    event SellerRegistered(address indexed seller, string name, bytes32[] capabilities);
    event SellerUpdated(address indexed seller);
    event SellerDeactivated(address indexed seller);
    event JobResultRecorded(address indexed seller, bool success, uint256 amount);
    
    modifier onlyGateway() {
        require(msg.sender == gateway, "only gateway");
        _;
    }
    
    constructor(address _gateway) Ownable(msg.sender) {
        gateway = _gateway;
    }
    
    function setGateway(address _gateway) external onlyOwner {
        gateway = _gateway;
    }
    
    // Gateway가 테스트 통과 후 호출
    function registerSeller(
        address seller,
        string calldata name,
        bytes32[] calldata capabilities,
        string calldata metadataURI
    ) external onlyGateway {
        require(!sellers[seller].active, "already registered");
        sellers[seller] = Seller({
            sellerAddress: seller,
            name: name,
            capabilities: capabilities,
            metadataURI: metadataURI,
            registeredAt: uint64(block.timestamp),
            active: true
        });
        for (uint i = 0; i < capabilities.length; i++) {
            sellersByCapability[capabilities[i]].push(seller);
        }
        emit SellerRegistered(seller, name, capabilities);
    }
    
    function deactivate(address seller) external {
        require(msg.sender == seller || msg.sender == gateway || msg.sender == owner(), "unauthorized");
        sellers[seller].active = false;
        emit SellerDeactivated(seller);
    }
    
    // Gateway가 Job 완료 시 호출
    function recordJobResult(
        address seller,
        bool success,
        uint256 amount
    ) external onlyGateway {
        if (success) {
            jobsCompleted[seller]++;
            totalEarnings[seller] += amount;
        } else {
            jobsFailed[seller]++;
        }
        emit JobResultRecorded(seller, success, amount);
    }
    
    // Reputation = successful / total (basis points)
    function getReputation(address seller) external view returns (uint256) {
        uint256 completed = jobsCompleted[seller];
        uint256 failed = jobsFailed[seller];
        uint256 total = completed + failed;
        if (total == 0) return 5000; // neutral 50%
        return (completed * 10000) / total;
    }
    
    function getSellersByCapability(bytes32 capability) external view returns (address[] memory) {
        return sellersByCapability[capability];
    }
    
    function getSellerInfo(address seller) external view returns (Seller memory) {
        return sellers[seller];
    }
}
```

### 3.3 `TaskTypeRegistry.sol` (신규, 간단 버전)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable2Step.sol";

contract TaskTypeRegistry is Ownable2Step {
    struct TaskTypeConfig {
        string name;                  // "blockscout_contract_source"
        string schemaURI;             // IPFS: JSON schema
        uint64 maxResponseTime;       // seconds
        uint256 minBudget;            // USDC (6 decimals)
        bool enabled;
        uint64 registeredAt;
    }
    
    mapping(bytes32 => TaskTypeConfig) public taskTypes;
    bytes32[] public allTaskTypes;
    
    event TaskTypeRegistered(bytes32 indexed taskType, string name);
    event TaskTypeUpdated(bytes32 indexed taskType);
    event TaskTypeDisabled(bytes32 indexed taskType);
    
    constructor() Ownable(msg.sender) {}
    
    function registerTaskType(
        bytes32 taskType,
        string calldata name,
        string calldata schemaURI,
        uint64 maxResponseTime,
        uint256 minBudget
    ) external onlyOwner {
        require(taskTypes[taskType].registeredAt == 0, "already registered");
        require(bytes(name).length > 0, "empty name");
        require(maxResponseTime > 0 && maxResponseTime <= 600, "invalid time");
        
        taskTypes[taskType] = TaskTypeConfig({
            name: name,
            schemaURI: schemaURI,
            maxResponseTime: maxResponseTime,
            minBudget: minBudget,
            enabled: true,
            registeredAt: uint64(block.timestamp)
        });
        allTaskTypes.push(taskType);
        
        emit TaskTypeRegistered(taskType, name);
    }
    
    function updateConfig(
        bytes32 taskType,
        string calldata schemaURI,
        uint64 maxResponseTime,
        uint256 minBudget
    ) external onlyOwner {
        require(taskTypes[taskType].registeredAt > 0, "not found");
        taskTypes[taskType].schemaURI = schemaURI;
        taskTypes[taskType].maxResponseTime = maxResponseTime;
        taskTypes[taskType].minBudget = minBudget;
        emit TaskTypeUpdated(taskType);
    }
    
    function setEnabled(bytes32 taskType, bool enabled) external onlyOwner {
        require(taskTypes[taskType].registeredAt > 0, "not found");
        taskTypes[taskType].enabled = enabled;
        if (!enabled) emit TaskTypeDisabled(taskType);
    }
    
    function isEnabled(bytes32 taskType) external view returns (bool) {
        return taskTypes[taskType].enabled;
    }
    
    function getAllTaskTypes() external view returns (bytes32[] memory) {
        return allTaskTypes;
    }
}
```

---

## 4. 백엔드 확장

### 4.1 기존 구조 활용

기존 Routes·Services는 대부분 **그대로 재사용**. 확장 포인트:

**기존 재사용**:
- `routes/execute.ts` — x402 메인 엔드포인트 (약간 확장)
- `routes/admin.ts` — admin approval (SellerRegistry 연동 추가)
- `routes/payment.ts` — 결제 검증 (taskType 체크 추가)
- `services/gateway.ts` — proxy caller (schema validation 추가)
- `services/event-listener.ts` — event handling (신규 이벤트 구독 추가)

### 4.2 신규 서비스

**`services/schema-validator.ts`**:

```typescript
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({ strict: true, allErrors: true });
addFormats(ajv);

const schemaCache = new Map<string, any>();

export async function validateAgainstSchema(
  data: unknown,
  schemaURI: string
): Promise<{ valid: boolean; errors?: string[] }> {
  let schema = schemaCache.get(schemaURI);
  if (!schema) {
    schema = await fetchSchema(schemaURI);
    schemaCache.set(schemaURI, schema);
  }
  
  const validate = ajv.compile(schema);
  const valid = validate(data);
  
  return {
    valid,
    errors: valid ? undefined : validate.errors?.map(e => `${e.instancePath}: ${e.message}`),
  };
}

async function fetchSchema(uri: string): Promise<object> {
  if (uri.startsWith('ipfs://')) {
    const cid = uri.replace('ipfs://', '');
    const response = await fetch(`https://ipfs.io/ipfs/${cid}`);
    return response.json();
  }
  // local 파일 또는 HTTPS URL 지원
  const response = await fetch(uri);
  return response.json();
}
```

**`services/injection-filter.ts`**:

```typescript
// OWASP LLM Top 10 기반 패턴
const INJECTION_PATTERNS: RegExp[] = [
  /\[SYSTEM:\s/i,
  /<\|im_start\|>/,
  /<\|im_end\|>/,
  /\[INST\]/i,
  /\[\/INST\]/i,
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /disregard\s+(all\s+)?(above|previous)/i,
  /forget\s+(all\s+)?(above|previous)/i,
  /you\s+are\s+now\s+[a-z]/i,
  /act\s+as\s+(a\s+)?(different|new)/i,
  /\n\nSystem:\s/,
  /\n\nAssistant:\s/,
  /\n\nHuman:\s/,
];

export function containsInjection(text: string): { found: boolean; pattern?: string } {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      return { found: true, pattern: pattern.source };
    }
  }
  return { found: false };
}

export function scanResponse(data: unknown): { clean: boolean; reason?: string } {
  const serialized = JSON.stringify(data);
  
  // 크기 체크
  if (serialized.length > 1_000_000) {
    return { clean: false, reason: 'response_too_large' };
  }
  
  // 인젝션 패턴
  const injection = containsInjection(serialized);
  if (injection.found) {
    return { clean: false, reason: `injection_pattern: ${injection.pattern}` };
  }
  
  return { clean: true };
}
```

**`services/seller-tester.ts`**:

```typescript
import { validateAgainstSchema } from './schema-validator';
import { scanResponse } from './injection-filter';
import { getTaskTypeConfig } from './task-type';

interface TestInput {
  sellerAddress: string;
  endpointUrl: string;
  capabilities: string[];
}

interface TestResult {
  passed: boolean;
  capabilityResults: Array<{
    capability: string;
    passed: boolean;
    responseTimeMs?: number;
    statusCode?: number;
    schemaValid?: boolean;
    injectionFree?: boolean;
    error?: string;
  }>;
}

export async function testSeller(input: TestInput): Promise<TestResult> {
  const results = [];
  
  for (const capability of input.capabilities) {
    const config = await getTaskTypeConfig(capability);
    if (!config) {
      results.push({ capability, passed: false, error: 'unknown_task_type' });
      continue;
    }
    
    const testPayload = getTestPayload(capability);
    
    try {
      const start = Date.now();
      const response = await fetch(input.endpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_type: capability, inputs: testPayload }),
        signal: AbortSignal.timeout(config.maxResponseTime * 1000),
      });
      const elapsed = Date.now() - start;
      
      if (!response.ok) {
        results.push({
          capability,
          passed: false,
          statusCode: response.status,
          responseTimeMs: elapsed,
          error: `HTTP ${response.status}`,
        });
        continue;
      }
      
      const data = await response.json();
      
      const schemaResult = await validateAgainstSchema(data, config.schemaURI);
      const scanResult = scanResponse(data);
      
      results.push({
        capability,
        passed: schemaResult.valid && scanResult.clean,
        statusCode: response.status,
        responseTimeMs: elapsed,
        schemaValid: schemaResult.valid,
        injectionFree: scanResult.clean,
        error: !schemaResult.valid 
          ? `schema_invalid: ${schemaResult.errors?.join(', ')}`
          : !scanResult.clean ? scanResult.reason : undefined,
      });
    } catch (error) {
      results.push({
        capability,
        passed: false,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
  
  return {
    passed: results.every(r => r.passed),
    capabilityResults: results,
  };
}

function getTestPayload(capability: string): object {
  // task_type별 테스트 페이로드
  const payloads: Record<string, object> = {
    'blockscout_contract_source': {
      contract_address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
      chain_id: 1,
    },
    'defillama_tvl': {
      protocol: 'uniswap',
    },
    // ... 다른 task_types
  };
  return payloads[capability] || {};
}
```

### 4.3 기존 Gateway 확장

**`services/gateway.ts`** 수정 포인트:

```typescript
// 기존 proxy 호출 로직에 추가
async function handleApiCall(payment: Payment) {
  // ... 기존 seller API 호출 ...
  
  // 신규: task_type이 설정된 경우 schema validation
  if (payment.taskType && payment.taskType !== ethers.ZeroHash) {
    const config = await getTaskTypeConfig(payment.taskType);
    
    const schemaResult = await validateAgainstSchema(response, config.schemaURI);
    if (!schemaResult.valid) {
      // 실패 → refund
      await contract.refund(payment.paymentId);
      await sellerRegistry.recordJobResult(payment.seller, false, 0);
      return { error: 'schema_invalid', details: schemaResult.errors };
    }
    
    const scanResult = scanResponse(response);
    if (!scanResult.clean) {
      await contract.refund(payment.paymentId);
      await sellerRegistry.recordJobResult(payment.seller, false, 0);
      return { error: 'injection_detected', details: scanResult.reason };
    }
  }
  
  // 신규: responseHash + evidenceURI 계산
  const responseHash = keccak256(JSON.stringify(response));
  const evidenceURI = await uploadEvidence(response); // IPFS 또는 DB
  
  // 기존 complete 호출 확장 (v2 서명)
  await contract.complete(payment.paymentId, responseHash, evidenceURI);
  
  // 신규: reputation 업데이트
  await sellerRegistry.recordJobResult(payment.seller, true, payment.amount);
  
  return response;
}
```

### 4.4 Prisma 스키마 확장

기존 `prisma/schema.prisma`에 추가:

```prisma
model Job {
  id               Int       @id @default(autoincrement())
  onchainPaymentId BigInt    @unique
  buyer            String
  seller           String
  apiId            BigInt
  taskType         String?
  amount           Decimal   @db.Decimal(18, 6)
  inputs           Json?
  inputsHash       String
  response         Json?
  responseHash     String?
  evidenceURI      String?
  status           JobStatus
  errorReason      String?
  createdAt        DateTime  @default(now())
  completedAt      DateTime?
  
  @@index([buyer])
  @@index([seller])
  @@index([taskType])
  @@index([status])
}

enum JobStatus {
  PENDING
  PAID
  COMPLETED
  REFUNDED
  FAILED
}

model SellerProfile {
  id              Int      @id @default(autoincrement())
  sellerAddress   String   @unique
  name            String
  endpointUrl     String
  capabilities    Json     // string[]
  pricePerCall    Decimal  @db.Decimal(18, 6)
  metadataURI     String?
  status          String   // pending/active/suspended/rejected
  testResult      Json?
  jobsCompleted   Int      @default(0)
  jobsFailed      Int      @default(0)
  totalEarnings   Decimal  @default(0) @db.Decimal(18, 6)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  @@index([status])
}

model ApiTestResult {
  id              Int      @id @default(autoincrement())
  sellerAddress   String
  capability      String
  testInput       Json
  testOutput      Json?
  responseTimeMs  Int?
  schemaValid     Boolean?
  injectionFree   Boolean?
  statusCode      Int?
  errorMessage    String?
  testedAt        DateTime @default(now())
  
  @@index([sellerAddress])
}
```

---

## 5. 프론트엔드 확장

### 5.1 기존 페이지 수정

**`/marketplace`**:
- taskType 필터 추가
- Seller 평판 표시 (별점 or 퍼센트)
- 응답 시간 표시

**`/register` (Seller 등록)**:
- capabilities 다중 선택 UI
- 등록 후 "API 테스트 중..." 상태 표시
- 테스트 결과 상세 표시

**`/requests` (Buyer 히스토리)**:
- Evidence Explorer 링크
- responseHash 검증 버튼

**`/seller` (Seller 대시보드)**:
- reputation 표시
- jobsCompleted/jobsFailed 차트
- 최근 실패 이유 로그

### 5.2 신규 페이지

**`/evidence/[jobId]`** (Evidence Explorer):
- Job 상세 (buyer, seller, taskType, amount)
- 요청 inputs
- 응답 데이터 (pretty-printed JSON)
- responseHash 검증 UI (on-chain hash와 비교)
- 이벤트 로그 (JobCreated → JobSubmitted → JobCompleted)
- 공유 링크 생성

**`/reputation/[sellerAddress]`** (Seller Reputation):
- 누적 Job 통계
- 성공률 차트
- task_type별 성능
- 최근 Job 리스트

### 5.3 신규 훅

```typescript
// packages/frontend/src/hooks/useJob.ts
export function useJob(jobId: bigint) {
  // on-chain getJob + off-chain DB 조회
}

// packages/frontend/src/hooks/useReputation.ts
export function useReputation(sellerAddress: `0x${string}`) {
  // SellerRegistry.getReputation 호출
}

// packages/frontend/src/hooks/useTaskTypes.ts
export function useTaskTypes() {
  // TaskTypeRegistry.getAllTaskTypes 조회
}
```

---

## 6. MCP Tool 패키지 (신규)

### 6.1 파일 구조

```
packages/mcp-tool/
├── src/
│   ├── index.ts
│   ├── tools/
│   │   ├── discover.ts
│   │   ├── request.ts
│   │   └── status.ts
│   └── config.ts
├── package.json
└── README.md
```

### 6.2 3개 도구

```typescript
// packages/mcp-tool/src/tools/discover.ts
export const discoverTool = {
  name: 'chain-lens.discover',
  description: 'Find sellers for a task type',
  inputSchema: {
    type: 'object',
    properties: {
      task_type: { type: 'string' },
      max_price: { type: 'string' },
    },
    required: ['task_type'],
  },
  async handler(input: any) {
    const response = await fetch(`${BASE_URL}/api/sellers?task_type=${input.task_type}`);
    return response.json();
  },
};

// packages/mcp-tool/src/tools/request.ts
export const requestTool = {
  name: 'chain-lens.request',
  description: 'Request data through ChainLens (requires wallet)',
  inputSchema: {
    type: 'object',
    properties: {
      seller_address: { type: 'string' },
      task_type: { type: 'string' },
      inputs: { type: 'object' },
      max_budget: { type: 'string' },
    },
    required: ['seller_address', 'task_type', 'inputs', 'max_budget'],
  },
  async handler(input: any) {
    // 1. approve USDC
    // 2. pay() 호출 (ERC-8183 createJob alias)
    // 3. /execute/{apiId} 호출
    // 4. 결과 반환
    // 사용자 README의 15줄 코드 패턴 그대로
  },
};

// packages/mcp-tool/src/tools/status.ts
export const statusTool = {
  name: 'chain-lens.status',
  description: 'Check job status',
  inputSchema: {
    type: 'object',
    properties: { job_id: { type: 'string' } },
    required: ['job_id'],
  },
  async handler(input: any) {
    const response = await fetch(`${BASE_URL}/api/jobs/${input.job_id}`);
    return response.json();
  },
};
```

### 6.3 Claude Desktop 설정 예시

```json
{
  "mcpServers": {
    "chain-lens": {
      "command": "npx",
      "args": ["@chain-lens/mcp-tool"],
      "env": {
        "CHAIN_LENS_API_URL": "https://monapi.pelicanlab.dev/api",
        "WALLET_PRIVATE_KEY": "..."
      }
    }
  }
}
```

---

## 7. 구현 순서 (3주 스프린트)

### Week 1: 컨트랙트 확장

**Day 1**: TaskTypeRegistry
- [ ] `TaskTypeRegistry.sol` 작성
- [ ] 테스트 15+ 케이스
- [ ] Ignition 모듈 추가
- [ ] Base Sepolia 배포
- [ ] 초기 task_type 5개 등록
- 커밋: `feat: TaskTypeRegistry contract`

**Day 2**: SellerRegistry
- [ ] `SellerRegistry.sol` 작성
- [ ] 테스트 20+ 케이스
- [ ] Ignition 모듈 추가
- [ ] Base Sepolia 배포
- 커밋: `feat: SellerRegistry contract (ERC-8004 compatible)`

**Day 3-4**: ApiMarketEscrow v2
- [ ] 필드 확장 (taskType, inputsHash, responseHash, evidenceURI)
- [ ] ERC-8183 alias 함수 (createJob, submit)
- [ ] 이벤트 추가 (JobCreated, JobSubmitted)
- [ ] 하위 호환 보장 (v1 클라이언트 작동)
- [ ] 테스트 확장 (기존 457줄 + 새 케이스)
- [ ] Base Sepolia 배포
- [ ] 기존 배포본은 legacy로 유지
- 커밋: `feat: ApiMarketEscrow v2 with Job concept`

**Day 5**: ABI 및 shared types 업데이트
- [ ] `packages/shared/src/abi/` 업데이트
- [ ] Job, Seller, TaskType 타입 추가
- [ ] 컨트랙트 주소 상수 업데이트
- 커밋: `feat: shared types for v2 + new registries`

### Week 2: 백엔드 확장

**Day 1**: Schema Validator + Injection Filter
- [ ] `services/schema-validator.ts` (ajv)
- [ ] `services/injection-filter.ts` (OWASP 패턴)
- [ ] 단위 테스트
- [ ] JSON schema 파일 추가 (task_type 5개)
- 커밋: `feat: schema validator + injection filter services`

**Day 2**: Seller Tester
- [ ] `services/seller-tester.ts`
- [ ] 각 task_type별 test payload
- [ ] `/api/sellers/register` 라우트에서 자동 호출
- [ ] 테스트 결과 DB 저장
- 커밋: `feat: automated seller API testing`

**Day 3**: Gateway 확장
- [ ] `services/gateway.ts`에 validation 통합
- [ ] ApiMarketEscrow v2 complete 호출 (responseHash, evidenceURI)
- [ ] Reputation 업데이트 호출
- [ ] 실패 시 refund 로직 강화
- 커밋: `feat: gateway integration with validation + reputation`

**Day 4**: Evidence 저장
- [ ] Phase 1: DB에 저장 (IPFS는 Phase 2로 연기 가능)
- [ ] evidenceURI 생성 (`${PLATFORM_URL}/evidence/${jobId}`)
- [ ] `/api/evidence/:jobId` 엔드포인트
- 커밋: `feat: evidence storage and retrieval`

**Day 5**: Prisma 마이그레이션 + Reputation 엔드포인트
- [ ] Job, SellerProfile, ApiTestResult 테이블
- [ ] 마이그레이션 실행
- [ ] `/api/reputation/:sellerAddress` 엔드포인트
- [ ] `/api/jobs` 엔드포인트 (필터링)
- 커밋: `feat: db schema + reputation endpoints`

**Day 6-7**: Event listener 확장 + 통합 테스트
- [ ] 신규 이벤트 구독 (JobCreated, JobSubmitted, JobResultRecorded)
- [ ] End-to-end 로컬 테스트 (Seller 등록 → Job 요청 → 정산)
- 커밋: `feat: event listener for v2 contracts`

### Week 3: 프론트엔드 + MCP + 데모

**Day 1-2**: 프론트엔드 수정
- [ ] 기존 페이지 task_type 필터 + reputation 표시
- [ ] `/evidence/[jobId]` 페이지 신규
- [ ] `/reputation/[sellerAddress]` 페이지 신규
- [ ] 훅 3개 추가 (useJob, useReputation, useTaskTypes)
- 커밋: `feat: frontend evidence explorer + reputation views`

**Day 3-4**: MCP Tool 패키지
- [ ] `packages/mcp-tool/` 신규
- [ ] 3개 tool 구현
- [ ] npm publish 준비
- [ ] Claude Desktop 로컬 테스트
- 커밋: `feat: MCP tool package for agent integration`

**Day 5**: Sample Seller 3개
- [ ] Blockscout wrapper (Express 앱)
- [ ] DeFiLlama wrapper
- [ ] Sourcify wrapper
- [ ] Dockerfile 각자
- [ ] 배포 (팀 자체 운영)
- 커밋: `feat: sample seller agents (blockscout, defillama, sourcify)`

**Day 6-7**: 통합·문서·데모
- [ ] README 업데이트 (ChainLens Type 2 Market)
- [ ] 데모 시나리오 작성
- [ ] 영상 또는 Loom 녹화
- [ ] 킥스타트 공개 페이지 초안
- 커밋: `docs: Type 2 MVP documentation + demo scenarios`

---

## 8. 초기 Task Types (5개)

MVP 데모용:

1. **`blockscout_contract_source`** — Verified contract source code
2. **`blockscout_tx_info`** — Transaction details
3. **`defillama_tvl`** — DeFi protocol TVL
4. **`sourcify_verify`** — Contract bytecode verification
5. **`chainlink_price_feed`** — Price oracle read

각 스키마는 `packages/shared/src/schemas/task-types/` 에 JSON 파일로.

---

## 9. 보안 체크리스트

### 컨트랙트
- [x] 기존 ReentrancyGuard 유지
- [x] 기존 SafeERC20 유지
- [ ] SellerRegistry/TaskTypeRegistry Ownable2Step
- [ ] Gateway 권한 수정 가능 (악의적 키 대응)

### 백엔드
- [ ] 기존 지갑 서명 검증 유지
- [ ] Schema validator 모든 응답 검증
- [ ] Injection filter 모든 응답 스캔
- [ ] API key 암호화 저장 (Seller 선택 시)
- [ ] Rate limiting
- [ ] 에러 메시지 최소화

### 프론트엔드
- [x] 기존 RainbowKit 보안 유지
- [ ] Evidence Explorer에서 raw 데이터 표시 시 sanitize
- [ ] XSS 방지 (user-generated content)

---

## 10. Phase 2 경로

### 탈중앙화 (3개월 후)

- Gateway 프록시 제거 옵션
- Seller → Buyer 직접 응답 (IPFS CID)
- Challenge Window 메커니즘 (UMA optimistic)
- 본드 시스템 (sellerBond 추가)

### 컨트랙트 upgrade

- v2 → v3: UMA Challenge Window 추가
- SellerRegistry: 본드 연동
- 기존 v2 legacy로 유지, 새 사용자는 v3

---

## 11. 코딩 에이전트 지침

1. **기존 코드 존중**: v1 작동 중이므로 최소 변경 원칙. 리팩토링은 필요할 때만.
2. **하위 호환 필수**: ApiMarketEscrow v2는 v1 클라이언트 작동 유지.
3. **Week 1부터 순서대로**. 컨트랙트 먼저, 그다음 백엔드, 프론트 마지막.
4. **각 Day 완료 시 커밋 + 테스트**.
5. **스키마·인젝션 체크 타협하지 말 것**.
6. **불확실 시 사용자 확인** (lejuho).

### 각 Day 완료 시 보고

```
## Week N Day M 완료: [작업명]
- 구현: [파일 목록]
- 테스트: N/N passing
- 커밋: [hash] [메시지]
- 배포 (해당 시): [주소]
- 이슈: [있다면]
- 다음: [다음 작업]
```

---

## 12. 환경 변수 추가

기존 `.env`에 추가:

```bash
# v2 Contracts
NEXT_PUBLIC_CONTRACT_ADDRESS_V2=          # ApiMarketEscrow v2
NEXT_PUBLIC_SELLER_REGISTRY_ADDRESS=
NEXT_PUBLIC_TASK_TYPE_REGISTRY_ADDRESS=

# Evidence (Phase 1은 DB, Phase 2에서 IPFS)
EVIDENCE_STORAGE=db                       # db | ipfs
PINATA_JWT=                               # Phase 2
```

---

## 13. 이 명세와 v4 설계의 관계

이 명세는 **v4 설계 (`chain-lens-modified-plan.md`)의 Type 2 부분 Phase 1 구현**.

v4의 다음 요소들은 **Phase 2+로 이관**:
- UMA Challenge Window
- Challenger 메커니즘
- Commit/Reveal 다수결
- 본드 3-층 fallback
- Bond Vault + Aave
- AI Answer Market (Type 1)

v4 문서는 장기 북극성으로 유지. 이 명세는 단기 3주 실행 계획.