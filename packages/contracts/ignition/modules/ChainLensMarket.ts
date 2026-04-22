import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Base Sepolia defaults — override via --parameters at deploy time.
const DEFAULT_GATEWAY = "0x622F1399b9E0B31baC65578639DCdfB692975b8A";
const DEFAULT_TREASURY = "0x622F1399b9E0B31baC65578639DCdfB692975b8A";
const DEFAULT_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const ChainLensMarketModule = buildModule("ChainLensMarketModule", (m) => {
  const gateway = m.getParameter("gateway", DEFAULT_GATEWAY);
  const treasury = m.getParameter("treasury", DEFAULT_TREASURY);
  const usdc = m.getParameter("usdc", DEFAULT_USDC);

  const market = m.contract("ChainLensMarket", [gateway, treasury, usdc]);

  // NOTE: all fee params default to 0 in the constructor. Flip them on via
  //   owner.setRegistrationFee / setServiceFeeBps once spam signals warrant.
  //   Leaving a post-deploy hook here would be premature — do it from a
  //   dedicated ops script (or the admin dashboard) with human review.

  return { market };
});

export default ChainLensMarketModule;