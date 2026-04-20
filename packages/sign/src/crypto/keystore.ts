import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { keccak256 } from "viem";
import { privateKeyToAddress } from "viem/accounts";

export interface ScryptKdfParams {
  dklen: number;
  n: number;
  p: number;
  r: number;
  salt: string;
}

export interface KeystoreV3 {
  address: string;
  id: string;
  version: 3;
  crypto: {
    cipher: "aes-128-ctr";
    ciphertext: string;
    cipherparams: { iv: string };
    kdf: "scrypt";
    kdfparams: ScryptKdfParams;
    mac: string;
  };
}

export interface ScryptOptions {
  n: number;
  r: number;
  p: number;
  dklen: number;
}

// geth's StandardScryptN / StandardScryptP — slow (~1s), strong.
export const GETH_STANDARD_SCRYPT: ScryptOptions = { n: 262144, r: 8, p: 1, dklen: 32 };

// geth's LightScryptN / LightScryptP — fast (~100ms), acceptable for interactive use.
export const GETH_LIGHT_SCRYPT: ScryptOptions = { n: 4096, r: 8, p: 6, dklen: 32 };

export interface EncryptParams {
  privateKey: `0x${string}`;
  password: string;
  scrypt?: ScryptOptions;
}

export function encryptKey({
  privateKey,
  password,
  scrypt = GETH_STANDARD_SCRYPT,
}: EncryptParams): KeystoreV3 {
  const salt = randomBytes(32);
  const iv = randomBytes(16);
  const derivedKey = deriveScryptKey(password, salt, scrypt);
  const encryptionKey = derivedKey.subarray(0, 16);
  const macKey = derivedKey.subarray(16, 32);

  const pkBytes = Buffer.from(privateKey.slice(2), "hex");
  const cipher = createCipheriv("aes-128-ctr", encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(pkBytes), cipher.final()]);

  const mac = keccak256(Buffer.concat([macKey, ciphertext]));
  const address = privateKeyToAddress(privateKey);

  return {
    address: address.slice(2).toLowerCase(),
    id: randomUUID(),
    version: 3,
    crypto: {
      cipher: "aes-128-ctr",
      ciphertext: ciphertext.toString("hex"),
      cipherparams: { iv: iv.toString("hex") },
      kdf: "scrypt",
      kdfparams: {
        dklen: scrypt.dklen,
        n: scrypt.n,
        p: scrypt.p,
        r: scrypt.r,
        salt: salt.toString("hex"),
      },
      mac: mac.slice(2),
    },
  };
}

export function decryptKey(keystore: KeystoreV3, password: string): `0x${string}` {
  if (keystore.version !== 3) {
    throw new Error(`Unsupported keystore version: ${keystore.version}`);
  }
  if (keystore.crypto.cipher !== "aes-128-ctr") {
    throw new Error(`Unsupported cipher: ${keystore.crypto.cipher}`);
  }
  if (keystore.crypto.kdf !== "scrypt") {
    throw new Error(`Unsupported KDF: ${keystore.crypto.kdf}`);
  }

  const { salt, n, r, p, dklen } = keystore.crypto.kdfparams;
  const derivedKey = deriveScryptKey(password, Buffer.from(salt, "hex"), { n, r, p, dklen });
  const ciphertext = Buffer.from(keystore.crypto.ciphertext, "hex");
  const macKey = derivedKey.subarray(16, 32);
  const expectedMacHex = keccak256(Buffer.concat([macKey, ciphertext])).slice(2);

  if (!hexEqualConstantTime(expectedMacHex, keystore.crypto.mac.toLowerCase())) {
    throw new Error("Invalid password (MAC mismatch)");
  }

  const encryptionKey = derivedKey.subarray(0, 16);
  const iv = Buffer.from(keystore.crypto.cipherparams.iv, "hex");
  const decipher = createDecipheriv("aes-128-ctr", encryptionKey, iv);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return `0x${plaintext.toString("hex")}` as `0x${string}`;
}

function deriveScryptKey(password: string, salt: Buffer, opts: ScryptOptions): Buffer {
  // Node caps scrypt memory at maxmem. Minimum required: 128 * N * r bytes; we
  // pad with a 2x margin to accommodate the internal buffer overhead.
  const maxmem = 2 * 128 * opts.n * opts.r + 1024;
  return scryptSync(Buffer.from(password, "utf8"), salt, opts.dklen, {
    N: opts.n,
    r: opts.r,
    p: opts.p,
    maxmem,
  });
}

function hexEqualConstantTime(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
