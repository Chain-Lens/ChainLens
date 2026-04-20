import { createPublicClient, createWalletClient, http, defineChain, type Hex } from "viem";
import { connectDaemon } from "../daemon/client.js";
import { daemonAccount } from "../daemon/account.js";
import { socketPath } from "../paths.js";

export async function runSendTx(argv: string[]): Promise<void> {
  const args = parseArgs(argv);

  const sock = socketPath();
  const client = await connectDaemon(sock).catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ENOENT") || msg.includes("ECONNREFUSED")) {
      throw new Error(`No daemon at ${sock}. Run 'chain-lens-sign unlock' first.`);
    }
    throw err;
  });

  try {
    const account = await daemonAccount(client);
    const transport = http(args.rpc);
    const publicClient = createPublicClient({ transport });
    const chainId = args.chainId ?? Number(await publicClient.getChainId());
    const chain = defineChain({
      id: chainId,
      name: `chain-${chainId}`,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [args.rpc] } },
    });
    const walletClient = createWalletClient({ account, chain, transport });

    process.stdout.write(
      `  From:    ${account.address}\n` +
        `  To:      ${args.to}\n` +
        `  Value:   ${args.value} wei\n` +
        `  Chain:   ${chainId}\n` +
        `  RPC:     ${args.rpc}\n\n`,
    );

    const hash = await walletClient.sendTransaction({
      to: args.to,
      value: args.value,
      data: args.data,
    });
    process.stdout.write(`  Sent:    ${hash}\n`);

    if (!args.noWait) {
      process.stdout.write(`  Waiting for receipt...\n`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      process.stdout.write(
        `  Status:  ${receipt.status}\n` +
          `  Block:   ${receipt.blockNumber}\n` +
          `  GasUsed: ${receipt.gasUsed}\n`,
      );
    }
  } finally {
    client.close();
  }
}

interface SendTxArgs {
  rpc: string;
  to: `0x${string}`;
  value: bigint;
  data: Hex;
  chainId?: number;
  noWait: boolean;
}

function parseArgs(argv: string[]): SendTxArgs {
  let rpc: string | undefined;
  let to: string | undefined;
  let value = 0n;
  let data: Hex = "0x";
  let chainId: number | undefined;
  let noWait = false;

  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const [flag, inline] = key.includes("=") ? [key.split("=", 2)[0], key.split("=", 2)[1]] : [key, undefined];
    const read = (): string => {
      if (inline !== undefined) return inline;
      const v = argv[++i];
      if (v === undefined) throw new Error(`${flag} requires a value`);
      return v;
    };
    switch (flag) {
      case "--rpc":
        rpc = read();
        break;
      case "--to":
        to = read();
        break;
      case "--value":
        value = BigInt(read());
        break;
      case "--data":
        data = requireHex(read(), "--data");
        break;
      case "--chain-id":
        chainId = Number(read());
        break;
      case "--no-wait":
        noWait = true;
        break;
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }

  if (!rpc) throw new Error("--rpc <url> is required");
  if (!to) throw new Error("--to <0x...> is required");
  requireHex(to, "--to");
  if (to.length !== 42) throw new Error(`--to must be a 20-byte address: ${to}`);

  return { rpc, to: to as `0x${string}`, value, data, chainId, noWait };
}

function requireHex(value: string, flag: string): Hex {
  if (!/^0x[0-9a-fA-F]*$/.test(value)) {
    throw new Error(`${flag} must be 0x-prefixed hex, got: ${value}`);
  }
  return value as Hex;
}
