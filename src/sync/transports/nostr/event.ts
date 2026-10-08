// Nostr-events (§6.3): kind 30078, één tag ["d", "<listTag>:<i>"], content = base64(envelop), created_at = versie.
import { finalizeEvent, getPublicKey, verifyEvent } from 'nostr-tools/pure';
import { fromBase64, toBase64 } from '../../../core/bytes';

export const KIND = 30078;

export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export function buildEvent(p: { channel: string; slot: number; version: number; envelope: Uint8Array; secret: Uint8Array }): NostrEvent {
  return finalizeEvent(
    { kind: KIND, created_at: p.version, tags: [['d', `${p.channel}:${p.slot}`]], content: toBase64(p.envelope) },
    p.secret,
  ) as NostrEvent;
}

export function publicKeyOf(secret: Uint8Array): string | null {
  if (secret.length !== 32) return null;
  try {
    return getPublicKey(secret);
  } catch {
    return null;
  }
}

/** Vormcontrole (§6.7 stap 1) en ontleden van de d-tag. Geeft null bij ruis. */
export function parseEvent(e: unknown): { ev: NostrEvent; channel: string; slot: number; envelope: Uint8Array } | null {
  if (!e || typeof e !== 'object') return null;
  const ev = e as NostrEvent;
  if (ev.kind !== KIND || typeof ev.id !== 'string' || typeof ev.pubkey !== 'string' || typeof ev.content !== 'string') return null;
  if (!Number.isInteger(ev.created_at) || !Array.isArray(ev.tags)) return null;
  const d = ev.tags.find((t) => Array.isArray(t) && t[0] === 'd');
  if (!d || typeof d[1] !== 'string') return null;
  const m = /^([0-9a-f]{32}):(\d{1,2})$/.exec(d[1]);
  if (!m) return null;
  let envelope: Uint8Array;
  try {
    envelope = fromBase64(ev.content);
  } catch {
    envelope = new Uint8Array(0);
  }
  return { ev, channel: m[1], slot: Number(m[2]), envelope };
}

export function verify(ev: NostrEvent): boolean {
  try {
    return verifyEvent(ev);
  } catch {
    return false;
  }
}
