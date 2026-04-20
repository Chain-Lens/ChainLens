import { homedir } from "node:os";
import { join } from "node:path";

export function chainLensHome(): string {
  return process.env.CHAIN_LENS_HOME ?? join(homedir(), ".chain-lens");
}

export function keystoreDir(): string {
  return join(chainLensHome(), "keystore");
}

export function keystoreFilePath(address: string): string {
  const bare = address.toLowerCase().replace(/^0x/, "");
  return join(keystoreDir(), `${bare}.json`);
}

export function socketPath(): string {
  return process.env.CHAIN_LENS_SIGN_SOCKET ?? join(chainLensHome(), "sign.sock");
}
