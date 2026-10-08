// Lijst-CRDT (§5.4, §5.5): registers + map van items. Merge is een join (S-05).
import { maxRegHlc, mergeRegs } from './register';
import { mergeItem } from './item';
import type { ItemState, ListState, Regs } from '../types';

export function emptyList(): ListState {
  return { regs: {}, items: new Map() };
}

export function mergeList(a: ListState, b: ListState): ListState {
  const regs = mergeRegs(a.regs, b.regs);
  let items: Map<string, ItemState> | null = null;
  for (const [id, bi] of b.items) {
    const ai = a.items.get(id);
    const m = mergeItem(ai, bi)!;
    if (m !== ai) {
      if (!items) items = new Map(a.items);
      items.set(id, m);
    }
  }
  if (regs === a.regs && !items) return a;
  return { regs, items: items ?? a.items };
}

/** De lijst is verwijderd zodra register `D` bestaat ("wint altijd"). */
export function isListDeleted(list: { regs: Regs }): boolean {
  return list.regs.D !== undefined;
}

export function listName(list: { regs: Regs }): string | null {
  const r = list.regs.n;
  return r && typeof r[0] === 'string' ? (r[0] as string) : null;
}

export function listRegsMaxHlc(list: { regs: Regs }): string | null {
  return maxRegHlc(list.regs);
}

export function listOf(regs: Regs, items: Iterable<ItemState>): ListState {
  const m = new Map<string, ItemState>();
  for (const it of items) m.set(it.id, it);
  return { regs, items: m };
}
