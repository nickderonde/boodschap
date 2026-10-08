// Invariant §5.5 (v1.0, D-32): een ItemState (en de registers van een lijst) wordt nooit in-place gewijzigd.
// Controle: van elke oude staat wordt de inhoud van elk object vastgelegd; na alle verdere operaties moeten die oude
// objecten nog exact hetzelfde zijn. (Object.freeze is hier onbruikbaar: de getranspileerde bron draait niet in
// strict mode, dus een schrijfactie op een bevroren object zou stil genegeerd worden.)
// Daarnaast dwingt het type `Regs = Readonly<…>` de invariant af tijdens het compileren (`MutableRegs` alleen voor
// het opbouwen van nieuwe objecten).
import fc from 'fast-check';
import { listArb } from '../support/arbitraries';
import { mergeList } from '../../src/core/crdt/list';
import { materialize } from '../../src/core/crdt/materialize';
import { canonicalJSON, canonicalList } from '../../src/core/canonical';
import { splitShards } from '../../src/core/codec/shard';
import { decodeShard, encodeShard, PayloadError } from '../../src/core/codec/snapshot';
import { deleteItemDelta, editItemDelta, restoreItemDelta } from '../../src/core/ops';
import { HlcClock } from '../../src/core/hlc';
import { addDevice, makeWorld, names, shareAndJoin } from '../sim/hub';
import type { ItemState, ListState, Regs } from '../../src/core/types';
import type { TestDevice } from '../sim/device';

type Snap = { read: () => string; json: string };

/** Legt van een staat elk object afzonderlijk vast (lijstregisters en elk ItemState) met zijn huidige inhoud. */
function snapshot(l: ListState): Snap[] {
  const out: Snap[] = [];
  const regs: Regs = l.regs;
  const r = () => canonicalJSON(regs);
  out.push({ read: r, json: r() });
  for (const it of l.items.values()) {
    const item: ItemState = it;
    const f = () => canonicalJSON({ id: item.id, regs: item.regs, del: item.del });
    out.push({ read: f, json: f() });
  }
  return out;
}

const unchanged = (snaps: Snap[]) => snaps.every((s) => s.read() === s.json);

describe('Invariant §5.5: ItemState is onveranderlijk', () => {
  it('core: merge, materialize, opsplitsen, codec en ops wijzigen hun invoer nooit', () => {
    const clk = new HlcClock('00000000000000aa');
    fc.assert(
      fc.property(listArb, listArb, (a, b) => {
        const sa = snapshot(a);
        const sb = snapshot(b);
        const m = mergeList(a, b);
        const sm = snapshot(m);
        materialize(m);
        canonicalList(m);
        for (const part of splitShards(m, 4)) {
          try {
            decodeShard(encodeShard(part, { dev: 'x', rev: 1, shard: 0, shardCount: 4 }));
          } catch (e) {
            if (!(e instanceof PayloadError)) throw e; // de generator maakt ook waarden die de codec terecht weigert
          }
        }
        for (const it of m.items.values()) {
          mergeList(m, editItemDelta(it, { x: true, n: 'kaas' }, clk, 1_759_740_000_000));
          mergeList(m, deleteItemDelta(it, clk, 1_759_740_000_001));
          mergeList(m, restoreItemDelta(it, clk, 1_759_740_000_002));
        }
        mergeList(mergeList(m, b), a);
        mergeList(b, a);
        return unchanged(sa) && unchanged(sb) && unchanged(sm);
      }),
      { numRuns: 300, seed: 20261006 },
    );
  });

  it("facade + sync: oude cache-staten blijven ongewijzigd over commando's, remote merges, undo en herstart heen", async () => {
    const w = await makeWorld();
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B');
    const ids = await shareAndJoin(w, a, [b]);
    const la = ids.get(a)!;
    const lb = ids.get(b)!;
    const taken: Snap[] = [];
    const take = () => {
      for (const d of [a, b] as TestDevice[]) taken.push(...snapshot(d.app.stateOf(ids.get(d)!)));
    };
    take();
    const r = a.app.addItem(la, { text: 'melk' }).result;
    if (r.kind !== 'added') throw new Error();
    a.app.addItem(la, { text: 'brood' });
    await w.settle(10_000);
    take();
    b.app.updateItem(lb, r.itemId, { quantity: 2, note: 'halfvol' });
    a.app.toggleChecked(la, r.itemId);
    await w.settle(10_000);
    take();
    const { result: tok } = a.app.clearChecked(la);
    await w.settle(1_000);
    take();
    a.app.undo(tok);
    a.app.renameList(la, 'Weekend');
    await w.settle(10_000);
    take();
    b.app.deleteItem(lb, r.itemId);
    await w.settle(10_000);
    take();
    await a.restart();
    await w.settle(10_000);
    take();
    const k = a.app.addItem(la, { text: 'kaas' }).result;
    if (k.kind === 'added') a.app.increaseQuantity(la, k.itemId);
    await w.settle(10_000);
    expect(unchanged(taken)).toBe(true);
    expect(names(a, la)).toEqual(names(b, lb));
    expect(names(b, lb)).toEqual(['brood', 'kaas']);
  });
});
