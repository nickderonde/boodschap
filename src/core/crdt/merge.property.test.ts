import fc from 'fast-check';
import { canonicalList } from '../canonical';
import { mergeList } from './list';
import { listArb } from '../../../test/support/arbitraries';

const numRuns = Number(process.env.SEEDS ?? 200);
const seed = Number(process.env.SEED ?? 20261006);
const eq = (a: Parameters<typeof canonicalList>[0], b: Parameters<typeof canonicalList>[0]) => expect(canonicalList(a)).toBe(canonicalList(b));

describe('S-05: CRDT-eigenschappen van merge (property-tests, incl. tombstones)', () => {
  it('S-05: commutatief — merge(a,b) = merge(b,a)', () => {
    fc.assert(fc.property(listArb, listArb, (a, b) => eq(mergeList(a, b), mergeList(b, a))), { numRuns, seed });
  });

  it('S-05: associatief — merge(merge(a,b),c) = merge(a,merge(b,c))', () => {
    fc.assert(
      fc.property(listArb, listArb, listArb, (a, b, c) => eq(mergeList(mergeList(a, b), c), mergeList(a, mergeList(b, c)))),
      { numRuns, seed },
    );
  });

  it('S-05: idempotent — merge(a,a) = a', () => {
    fc.assert(fc.property(listArb, (a) => eq(mergeList(a, a), a)), { numRuns, seed });
  });

  it('S-11 (core): duplicaten, herhaling, volgorde en replay van oude staten veranderen de uitkomst niet', () => {
    fc.assert(
      fc.property(fc.array(listArb, { minLength: 1, maxLength: 6 }), fc.integer({ min: 0, max: 1000 }), (msgs, salt) => {
        const empty = { regs: {}, items: new Map() };
        const once = msgs.reduce(mergeList, empty);
        // 1×, 2×, 10×, omgekeerd en geschud; plus replay van een oudere deelstaat.
        const twice = [...msgs, ...msgs].reduce(mergeList, empty);
        const tenfold = Array.from({ length: 10 }, () => msgs).flat().reduce(mergeList, empty);
        const reversed = [...msgs].reverse().reduce(mergeList, empty);
        const shuffled = [...msgs].sort((x, y) => ((canonicalList(x).length * 31 + salt) % 7) - ((canonicalList(y).length * 17 + salt) % 7)).reduce(mergeList, empty);
        const replay = mergeList(once, msgs[0]);
        eq(twice, once);
        eq(tenfold, once);
        eq(reversed, once);
        eq(shuffled, once);
        eq(replay, once);
      }),
      { numRuns, seed },
    );
  });

  it('merge geeft dezelfde referentie terug als er niets verandert (geen onnodige herpublicatie)', () => {
    fc.assert(
      fc.property(listArb, listArb, (a, b) => {
        const m = mergeList(a, b);
        expect(mergeList(m, b)).toBe(m);
        expect(mergeList(m, a)).toBe(m);
      }),
      { numRuns: 50, seed },
    );
  });
});
