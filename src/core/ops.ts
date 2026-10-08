// Lokale operaties → deltas (§5.3). Elke delta is een geldige deelstaat; toepassen = mergeList(staat, delta).
import { itemMaxHlc } from './crdt/item';
import { listRegsMaxHlc } from './crdt/list';
import type { HlcClock } from './hlc';
import type { Hlc, ItemState, ListDelta, ListState, MutableRegs, Register, Regs } from './types';

export interface NewItemFields {
  name: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  category: string;
  addedMs: number;
}

export type ItemField = 'n' | 'q' | 'u' | 'o' | 'k' | 'x';

function delta(regs: Regs, items: ItemState[]): ListDelta {
  return { regs, items: new Map(items.map((i) => [i.id, i])) };
}

/** Aanmaken: alle velden, plus `a`, `x=false` en `k`, krijgen dezelfde HLC h0. */
export function createItemDelta(id: string, f: NewItemFields, h0: Hlc): ListDelta {
  const regs: MutableRegs = {
    n: [f.name, h0],
    k: [f.category, h0],
    x: [false, h0],
    a: [f.addedMs, h0],
  };
  if (f.quantity !== null) regs.q = [f.quantity, h0];
  if (f.unit !== null) regs.u = [f.unit, h0];
  if (f.note !== null) regs.o = [f.note, h0];
  return delta({}, [{ id, regs, del: null }]);
}

/** Bewerken: alleen gewijzigde velden krijgen stamp(item). */
export function editItemDelta(item: ItemState, patch: Partial<Record<ItemField, unknown>>, clock: HlcClock, pt: number): ListDelta {
  const h = clock.stamp(pt, itemMaxHlc(item));
  const regs: MutableRegs = {};
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) regs[k] = [v, h] as Register;
  return delta({}, [{ id: item.id, regs, del: null }]);
}

export function deleteItemDelta(item: ItemState, clock: HlcClock, pt: number): ListDelta {
  const h = clock.stamp(pt, itemMaxHlc(item));
  return delta({}, [{ id: item.id, regs: {}, del: h }]);
}

/** Herstellen (undo, F-07): r = [true, stamp(item)] > del, dus het item leeft weer met de oude waarden. */
export function restoreItemDelta(item: ItemState, clock: HlcClock, pt: number): ListDelta {
  const h = clock.stamp(pt, itemMaxHlc(item));
  return delta({}, [{ id: item.id, regs: { r: [true, h] }, del: null }]);
}

export function renameListDelta(list: ListState, name: string, clock: HlcClock, pt: number): ListDelta {
  const h = clock.stamp(pt, listRegsMaxHlc(list));
  return delta({ n: [name, h] }, []);
}

export function deleteListDelta(list: ListState, clock: HlcClock, pt: number): ListDelta {
  const h = clock.stamp(pt, listRegsMaxHlc(list));
  return delta({ D: [true, h] }, []);
}

export function createListDelta(name: string, clock: HlcClock, pt: number): ListDelta {
  return delta({ n: [name, clock.now(pt)] }, []);
}

/** Maximale HLC in een delta (voor clock.observe). */
export function deltaMaxHlc(d: ListDelta): Hlc | null {
  let m: Hlc | null = listRegsMaxHlc(d);
  for (const it of d.items.values()) {
    const h = itemMaxHlc(it);
    if (h && (!m || h > m)) m = h;
  }
  return m;
}
