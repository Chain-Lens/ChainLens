import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const DEFAULT_GATEWAY = "0xD21dE9470d8A0dbae0dE0b5f705001a6482Db580";
const DEFAULT_FEE_BPS = 500n;
const DEFAULT_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const ApiMarketEscrowV2Module = buildModule("ApiMarketEscrowV2Module", (m) => {
  const gateway = m.getParameter("gateway", DEFAULT_GATEWAY);
  const feeRate = m.getParameter("feeRate", DEFAULT_FEE_BPS);
  const usdc = m.getParameter("usdc", DEFAULT_USDC);
  const escrow = m.contract("ApiMarketEscrowV2", [gateway, feeRate, usdc]);
  return { escrow };
});

export default ApiMarketEscrowV2Module;
