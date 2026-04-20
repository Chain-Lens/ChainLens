import { access, mkdir, writeFile } from "node:fs/promises";
import type { KeystoreV3 } from "../crypto/keystore.js";
import { keystoreDir } from "../paths.js";
import { promptSecret } from "../prompt.js";

const MIN_PASSWORD_LENGTH = 8;

export async function requirePasswordConfirmation(): Promise<string> {
  const password = await promptSecret(`Password (min ${MIN_PASSWORD_LENGTH} chars): `);
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  const confirm = await promptSecret("Confirm password: ");
  if (password !== confirm) throw new Error("Passwords do not match.");
  return password;
}

export async function writeKeystoreFile(target: string, keystore: KeystoreV3): Promise<void> {
  await mkdir(keystoreDir(), { recursive: true, mode: 0o700 });
  // flag "wx" = fail if the file already exists (atomic no-overwrite).
  await writeFile(target, JSON.stringify(keystore, null, 2), { mode: 0o600, flag: "wx" });
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
