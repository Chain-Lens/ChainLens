import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const DEFAULT_GATEWAY = "0xD21dE9470d8A0dbae0dE0b5f705001a6482Db580";

const SellerRegistryModule = buildModule("SellerRegistryModule", (m) => {
  const gateway = m.getParameter("gateway", DEFAULT_GATEWAY);
  const registry = m.contract("SellerRegistry", [gateway]);
  return { registry };
});

export default SellerRegistryModule;
