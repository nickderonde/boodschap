import { formatHlc, HlcClock } from '../hlc';
import { createItemDelta, deleteItemDelta, editItemDelta, restoreItemDelta } from '../ops';
import { canonicalList } from '../canonical';
import { emptyList, mergeList } from './list';
import { isItemDeleted } from './item';
import { materialize } from './materialize';
import type { ListDelta, ListState } from '../types';

const NA = '000000000000000a';
const NB = '000000000000000b';
const T = 1_700_000_000_000;
const KAAS = 'KKKKKKKKKKKKKKKK';

function start(): ListState {
  return mergeList(emptyList(), createItemDelta(KAAS, { name: 'kaas', quantity: null, unit: null, note: null, category: 'vleeswaren-kaas', addedMs: T }, formatHlc(T, 0, NA)));
}

/** Past de deltas in beide volgordes toe en eist convergentie; geeft de gezamenlijke staat terug. */
function both(s: ListState, x: ListDelta, y: ListDelta): ListState {
  const xy = mergeList(mergeList(s, x), y);
  const yx = mergeList(mergeList(s, y), x);
  expect(canonicalList(xy)).toBe(canonicalList(yx));
  return xy;
}

const names = (s: ListState) => materialize(s).sections.flatMap((sec) => sec.items.map((i) => i.name));

describe('S-07: verwijderregel R-DEL (sectie 3), beide leveringsvolgordes', () => {
  it('S-07a: A verwijdert, B bewerkte eerder → item weg', () => {
    const s = start();
    const edit = editItemDelta(s.items.get(KAAS)!, { q: 2 }, new HlcClock(NB), T + 10);
    const del = deleteItemDelta(s.items.get(KAAS)!, new HlcClock(NA), T + 20);
    expect(names(both(s, del, edit))).toEqual([]);
  });

  it('S-07b: A verwijdert, B bewerkt later (hogere HLC) → item terug met B\'s wijziging', () => {
    const s = start();
    const del = deleteItemDelta(s.items.get(KAAS)!, new HlcClock(NA), T + 10);
    const edit = editItemDelta(s.items.get(KAAS)!, { n: 'oude kaas' }, new HlcClock(NB), T + 20);
    expect(names(both(s, del, edit))).toEqual(['oude kaas']);
    // Afvinken later dan de verwijdering zet het item ook terug.
    const check = editItemDelta(s.items.get(KAAS)!, { x: true }, new HlcClock(NB), T + 30);
    const r = both(s, del, check);
    expect(materialize(r).checkedCount).toBe(1);
  });

  it('S-07c: beide verwijderen → item weg', () => {
    const s = start();
    const d1 = deleteItemDelta(s.items.get(KAAS)!, new HlcClock(NA), T + 10);
    const d2 = deleteItemDelta(s.items.get(KAAS)!, new HlcClock(NB), T + 11);
    expect(names(both(s, d1, d2))).toEqual([]);
  });

  it('S-07d: verwijderen + opnieuw toevoegen met dezelfde naam → nieuw item blijft', () => {
    const s = start();
    const del = deleteItemDelta(s.items.get(KAAS)!, new HlcClock(NA), T + 10);
    const add = createItemDelta('NNNNNNNNNNNNNNNN', { name: 'kaas', quantity: null, unit: null, note: null, category: 'vleeswaren-kaas', addedMs: T }, formatHlc(T + 5, 0, NB));
    const r = both(s, del, add);
    expect(names(r)).toEqual(['kaas']);
    expect(isItemDeleted(r.items.get(KAAS)!)).toBe(true);
    expect(isItemDeleted(r.items.get('NNNNNNNNNNNNNNNN')!)).toBe(false);
  });

  it('S-07e: A wist afgevinkte items, B vinkte eerder af → weg', () => {
    let s = start();
    s = mergeList(s, editItemDelta(s.items.get(KAAS)!, { x: true }, new HlcClock(NA), T + 5));
    const bCheck = editItemDelta(s.items.get(KAAS)!, { x: true }, new HlcClock(NB), T + 8);
    const aClear = deleteItemDelta(s.items.get(KAAS)!, new HlcClock(NA), T + 20);
    expect(names(both(s, aClear, bCheck))).toEqual([]);
  });

  it('S-07f: herstel (F-07) wint van de verwijdering op beide apparaten, met exact de oude waarden', () => {
    const s = start();
    const clk = new HlcClock(NA);
    const del = deleteItemDelta(s.items.get(KAAS)!, clk, T + 10);
    const afterDel = mergeList(s, del);
    const undo = restoreItemDelta(afterDel.items.get(KAAS)!, clk, T + 11);
    const r = both(afterDel, undo, del);
    expect(names(r)).toEqual(['kaas']);
    expect(materialize(r).sections[0].items[0].category).toBe('vleeswaren-kaas');
  });

  it('S-07 / S-16: een tombstone met een HLC in de toekomst wordt overruled door de volgende lokale schrijfactie', () => {
    const s = start();
    const farDel: ListDelta = { regs: {}, items: new Map([[KAAS, { id: KAAS, regs: {}, del: formatHlc(T + 3_600_000, 0, NB) }]]) };
    const s2 = mergeList(s, farDel);
    expect(names(s2)).toEqual([]);
    const edit = editItemDelta(s2.items.get(KAAS)!, { x: true }, new HlcClock(NA), T + 1);
    expect(names(mergeList(s2, edit))).toEqual(['kaas']);
  });
});
