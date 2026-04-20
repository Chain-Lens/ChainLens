import { readdir } from "node:fs/promises";
import { getAddress } from "viem";
import { keystoreDir } from "../paths.js";

export async function runAddress(): Promise<void> {
  const dir = keystoreDir();
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    process.stdout.write(
      `No keystore directory found at ${dir}. Run 'chain-lens-sign init' first.\n`,
    );
    return;
  }

  const addresses = files
    .filter((f) => f.endsWith(".json"))
    .map((f) => getAddress(`0x${f.slice(0, -5)}` as `0x${string}`));

  if (addresses.length === 0) {
    process.stdout.write(`No keystores in ${dir}. Run 'chain-lens-sign init' first.\n`);
    return;
  }

  for (const addr of addresses) process.stdout.write(`${addr}\n`);
}
