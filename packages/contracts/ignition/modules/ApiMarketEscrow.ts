import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const ApiMarketEscrowModule = buildModule("ApiMarketEscrowModule", (m) => {
  const gateway = m.getParameter("gateway", "0xD21dE9470d8A0dbae0dE0b5f705001a6482Db580");
  const feeRate = m.getParameter("feeRate", 500n);
  const usdc = m.getParameter("usdc", "0x036CbD53842c5426634e7929541eC2318f3dCF7e");
  const escrow = m.contract("ApiMarketEscrow", [gateway, feeRate, usdc]);
  return { escrow };
});

export default ApiMarketEscrowModule;
