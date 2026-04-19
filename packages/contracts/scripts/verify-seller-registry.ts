import hre from "hardhat";
import { getAddress } from "viem";

const ADDRESS = "0xcF36b76b5Da55471D4EBB5349A0653624371BE2c" as const;

async function main() {
  const registry = await hre.viem.getContractAt("SellerRegistry", ADDRESS);
  const owner = await registry.read.owner();
  const gateway = await registry.read.gateway();
  const neutral = await registry.read.REPUTATION_NEUTRAL_BPS();
  const max = await registry.read.REPUTATION_MAX_BPS();

  console.log("SellerRegistry @", ADDRESS);
  console.log("  owner           :", getAddress(owner));
  console.log("  gateway         :", getAddress(gateway));
  console.log("  NEUTRAL_BPS     :", neutral.toString());
  console.log("  MAX_BPS         :", max.toString());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
