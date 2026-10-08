// Deelcode (§7, F-13, F-15): binaire payload, QR/link (base64url) en tekstcode (Crockford-base32).
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesEqual, concatBytes, fromBase64Url, fromCrockford, fromUtf8, toBase64Url, toCrockford, utf8 } from '../bytes';

export const SHARECODE_VERSION = 0x01;
/** ST-10: nieuwe deellinks gebruiken het schema van de storenaam. */
export const LINK_PREFIX = 'boodschap://join#';
/** ST-10: links uit de rooktest (vóór de naamswijziging) blijven geldig; de parser leest elke `…://join#<code>`. */
export const LEGACY_LINK_PREFIX = 'bootschap://join#';
/** Alle URL-schema's die de app opent (gelijk aan `scheme` in app.json). */
export const URL_SCHEMES = ['boodschap', 'bootschap'] as const;
export const TEXT_PREFIX = 'BS1-';

export interface SharePayload {
  secret: Uint8Array; // 32 bytes
  relayHints: string[]; // volledige URL's
}

export type ShareCodeError = 'geen-code' | 'beschadigd' | 'controlesom' | 'nieuwere-versie';

export class ShareCodeParseError extends Error {
  constructor(readonly code: ShareCodeError) {
    super(code);
  }
}

function compactUrl(u: string): string {
  return u.startsWith('wss://') ? u.slice(6) : u;
}

function expandUrl(u: string): string {
  return u.startsWith('ws://') || u.startsWith('wss://') ? u : 'wss://' + u;
}

export function encodeSharePayload(p: SharePayload): Uint8Array {
  if (p.secret.length !== 32) throw new Error('sharecode.secret');
  const parts: Uint8Array[] = [Uint8Array.of(SHARECODE_VERSION), p.secret];
  if (p.relayHints.length > 0) {
    const hints = utf8(p.relayHints.map(compactUrl).join('\n'));
    if (hints.length > 255) throw new Error('sharecode.hints');
    parts.push(Uint8Array.of(1), Uint8Array.of(hints.length), hints);
  } else {
    parts.push(Uint8Array.of(0));
  }
  const body = concatBytes(...parts);
  return concatBytes(body, sha256(body).subarray(0, 2));
}

export function decodeSharePayload(bytes: Uint8Array): SharePayload {
  if (bytes.length < 36) throw new ShareCodeParseError('beschadigd');
  // Afgekapt (te kort) → beschadigd; daarna eerst de controlesom: een tikfout in het eerste teken is een tikfout, geen nieuwere versie (review bevinding 9).
  const body = bytes.subarray(0, bytes.length - 2);
  const sum = bytes.subarray(bytes.length - 2);
  if (!bytesEqual(sha256(body).subarray(0, 2), sum)) throw new ShareCodeParseError('controlesom');
  if (bytes[0] > SHARECODE_VERSION) throw new ShareCodeParseError('nieuwere-versie');
  if (bytes[0] !== SHARECODE_VERSION) throw new ShareCodeParseError('beschadigd');
  const secret = body.slice(1, 33);
  const flags = body[33];
  let relayHints: string[] = [];
  if (flags & 1) {
    const len = body[34];
    if (len === undefined || body.length !== 35 + len) throw new ShareCodeParseError('beschadigd');
    relayHints = fromUtf8(body.subarray(35, 35 + len)).split('\n').filter(Boolean).map(expandUrl);
    if (!relayHints.every((u) => /^wss?:\/\/[^\s/]+/.test(u))) throw new ShareCodeParseError('beschadigd');
  } else if (body.length !== 34) {
    throw new ShareCodeParseError('beschadigd');
  }
  return { secret, relayHints };
}

export function toLink(p: SharePayload): string {
  return LINK_PREFIX + toBase64Url(encodeSharePayload(p));
}

export function toTextCode(p: SharePayload): string {
  const b32 = toCrockford(encodeSharePayload(p));
  return TEXT_PREFIX + (b32.match(/.{1,4}/g) ?? []).join('-');
}

/** Deeltekst voor het systeem-deelmenu (§7). */
export function shareText(p: SharePayload, warning: string): string {
  return `Doe mee met mijn boodschappenlijst in BOODSCHAP! Open de app → Lijst toevoegen → plak deze tekst.\n${toLink(p)}\nCode: ${toTextCode(p)}\n\n${warning}`;
}

/** Zoekt in willekeurige tekst naar een link of tekstcode (F-15). */
export function parseShareText(text: string): SharePayload {
  const link = /join#([A-Za-z0-9_-]+)/.exec(text ?? '');
  if (link) {
    let bytes: Uint8Array;
    try {
      bytes = fromBase64Url(link[1]);
    } catch {
      throw new ShareCodeParseError('beschadigd');
    }
    return decodeSharePayload(bytes);
  }
  const code = /BS1-([0-9A-Za-z-]+)/i.exec(text ?? '');
  if (code) {
    let bytes: Uint8Array;
    try {
      bytes = fromCrockford(code[1]);
    } catch {
      throw new ShareCodeParseError('beschadigd');
    }
    return decodeSharePayload(bytes);
  }
  throw new ShareCodeParseError('geen-code');
}
