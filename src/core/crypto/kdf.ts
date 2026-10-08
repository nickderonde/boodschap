// Afgeleide sleutels uit het lijstgeheim S (§6.1). HKDF-SHA256, salt "bootschap/v1".
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { toHex, utf8 } from '../bytes';

const SALT = utf8('bootschap/v1');

export interface ListKeys {
  /** 32 hex-tekens, basis van de d-tag; zichtbaar voor relays. */
  listTag: string;
  /** 32 bytes XChaCha20-Poly1305-sleutel. */
  encKey: Uint8Array;
}

export function deriveListKeys(secret: Uint8Array): ListKeys {
  if (secret.length !== 32) throw new Error('kdf.secret');
  return {
    listTag: toHex(hkdf(sha256, secret, SALT, utf8('list-tag'), 16)),
    encKey: hkdf(sha256, secret, SALT, utf8('enc-key'), 32),
  };
}

export function sha256Hex(data: Uint8Array): string {
  return toHex(sha256(data));
}

export function sha256Bytes(data: Uint8Array): Uint8Array {
  return sha256(data);
}
