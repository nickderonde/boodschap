// Identificatie (§5.1). Alle willekeur komt uit de geïnjecteerde Random (E-11).
import { toBase64Url, toHex } from './bytes';
import type { Random } from './types';

export const ITEM_ID_RE = /^[A-Za-z0-9_-]{16}$/;

export function newDeviceId(random: Random): string {
  return toHex(random.bytes(8));
}

export function newListId(random: Random): string {
  return toBase64Url(random.bytes(16));
}

export function newItemId(random: Random): string {
  return toBase64Url(random.bytes(12));
}

export function isItemId(s: unknown): s is string {
  return typeof s === 'string' && ITEM_ID_RE.test(s);
}
