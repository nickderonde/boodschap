// fast-check-arbitraries voor CRDT-staten (S-05, S-11).
import fc from 'fast-check';
import { formatHlc } from '../../src/core/hlc';
import type { ItemState, ListState, MutableRegs, Register, Regs } from '../../src/core/types';

export const NODES = ['0000000000000001', '0000000000000002', '0000000000000003'];
const ITEM_IDS = ['AAAAAAAAAAAAAAAA', 'BBBBBBBBBBBBBBBB', 'CCCCCCCCCCCCCCCC', 'DDDDDDDDDDDDDDDD'];

export const hlcArb = fc
  .tuple(fc.integer({ min: 0, max: 5 }), fc.integer({ min: 0, max: 2 }), fc.constantFrom(...NODES))
  .map(([ms, c, n]) => formatHlc(1_700_000_000_000 + ms, c, n));

const valueArb = fc.oneof(fc.constantFrom('melk', 'brood', 'kaas'), fc.boolean(), fc.integer({ min: 0, max: 3 }), fc.constant(null));

export const regsArb: fc.Arbitrary<Regs> = fc
  .dictionary(fc.constantFrom('n', 'q', 'x', 'k', 'zz'), fc.tuple(valueArb, hlcArb))
  .map((d) => {
    const out: MutableRegs = {};
    for (const k of Object.keys(d)) out[k] = d[k] as Register;
    return out;
  });

export const itemArb = (id: string): fc.Arbitrary<ItemState> =>
  fc.record({ regs: regsArb, del: fc.option(hlcArb, { nil: null }) }).map((r) => ({ id, regs: r.regs, del: r.del }));

export const listArb: fc.Arbitrary<ListState> = fc
  .record({
    regs: fc.dictionary(fc.constantFrom('n', 'D', 'zz'), fc.tuple(valueArb, hlcArb)),
    ids: fc.subarray(ITEM_IDS),
  })
  .chain(({ regs, ids }) =>
    fc.tuple(...ids.map((id) => itemArb(id))).map((items) => {
      const r: MutableRegs = {};
      for (const k of Object.keys(regs)) r[k] = regs[k] as Register;
      return { regs: r, items: new Map(items.map((i) => [i.id, i])) } as ListState;
    }),
  );
