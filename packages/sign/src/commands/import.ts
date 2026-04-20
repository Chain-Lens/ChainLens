import { privateKeyToAccount } from "viem/accounts";
import { encryptKey, GETH_STANDARD_SCRYPT } from "../crypto/keystore.js";
import { keystoreFilePath } from "../paths.js";
import { promptSecret } from "../prompt.js";
import { fileExists, requirePasswordConfirmation, writeKeystoreFile } from "./shared.js";

export async function runImport(): Promise<void> {
  const raw = await promptSecret("Private key (0x...): ");
  const privateKey = normalisePrivateKey(raw);
  const account = privateKeyToAccount(privateKey);
  const target = keystoreFilePath(account.address);

  if (await fileExists(target)) {
    throw new Error(
      `Keystore already exists for ${account.address} at ${target}. Refusing to overwrite.`,
    );
  }

  const password = await requirePasswordConfirmation();
  const keystore = encryptKey({ privateKey, password, scrypt: GETH_STANDARD_SCRYPT });
  await writeKeystoreFile(target, keystore);

  process.stdout.write(`\n  Imported wallet.\n`);
  process.stdout.write(`  Address:  ${account.address}\n`);
  process.stdout.write(`  Keystore: ${target}\n`);
}

function normalisePrivateKey(input: string): `0x${string}` {
  const trimmed = input.trim();
  const withPrefix = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(withPrefix)) {
    throw new Error("Invalid private key: expected 32-byte hex (64 chars, optional 0x prefix).");
  }
  return withPrefix as `0x${string}`;
}
