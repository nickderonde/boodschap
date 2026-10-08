import { checkedCount, formatQuantity, itemSubtitle, progressFraction, progressText, sortLists } from './selectors';
import { materialize } from '../core/crdt/materialize';
import { createItemDelta, editItemDelta } from '../core/ops';
import { emptyList, mergeList } from '../core/crdt/list';
import { formatHlc, HlcClock } from '../core/hlc';

const N = '0000000000000001';
const T = 1_759_740_000_000;

describe('UX-10: voortgang "x van y afgevinkt"', () => {
  it('UX-10: telling klopt, ook na een merge van de partner', () => {
    let l = emptyList();
    l = mergeList(l, createItemDelta('AAAAAAAAAAAAAAAA', { name: 'melk', quantity: null, unit: null, note: null, category: 'zuivel-eieren', addedMs: T }, formatHlc(T, 0, N)));
    l = mergeList(l, createItemDelta('BBBBBBBBBBBBBBBB', { name: 'brood', quantity: null, unit: null, note: null, category: 'brood-gebak', addedMs: T }, formatHlc(T, 1, N)));
    expect(progressText(materialize(l))).toBe('0 van 2 afgevinkt');
    // de partner vinkt melk af (merge)
    const partner = editItemDelta(l.items.get('AAAAAAAAAAAAAAAA')!, { x: true }, new HlcClock('0000000000000002'), T + 10);
    const v = materialize(mergeList(l, partner));
    expect(progressText(v)).toBe('1 van 2 afgevinkt');
    expect(checkedCount(v)).toBe(1);
    expect(progressFraction(v)).toBe(0.5);
    expect(progressText({ checkedCount: 0, total: 0 })).toBe('Nog leeg');
    expect(progressFraction({ checkedCount: 0, total: 0 })).toBe(0);
  });

  it('weergavehulpen: hoeveelheid, eenheid en notitie', () => {
    expect(itemSubtitle({ quantity: 2, unit: null, note: null })).toBe('2');
    expect(itemSubtitle({ quantity: 1.5, unit: 'kg', note: 'jong' })).toBe('1,5 kg · jong');
    expect(itemSubtitle({ quantity: null, unit: 'pak', note: null })).toBe('pak');
    expect(itemSubtitle({ quantity: null, unit: null, note: null })).toBe('');
    expect(formatQuantity(0.25)).toBe('0,25');
    expect(sortLists([{ id: 'b', position: 2 } as never, { id: 'a', position: 1 } as never]).map((l: { id: string }) => l.id)).toEqual(['a', 'b']);
  });
});
