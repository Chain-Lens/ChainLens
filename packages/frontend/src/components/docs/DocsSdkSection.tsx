import InlineCode from "./InlineCode";
import DocsCodeBlock from "./DocsCodeBlock";
import { TerminalWindow, Line } from "./DocsTerminal";
import { DOCS_BASE_URL, DOCS_SDK_VERSION } from "@/lib/docs-constants";

const SDK_CONFIG_CODE = `import { ChainLens, ViemWallet } from "@chain-lens/sdk";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const account = privateKeyToAccount(process.env.WALLET_PRIVATE_KEY as \`0x\${string}\`);

const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(process.env.RPC_URL),
});

export const chainlens = new ChainLens({
  wallet: new ViemWallet(walletClient),
  chainId: 84532,
  gatewayUrl: "${DOCS_BASE_URL}",
  budget: {
    perCallMaxUsdc: 2,
    dailyMaxUsdc: 25,
  },
  telemetry: {
    enabled: true,
    upload: false,
  },
});`;

const SDK_CALL_CODE = `import { ChainLensCallError } from "@chain-lens/sdk";
import { chainlens } from "./chainlens";

try {
  const result = await chainlens.call(13, { symbol: "MSFT" });

  console.log(result.data);
  console.log(result.amountUsdc, result.feeUsdc, result.netUsdc);
  console.log(result.settlement.txHash);
} catch (err) {
  if (err instanceof ChainLensCallError) {
    console.error("call failed", err.failure.kind, err.failure.hint);
  } else {
    throw err;
  }
}`;

export default function DocsSdkSection() {
  return (
    <section id="sdk" className="mb-14">
      <h2 className="text-2xl font-bold mb-4" style={{ color: "var(--text)" }}>
        2. SDK quickstart
      </h2>
      <p className="mb-4" style={{ color: "var(--text2)" }}>
        Use the TypeScript SDK when your app or coding agent should call ChainLens listings from
        code. The SDK signs USDC <InlineCode>ReceiveWithAuthorization</InlineCode>, checks local
        spend limits before signing, submits to the gateway, records local telemetry, and returns
        the response plus amount, protocol fee, seller net, and settlement tx hash.
      </p>
      <TerminalWindow title="terminal — install">
        <Line>npm install @chain-lens/sdk@^{DOCS_SDK_VERSION} viem</Line>
      </TerminalWindow>
      <DocsCodeBlock code={SDK_CONFIG_CODE} language="chainlens.ts" />
      <DocsCodeBlock code={SDK_CALL_CODE} language="call.ts" />
      <div
        className="rounded-lg p-4 text-sm"
        style={{
          background: "rgba(121,192,255,0.08)",
          border: "1px solid rgba(121,192,255,0.25)",
          color: "var(--cyan)",
        }}
      >
        <strong>Failure shape:</strong> provider-quality failures throw{" "}
        <InlineCode>ChainLensCallError</InlineCode> with typed kinds such as{" "}
        <InlineCode>schema_mismatch</InlineCode>, <InlineCode>timeout</InlineCode>,{" "}
        <InlineCode>rate_limit</InlineCode>, <InlineCode>http_4xx</InlineCode>, and{" "}
        <InlineCode>http_5xx</InlineCode>. Schema mismatch and seller failures do not submit
        settlement.
      </div>
    </section>
  );
}
