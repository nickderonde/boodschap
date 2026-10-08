// Byte-hulpen: hex, base64, base64url, utf8 en Crockford-base32 (§7). Pure functies.
import { strFromU8, strToU8 } from 'fflate';

export function utf8(s: string): Uint8Array {
  return strToU8(s);
}

export function fromUtf8(b: Uint8Array): string {
  return strFromU8(b);
}

const HEX = '0123456789abcdef';

export function toHex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += HEX[b[i] >> 4] + HEX[b[i] & 15];
  return s;
}

export function fromHex(s: string): Uint8Array {
  if (s.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(s)) throw new Error('hex.invalid');
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < 64; i++) t[B64.charCodeAt(i)] = i;
  t['-'.charCodeAt(0)] = 62;
  t['_'.charCodeAt(0)] = 63;
  return t;
})();

export function toBase64(b: Uint8Array): string {
  let s = '';
  let i = 0;
  for (; i + 2 < b.length; i += 3) {
    const n = (b[i] << 16) | (b[i + 1] << 8) | b[i + 2];
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const rest = b.length - i;
  if (rest === 1) {
    const n = b[i] << 16;
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + '==';
  } else if (rest === 2) {
    const n = (b[i] << 16) | (b[i + 1] << 8);
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + '=';
  }
  return s;
}

/** Decodeert base64 én base64url, met of zonder padding. Gooit bij ongeldige tekens. */
export function fromBase64(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '');
  if (clean.length % 4 === 1) throw new Error('base64.invalid');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    const c = clean.charCodeAt(i);
    const v = c < 128 ? B64_LOOKUP[c] : -1;
    if (v < 0) throw new Error('base64.invalid');
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 255;
    }
  }
  return out.subarray(0, o);
}

export function toBase64Url(b: Uint8Array): string {
  return toBase64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const fromBase64Url = fromBase64;

// Crockford base32 (zonder I, L, O, U).
const CROCK = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function toCrockford(b: Uint8Array): string {
  let s = '';
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < b.length; i++) {
    acc = (acc << 8) | b[i];
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      s += CROCK[(acc >> bits) & 31];
    }
    acc &= (1 << bits) - 1;
  }
  if (bits > 0) s += CROCK[(acc << (5 - bits)) & 31];
  return s;
}

/** Decodeert Crockford-base32. Hoofdletterongevoelig, O→0, I/L→1; streepjes worden genegeerd. */
export function fromCrockford(s: string, byteLength?: number): Uint8Array {
  const norm = s.toUpperCase().replace(/-/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const ch of norm) {
    const v = CROCK.indexOf(ch);
    if (v < 0) throw new Error('base32.invalid');
    acc = (acc << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 255);
    }
    acc &= (1 << bits) - 1;
  }
  const res = Uint8Array.from(out);
  return byteLength !== undefined ? res.subarray(0, byteLength) : res;
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
