import { findDuplicate, increasedQuantity } from './duplicate';
import { createItemDelta, deleteItemDelta, editItemDelta } from './ops';
import { emptyList, mergeList } from './crdt/list';
import { formatHlc, HlcClock } from './hlc';

const N = '0000000000000001';
const T = 1_700_000_000_000;

describe('F-17 (core): dubbel-detectie', () => {
  it('F-17: levend, niet-afgevinkt item met dezelfde genormaliseerde naam wordt gevonden', () => {
    const l = mergeList(emptyList(), createItemDelta('AAAAAAAAAAAAAAAA', { name: 'Melk', quantity: null, unit: null, note: null, category: 'zuivel-eieren', addedMs: T }, formatHlc(T, 0, N)));
    expect(findDuplicate(l, ' melk ')).toBe('AAAAAAAAAAAAAAAA');
    expect(findDuplicate(l, 'MÉLK')).toBe('AAAAAAAAAAAAAAAA');
    expect(findDuplicate(l, 'kaas')).toBeNull();
    expect(findDuplicate(l, '')).toBeNull();
  });

  it('F-17: afgevinkte of verwijderde items tellen niet als dubbel', () => {
    let l = mergeList(emptyList(), createItemDelta('AAAAAAAAAAAAAAAA', { name: 'melk', quantity: null, unit: null, note: null, category: 'zuivel-eieren', addedMs: T }, formatHlc(T, 0, N)));
    const clk = new HlcClock(N);
    const checked = mergeList(l, editItemDelta(l.items.get('AAAAAAAAAAAAAAAA')!, { x: true }, clk, T + 1));
    expect(findDuplicate(checked, 'melk')).toBeNull();
    l = mergeList(l, deleteItemDelta(l.items.get('AAAAAAAAAAAAAAAA')!, clk, T + 2));
    expect(findDuplicate(l, 'melk')).toBeNull();
  });

  it('F-17: "Hoeveelheid verhogen" doet q := (q ?? 1) + (nieuw ?? 1)', () => {
    expect(increasedQuantity(null, null)).toBe(2);
    expect(increasedQuantity(2, 3)).toBe(5);
    expect(increasedQuantity(null, 4)).toBe(5);
    expect(increasedQuantity(3, undefined)).toBe(4);
  });
});
