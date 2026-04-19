import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { baseSepolia } from "@chain-lens/shared";

export const wagmiConfig = getDefaultConfig({
  appName: "ChainLens",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "YOUR_PROJECT_ID",
  chains: [baseSepolia],
  ssr: true,
});
