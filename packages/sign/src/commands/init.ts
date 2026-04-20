import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { encryptKey, GETH_STANDARD_SCRYPT } from "../crypto/keystore.js";
import { keystoreFilePath } from "../paths.js";
import { fileExists, requirePasswordConfirmation, writeKeystoreFile } from "./shared.js";

export async function runInit(): Promise<void> {
  const privateKey = generatePrivateKey();
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

  process.stdout.write(`\n  Generated new wallet.\n`);
  process.stdout.write(`  Address:  ${account.address}\n`);
  process.stdout.write(`  Keystore: ${target}\n\n`);
  process.stdout.write(
    `  WARNING: back up this file. If you lose both the file AND the password,\n`,
  );
  process.stdout.write(`  there is no way to recover this wallet.\n`);
}
