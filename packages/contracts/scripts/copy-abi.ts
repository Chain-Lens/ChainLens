import * as fs from "fs";
import * as path from "path";

const ARTIFACTS = path.resolve(__dirname, "../artifacts/contracts");
const OUT = path.resolve(__dirname, "../../shared/src/abi");

const MAP: Array<{ artifact: string; out: string }> = [
  {
    artifact: "ApiMarketEscrow.sol/ApiMarketEscrow.json",
    out: "ApiMarketEscrow.json",
  },
  {
    artifact: "ApiMarketEscrowV2.sol/ApiMarketEscrowV2.json",
    out: "ApiMarketEscrowV2.json",
  },
  {
    artifact: "SellerRegistry.sol/SellerRegistry.json",
    out: "SellerRegistry.json",
  },
  {
    artifact: "TaskTypeRegistry.sol/TaskTypeRegistry.json",
    out: "TaskTypeRegistry.json",
  },
  {
    artifact: "ChainLensMarket.sol/ChainLensMarket.json",
    out: "ChainLensMarket.json",
  },
];

for (const { artifact, out } of MAP) {
  const src = path.join(ARTIFACTS, artifact);
  const dst = path.join(OUT, out);
  const data = JSON.parse(fs.readFileSync(src, "utf-8"));
  fs.writeFileSync(dst, JSON.stringify(data.abi, null, 2));
  console.log(`ABI copied: ${out}`);
}
