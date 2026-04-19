import hre from "hardhat";
import { getAddress } from "viem";

const ADDRESS = "0xD4c40710576f582c49e5E6417F6cA2023E30d3aD" as const;

async function main() {
  const escrow = await hre.viem.getContractAt("ApiMarketEscrowV2", ADDRESS);
  const owner = await escrow.read.owner();
  const gateway = await escrow.read.gateway();
  const feeRate = await escrow.read.feeRate();
  const usdc = await escrow.read.usdc();
  const nextJobId = await escrow.read.nextJobId();
  const maxFee = await escrow.read.MAX_FEE_RATE_BPS();

  console.log("ApiMarketEscrowV2 @", ADDRESS);
  console.log("  owner           :", getAddress(owner));
  console.log("  gateway         :", getAddress(gateway));
  console.log("  usdc            :", getAddress(usdc));
  console.log("  feeRate (bps)   :", feeRate.toString());
  console.log("  nextJobId       :", nextJobId.toString());
  console.log("  MAX_FEE_RATE_BPS:", maxFee.toString());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
