import { formatHlc, HlcClock } from '../hlc';
import { createItemDelta, editItemDelta } from '../ops';
import { canonicalList } from '../canonical';
import { emptyList, mergeList, isListDeleted, listName } from './list';
import { mergeRegister, compareRegister, maxRegHlc } from './register';
import { materialize } from './materialize';
import type { ListState } from '../types';

const NA = '000000000000000a';
const NB = '000000000000000b';
const T = 1_700_000_000_000;
const ID = 'AAAAAAAAAAAAAAAA';

function base(): ListState {
  return mergeList(emptyList(), createItemDelta(ID, { name: 'brood', quantity: 1, unit: null, note: null, category: 'brood-gebak', addedMs: T }, formatHlc(T, 0, NA)));
}

describe('S-06: veldregel (LWW per veld) deterministisch', () => {
  it('S-06: gelijktijdig zelfde veld → hoogste HLC wint, in beide aankomstvolgordes', () => {
    const s = base();
    const a = new HlcClock(NA);
    const b = new HlcClock(NB);
    const da = editItemDelta(s.items.get(ID)!, { n: 'volkorenbrood' }, a, T + 10);
    const db = editItemDelta(s.items.get(ID)!, { n: 'witbrood' }, b, T + 20);
    const ab = mergeList(mergeList(s, da), db);
    const ba = mergeList(mergeList(s, db), da);
    expect(canonicalList(ab)).toBe(canonicalList(ba));
    expect(ab.items.get(ID)!.regs.n[0]).toBe('witbrood');
  });

  it('S-06: gelijke (ms, c) → hoogste apparaat-ID wint', () => {
    const s = base();
    const da = { regs: {}, items: new Map([[ID, { id: ID, regs: { n: ['A-naam', formatHlc(T + 5, 0, NA)] as [unknown, string] }, del: null }]]) };
    const db = { regs: {}, items: new Map([[ID, { id: ID, regs: { n: ['B-naam', formatHlc(T + 5, 0, NB)] as [unknown, string] }, del: null }]]) };
    expect(mergeList(mergeList(s, da), db).items.get(ID)!.regs.n[0]).toBe('B-naam');
    expect(mergeList(mergeList(s, db), da).items.get(ID)!.regs.n[0]).toBe('B-naam');
  });

  it('S-06 / H-03: verschillende velden van hetzelfde item blijven allebei behouden', () => {
    const s = base();
    const a = new HlcClock(NA);
    const b = new HlcClock(NB);
    const da = editItemDelta(s.items.get(ID)!, { n: 'volkorenbrood' }, a, T + 10);
    const db = editItemDelta(s.items.get(ID)!, { q: 3 }, b, T + 5);
    for (const m of [mergeList(mergeList(s, da), db), mergeList(mergeList(s, db), da)]) {
      const v = materialize(m).sections[0].items[0];
      expect(v.name).toBe('volkorenbrood');
      expect(v.quantity).toBe(3);
    }
  });

  it('registermerge is totaal: gelijke HLC → grootste canonieke waarde', () => {
    const h = formatHlc(T, 0, NA);
    expect(mergeRegister(['a', h], ['b', h])).toEqual(['b', h]);
    expect(mergeRegister(['b', h], ['a', h])).toEqual(['b', h]);
    expect(compareRegister(['a', h], ['a', h])).toBe(0);
    expect(mergeRegister(undefined, ['a', h])).toEqual(['a', h]);
    expect(maxRegHlc({})).toBeNull();
  });

  it('lijstregisters: naam en D (lijst verwijderd wint altijd)', () => {
    const h = formatHlc(T, 0, NA);
    const l = mergeList(emptyList(), { regs: { n: ['Weekend', h] }, items: new Map() });
    expect(listName(l)).toBe('Weekend');
    expect(isListDeleted(l)).toBe(false);
    const d = mergeList(l, { regs: { D: [true, formatHlc(T - 100, 0, NB)] }, items: new Map() });
    expect(isListDeleted(d)).toBe(true);
    expect(materialize(d).deleted).toBe(true);
    expect(materialize(emptyList()).name).toBe('Gedeelde lijst');
  });
});
