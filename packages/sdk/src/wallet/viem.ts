import type { WalletClient, Hex, TypedDataDefinition } from "viem";
import { hexToNumber, numberToHex, parseSignature } from "viem";
import type { WalletAdapter, TypedData, TxRequest } from "./types.js";

/**
 * WalletAdapter backed by a viem WalletClient.
 *
 * Usage:
 *   const walletClient = createWalletClient({ account, chain, transport });
 *   const wallet = new ViemWallet(walletClient);
 */
export class ViemWallet implements WalletAdapter {
  constructor(private readonly client: WalletClient) {}

  async address(): Promise<`0x${string}`> {
    const accounts = await this.client.getAddresses();
    const addr = accounts[0];
    if (!addr) throw new Error("ViemWallet: no accounts available");
    return addr;
  }

  async signTypedData(
    typedData: TypedData,
  ): Promise<{ v: number; r: `0x${string}`; s: `0x${string}` }> {
    const { domain, types, primaryType, message } = typedData;

    const sig = await this.client.signTypedData({
      domain: {
        name: domain.name,
        version: domain.version,
        chainId: domain.chainId,
        verifyingContract: domain.verifyingContract,
      },
      types: types as unknown as TypedDataDefinition["types"],
      primaryType,
      message: message as Record<string, unknown>,
    } as Parameters<WalletClient["signTypedData"]>[0]);

    const parsed = parseSignature(sig as Hex);
    return {
      v: hexToNumber(numberToHex(parsed.v ?? 27n)),
      r: parsed.r as `0x${string}`,
      s: parsed.s as `0x${string}`,
    };
  }

  async sendTransaction(tx: TxRequest): Promise<`0x${string}`> {
    const from = await this.address();
    return this.client.sendTransaction({
      account: from,
      to: tx.to,
      data: tx.data,
      value: tx.value,
      chain: this.client.chain ?? null,
    });
  }
}
