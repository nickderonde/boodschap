import { sections, CHECKED_SECTION } from './sort';
import { formatHlc } from './hlc';
import type { ItemView } from './types';

const N = '0000000000000001';
const item = (id: string, category: string, ms: number, checked = false, name = id): ItemView => ({
  id, name, quantity: null, unit: null, note: null, category, checked, addedHlc: formatHlc(ms, 0, N),
});

describe('F-10: groeperen per categorie in vaste supermarktvolgorde', () => {
  it('F-10: volgorde van §8.1, lege categorieën verborgen, afgevinkt onderaan (F-03)', () => {
    const s = sections([
      item('d1', 'dranken', 1),
      item('g1', 'groente-fruit', 3),
      item('z1', 'zuivel-eieren', 2),
      item('g2', 'groente-fruit', 2, true),
      item('x1', 'onbekend-id', 1),
    ]);
    expect(s.map((x) => x.key)).toEqual(['groente-fruit', 'zuivel-eieren', 'dranken', 'overig', CHECKED_SECTION]);
    expect(s[s.length - 1].title).toBe('Afgevinkt');
    expect(s[s.length - 1].items.map((i) => i.id)).toEqual(['g2']);
  });

  it('F-10: binnen een categorie op toevoegtijd (HLC van aanmaken), gelijk → item-ID', () => {
    const s = sections([item('b', 'groente-fruit', 5), item('a', 'groente-fruit', 5), item('c', 'groente-fruit', 1)]);
    expect(s[0].items.map((i) => i.id)).toEqual(['c', 'a', 'b']);
  });

  it('F-03: afgevinkte sectie gesorteerd op categorie en daarna toevoegtijd', () => {
    const s = sections([item('d', 'dranken', 1, true), item('g', 'groente-fruit', 9, true), item('g0', 'groente-fruit', 2, true)]);
    expect(s).toHaveLength(1);
    expect(s[0].items.map((i) => i.id)).toEqual(['g0', 'g', 'd']);
  });

  it('lege lijst → geen secties', () => {
    expect(sections([])).toEqual([]);
  });
});
