/**
 * RSA PKCS#1 v1.5 encryption, matching what the Steam client sends as
 * `encrypted_password` when starting a credential auth session.
 *
 * Steam hands out `publickey_mod` / `publickey_exp` as hex strings; the client
 * RSA-encrypts the password with PKCS#1 v1.5 padding and base64-encodes the
 * raw ciphertext.
 */

import * as Crypto from 'expo-crypto';

import { bytesToBase64, hexToBytes } from './bytes';

const MAX_PASSWORD_BYTES = 64;

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  let factor = base % modulus;
  let power = exponent;

  while (power > 0n) {
    if (power & 1n) {
      result = (result * factor) % modulus;
    }
    factor = (factor * factor) % modulus;
    power >>= 1n;
  }

  return result;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;

  for (let i = 0; i < bytes.length; i += 1) {
    value = (value << 8n) | BigInt(bytes[i]);
  }

  return value;
}

function bigIntToBytes(value: bigint, length: number): Uint8Array {
  const out = new Uint8Array(length);
  let remaining = value;

  for (let i = length - 1; i >= 0; i -= 1) {
    out[i] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }

  return out;
}

/**
 * Steam truncates the password to 64 bytes and strips non-ASCII characters
 * before encrypting, so we do the same to keep behaviour identical.
 */
export function normalizePassword(password: string): string {
  const ascii = password.replace(/[^\x00-\x7f]/g, '');
  return ascii.slice(0, MAX_PASSWORD_BYTES);
}

export function normalizeAccountName(accountName: string): string {
  return accountName.replace(/[^\x00-\x7f]/g, '');
}

export function rsaEncryptPassword(
  password: string,
  publicKeyModHex: string,
  publicKeyExpHex: string,
): string {
  const modulus = bytesToBigInt(hexToBytes(publicKeyModHex));
  const exponent = bytesToBigInt(hexToBytes(publicKeyExpHex));
  const keyLength = Math.ceil(modulus.toString(2).length / 8);

  const normalized = normalizePassword(password);
  const message = new Uint8Array(normalized.length);
  for (let i = 0; i < normalized.length; i += 1) {
    message[i] = normalized.charCodeAt(i) & 0xff;
  }

  if (message.length > keyLength - 11) {
    throw new Error('Password is too long to encrypt for this Steam RSA key.');
  }

  // EM = 0x00 || 0x02 || PS || 0x00 || M, with PS made of non-zero bytes.
  const block = new Uint8Array(keyLength);
  block[0] = 0x00;
  block[1] = 0x02;

  const paddingLength = keyLength - message.length - 3;
  const random = Crypto.getRandomBytes(paddingLength);
  for (let i = 0; i < paddingLength; i += 1) {
    // 0x00 would terminate the padding early, so shift it into 0x01..0xff.
    block[2 + i] = random[i] === 0 ? 1 : random[i];
  }

  block[2 + paddingLength] = 0x00;
  block.set(message, 3 + paddingLength);

  const ciphertext = modPow(bytesToBigInt(block), exponent, modulus);

  return bytesToBase64(bigIntToBytes(ciphertext, keyLength));
}
