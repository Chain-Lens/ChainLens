# API Market — Agent 사용 가이드

> Base Sepolia 위에서 동작하는 Agent API Marketplace.  
> 에이전트는 `/execute` 엔드포인트 하나로 결제 → 실행 → 결과 수신을 완료할 수 있습니다.

**Base URL:** `https://monapi.pelicanlab.dev/api`  
**Contract:** `0x05A1954a82Fd976Fd1B010EE82a23aeE22A31913`  
**Chain:** Base Sepolia (chainId: `84532`, RPC: `https://sepolia.base.org`)

---

## 에이전트 준비물

| 항목               | 설명                                                         |
| ------------------ | ------------------------------------------------------------ |
| 에이전트 전용 지갑 | 자산 보관 지갑과 **별도** 생성 권장. 소액 testnet ETH만 충전 |
| 컨트랙트 주소      | `0x05A1954a82Fd976Fd1B010EE82a23aeE22A31913`                 |
| 백엔드 URL         | `https://monapi.pelicanlab.dev/api`                          |

> faucet: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet

---

## 에이전트 플로우 (권장)

```
1. GET /execute/{apiId}
   ← 402 + 결제 정보 (amount, contractAddress, onChainApiId, seller)

2. 에이전트가 컨트랙트 pay() 직접 호출
   → txHash 획득

3. GET /execute/{apiId}  +  X-Payment-Tx: {txHash}
   ← 200 + API 결과
```

---

## Step 1. 결제 정보 요청

```bash
curl https://monapi.pelicanlab.dev/api/execute/{apiId}
```

**응답 402 — Payment Required**

```json
{
  "error": "Payment Required",
  "x402": {
    "amount": "1000000000000000",
    "amountEth": "0.001000",
    "contractAddress": "0x05A1954a82Fd976Fd1B010EE82a23aeE22A31913",
    "onChainApiId": 3,
    "seller": "0xSellerAddress...",
    "chainId": 84532,
    "payFunction": "pay(uint256 apiId, address seller) payable",
    "instructions": [
      "1. Call pay(onChainApiId, seller) on the contract with msg.value = amount (wei)",
      "2. Retry this request with header: X-Payment-Tx: <txHash>"
    ]
  }
}
```

---

## Step 2. 온체인 결제 (viem 예시)

```typescript
import { createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineChain } from "viem";

const baseSepolia = defineChain({
  id: 84532,
  name: "Base Sepolia",
  rpcUrls: { default: { http: ["https://sepolia.base.org"] } },
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
});

const account = privateKeyToAccount("0xYOUR_AGENT_PRIVATE_KEY");
const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(),
});

const abi = parseAbi(["function pay(uint256 apiId, address seller) payable"]);

const txHash = await walletClient.writeContract({
  address: "0x05A1954a82Fd976Fd1B010EE82a23aeE22A31913",
  abi,
  functionName: "pay",
  args: [BigInt(onChainApiId), seller],
  value: BigInt(amount), // wei 단위
});
```

---

## Step 3. 결과 요청

```bash
curl https://monapi.pelicanlab.dev/api/execute/{apiId} \
  -H "X-Payment-Tx: 0x트랜잭션해시"
```

**파라미터를 seller API에 전달하려면 POST 사용:**

```bash
curl -X POST https://monapi.pelicanlab.dev/api/execute/{apiId} \
  -H "X-Payment-Tx: 0x트랜잭션해시" \
  -H "Content-Type: application/json" \
  -d '{"query": "bitcoin price", "currency": "USD"}'
```

**응답 200 — 성공**

```json
{
  "requestId": "uuid",
  "status": "success",
  "result": {
    /* seller API 응답 원본 */
  },
  "settlementTxHash": "0x정산트랜잭션"
}
```

**응답 200 — seller API 실패 (자동 환불됨)**

```json
{
  "requestId": "uuid",
  "status": "refunded",
  "error": "Seller API returned 404",
  "settlementTxHash": "0x환불트랜잭션"
}
```

**검증 항목 (백엔드)**

- tx가 Base에 실제로 존재하고 성공했는지
- `PaymentReceived` 이벤트의 `apiId`와 `seller`가 요청한 API와 일치하는지
- 결제 금액이 API price 이상인지
- 동일 txHash 재사용(replay attack) 여부

---

## 전체 예시 코드 (TypeScript)

```typescript
import { createWalletClient, createPublicClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineChain } from "viem";

const baseSepolia = defineChain({
  id: 84532,
  name: "Base Sepolia",
  rpcUrls: { default: { http: ["https://sepolia.base.org"] } },
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
});

const BASE_URL = "https://monapi.pelicanlab.dev/api";
const CONTRACT = "0x05A1954a82Fd976Fd1B010EE82a23aeE22A31913";
const PAY_ABI = parseAbi(["function pay(uint256 apiId, address seller) payable"]);

async function callAPIMarket(apiId: string, agentPrivateKey: `0x${string}`, payload?: object) {
  const account = privateKeyToAccount(agentPrivateKey);
  const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http() });
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });

  // 1. 결제 정보 요청
  const infoRes = await fetch(`${BASE_URL}/execute/${apiId}`);
  const info = await infoRes.json();
  if (infoRes.status !== 402) throw new Error("Expected 402");

  const { amount, onChainApiId, seller } = info.x402;

  // 2. 온체인 결제
  const txHash = await walletClient.writeContract({
    address: CONTRACT,
    abi: PAY_ABI,
    functionName: "pay",
    args: [BigInt(onChainApiId), seller],
    value: BigInt(amount),
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });

  // 3. 결과 요청
  const resultRes = await fetch(`${BASE_URL}/execute/${apiId}`, {
    method: payload ? "POST" : "GET",
    headers: {
      "X-Payment-Tx": txHash,
      ...(payload ? { "Content-Type": "application/json" } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });

  return resultRes.json();
}

// 사용 예시
const result = await callAPIMarket(
  "api-uuid-here",
  "0xYOUR_AGENT_PRIVATE_KEY",
  { query: "ETH price" }, // seller API에 전달할 파라미터 (선택)
);

console.log(result.result);
```

---

## API 목록 조회

```bash
# 전체 목록
curl https://monapi.pelicanlab.dev/api/apis

# 카테고리 필터
curl "https://monapi.pelicanlab.dev/api/apis?category=finance"

# 검색
curl "https://monapi.pelicanlab.dev/api/apis?search=price"
```

**응답**

```json
[
  {
    "id": "uuid",
    "name": "API 이름",
    "description": "설명",
    "price": "1000000000000000",
    "category": "finance",
    "sellerAddress": "0x...",
    "onChainId": 3,
    "exampleRequest": {},
    "exampleResponse": {}
  }
]
```

> `price`는 wei 단위 (1 ETH = 10¹⁸ wei)

---

## 기존 플로우 (브라우저/수동)

브라우저 UI에서 사용하는 플로우입니다. 에이전트에게는 위의 `/execute` 플로우를 권장합니다.

```
POST /payments/prepare  →  requestId 획득
온체인 pay() 호출       →  이벤트 자동 감지
GET /payments/requests/{requestId}  →  결과 폴링
```

---

## 헬스체크

```bash
curl https://monapi.pelicanlab.dev/api/health
```
