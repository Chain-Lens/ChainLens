import { toAccount, type LocalAccount } from "viem/accounts";
import type { DaemonClient } from "./client.js";

// Custom viem account that delegates signing to the sign daemon. Lets
// any viem-based caller (WalletClient, contract writes) transparently
// sign transactions through the unix socket instead of holding the
// private key in-process.
export async function daemonAccount(client: DaemonClient): Promise<LocalAccount> {
  const { address } = await client.address();
  return toAccount({
    address,
    async signTransaction(transaction) {
      const { signedTransaction } = await client.signTransaction(
        transaction as unknown as Record<string, unknown>,
      );
      return signedTransaction;
    },
    async signMessage() {
      throw new Error("signMessage: not implemented (daemon 0.0.2 supports sign-tx only)");
    },
    async signTypedData() {
      throw new Error("signTypedData: not implemented (daemon 0.0.2 supports sign-tx only)");
    },
  });
}
