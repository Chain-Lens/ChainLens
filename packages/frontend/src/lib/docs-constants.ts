import { CHAIN_LENS_MARKET_ADDRESSES, USDC_ADDRESSES } from "@chain-lens/shared";

export const DOCS_CHAIN_ID = 84532;
export const DOCS_MARKET = CHAIN_LENS_MARKET_ADDRESSES[DOCS_CHAIN_ID]!;
export const DOCS_USDC = USDC_ADDRESSES[DOCS_CHAIN_ID]!;
export const DOCS_BASE_URL = "https://chainlens.pelicanlab.dev/api";
export const DOCS_SDK_VERSION = "0.1.2";
export const DOCS_CLI_VERSION = "0.1.2";

export const DOCS_QUICKSTART_CODE = `import { ChainLens, ViemWallet, ChainLensCallError } from "@chain-lens/sdk";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const account = privateKeyToAccount(process.env.WALLET_PRIVATE_KEY as \`0x\${string}\`);
const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(process.env.RPC_URL),
});

const chainlens = new ChainLens({
  wallet: new ViemWallet(walletClient),
  chainId: 84532,
  gatewayUrl: "${DOCS_BASE_URL}",
  telemetry: { enabled: true, upload: false },
});

try {
  const result = await chainlens.call(13, { symbol: "MSFT" });
  console.log({
    data: result.data,
    amountUsdc: result.amountUsdc,
    feeUsdc: result.feeUsdc,
    netUsdc: result.netUsdc,
    txHash: result.settlement.txHash,
  });
} catch (err) {
  if (err instanceof ChainLensCallError) {
    console.error(err.failure.kind, err.failure.hint);
  } else {
    throw err;
  }
}
`;
