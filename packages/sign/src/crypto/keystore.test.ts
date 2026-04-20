import { strict as assert } from "node:assert";
import { test } from "node:test";
import { generatePrivateKey, privateKeyToAddress } from "viem/accounts";
import { decryptKey, encryptKey, type ScryptOptions } from "./keystore.js";

// Intentionally weak scrypt params for fast test runs. DO NOT USE in production.
const FAST_SCRYPT: ScryptOptions = { n: 256, r: 8, p: 1, dklen: 32 };

test("encrypt/decrypt roundtrip recovers the original private key", () => {
  const privateKey = generatePrivateKey();
  const keystore = encryptKey({ privateKey, password: "hunter2password", scrypt: FAST_SCRYPT });
  const recovered = decryptKey(keystore, "hunter2password");
  assert.equal(recovered, privateKey);
});

test("decrypt with wrong password throws MAC mismatch", () => {
  const privateKey = generatePrivateKey();
  const keystore = encryptKey({ privateKey, password: "correct", scrypt: FAST_SCRYPT });
  assert.throws(() => decryptKey(keystore, "wrong"), /MAC mismatch/);
});

test("stored address matches the key-derived address", () => {
  const privateKey = generatePrivateKey();
  const expected = privateKeyToAddress(privateKey);
  const keystore = encryptKey({ privateKey, password: "pass1234", scrypt: FAST_SCRYPT });
  assert.equal(keystore.address, expected.slice(2).toLowerCase());
});

test("keystore is geth v3 (aes-128-ctr / scrypt)", () => {
  const keystore = encryptKey({
    privateKey: generatePrivateKey(),
    password: "pass1234",
    scrypt: FAST_SCRYPT,
  });
  assert.equal(keystore.version, 3);
  assert.equal(keystore.crypto.cipher, "aes-128-ctr");
  assert.equal(keystore.crypto.kdf, "scrypt");
  assert.equal(keystore.crypto.kdfparams.dklen, 32);
});

test("each encryption produces fresh salt and iv", () => {
  const privateKey = generatePrivateKey();
  const a = encryptKey({ privateKey, password: "pass1234", scrypt: FAST_SCRYPT });
  const b = encryptKey({ privateKey, password: "pass1234", scrypt: FAST_SCRYPT });
  assert.notEqual(a.crypto.kdfparams.salt, b.crypto.kdfparams.salt);
  assert.notEqual(a.crypto.cipherparams.iv, b.crypto.cipherparams.iv);
  assert.notEqual(a.crypto.ciphertext, b.crypto.ciphertext);
});
