// Envelop (§6.2): 0x01 ‖ nonce(24) ‖ XChaCha20-Poly1305(ciphertext). AAD bindt afzender en slot (NF-02c).
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { concatBytes, utf8 } from '../bytes';
import type { Random } from '../types';

export const ENVELOPE_VERSION = 0x01;
export const NONCE_BYTES = 24;
export const TAG_BYTES = 16;
export const ENVELOPE_OVERHEAD = 1 + NONCE_BYTES + TAG_BYTES; // 41

/** AAD = utf8("bootschap/v1|" + sender + "|" + channel + ":" + slot). Gebouwd door de engine (E-17). */
export function buildAad(sender: string, channel: string, slot: number): Uint8Array {
  return utf8(`bootschap/v1|${sender}|${channel}:${slot}`);
}

export function seal(key: Uint8Array, aad: Uint8Array, plaintext: Uint8Array, random: Random): Uint8Array {
  const nonce = random.bytes(NONCE_BYTES);
  const ct = xchacha20poly1305(key, nonce, aad).encrypt(plaintext);
  return concatBytes(Uint8Array.of(ENVELOPE_VERSION), nonce, ct);
}

/** Ontsleutelt een envelop. Gooit bij een onbekende versie, te korte invoer of een AEAD-fout. */
export function open(key: Uint8Array, aad: Uint8Array, envelope: Uint8Array): Uint8Array {
  if (envelope.length < ENVELOPE_OVERHEAD) throw new Error('aead.short');
  if (envelope[0] !== ENVELOPE_VERSION) throw new Error('aead.version');
  const nonce = envelope.subarray(1, 1 + NONCE_BYTES);
  const ct = envelope.subarray(1 + NONCE_BYTES);
  return xchacha20poly1305(key, nonce, aad).decrypt(ct);
}
