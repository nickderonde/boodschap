// Item-CRDT (§5.3, §5.5) en de verwijderregel R-DEL (sectie 3).
import { maxHlc } from '../hlc';
import type { Hlc, ItemState } from '../types';
import { maxRegHlc, mergeRegs } from './register';

export function mergeItem(a: ItemState | undefined, b: ItemState | undefined): ItemState | undefined {
  if (!a) return b;
  if (!b) return a;
  const regs = mergeRegs(a.regs, b.regs);
  const del = maxHlc(a.del, b.del);
  if (regs === a.regs && del === a.del) return a;
  return { id: a.id, regs, del };
}

/** Hoogste HLC van alles wat over dit item bekend is (registers én verwijdering). */
export function itemMaxHlc(it: ItemState): Hlc | null {
  return maxHlc(maxRegHlc(it.regs), it.del);
}

/** R-DEL: verwijderd ⇔ del ≠ null ∧ del > max(hlc van alle registers, ook onbekende). */
export function isItemDeleted(it: ItemState): boolean {
  if (it.del === null) return false;
  const m = maxRegHlc(it.regs);
  return m === null || it.del > m;
}

export function regValue<T>(it: ItemState, key: string): T | undefined {
  const r = it.regs[key];
  return r ? (r[0] as T) : undefined;
}

export function regHlc(it: ItemState, key: string): Hlc | undefined {
  return it.regs[key]?.[1];
}
