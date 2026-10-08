// S-07 (sync-deel) en F-07 op twee apparaten: R-DEL-scenario's, elk met beide leveringsvolgordes, convergerend.
import { addDevice, makeWorld, names, shareAndJoin } from '../sim/hub';
import { canonicalList } from '../../src/core/canonical';
import type { TestDevice } from '../sim/device';

type Step = (ctx: { a: TestDevice; b: TestDevice; la: string; lb: string; id: string; adv: (ms: number) => Promise<void> }) => Promise<void> | void;

async function scenario(firstOnline: 'A' | 'B', steps: Step[]) {
  const w = await makeWorld();
  const a = await addDevice(w, 'A');
  const b = await addDevice(w, 'B');
  const ids = await shareAndJoin(w, a, [b]);
  const la = ids.get(a)!;
  const lb = ids.get(b)!;
  const r = a.app.addItem(la, { text: 'kaas' }).result;
  if (r.kind !== 'added') throw new Error();
  await w.settle(10_000);
  a.net.online(false);
  b.net.online(false);
  await w.settle(1_000);
  const adv = (ms: number) => w.sched.advance(ms);
  for (const s of steps) await s({ a, b, la, lb, id: r.itemId, adv });
  const [x, y] = firstOnline === 'A' ? [a, b] : [b, a];
  x.net.online(true);
  await w.settle(30_000);
  y.net.online(true);
  await w.settle(60_000);
  expect(canonicalList(a.app.stateOf(la))).toBe(canonicalList(b.app.stateOf(lb)));
  return { a: names(a, la), b: names(b, lb), view: a.app.view(la) };
}

describe('S-07 / H-05: R-DEL op twee apparaten (hub), beide leveringsvolgordes', () => {
  for (const order of ['A', 'B'] as const) {
    it(`S-07a: A verwijdert, B bewerkte eerder → weg (eerst ${order} online)`, async () => {
      const r = await scenario(order, [({ b, lb, id }) => void b.app.updateItem(lb, id, { quantity: 2 }), ({ adv }) => adv(2_000), ({ a, la, id }) => void a.app.deleteItem(la, id)]);
      expect(r.a).toEqual([]);
    });
    it(`S-07b: A verwijdert, B bewerkt later → terug met B's wijziging (eerst ${order} online)`, async () => {
      const r = await scenario(order, [({ a, la, id }) => void a.app.deleteItem(la, id), ({ adv }) => adv(2_000), ({ b, lb, id }) => void b.app.updateItem(lb, id, { name: 'oude kaas' })]);
      expect(r.a).toEqual(['Oude kaas']);
    });
    it(`S-07c: beide verwijderen → weg (eerst ${order} online)`, async () => {
      const r = await scenario(order, [({ a, la, id }) => void a.app.deleteItem(la, id), ({ b, lb, id }) => void b.app.deleteItem(lb, id)]);
      expect(r.a).toEqual([]);
    });
    it(`S-07d: verwijderen + opnieuw toevoegen met dezelfde naam → nieuw item blijft (eerst ${order} online)`, async () => {
      const r = await scenario(order, [({ a, la, id }) => void a.app.deleteItem(la, id), ({ b, lb }) => void b.app.addItem(lb, { text: 'kaas' }, { force: true })]);
      expect(r.a).toEqual(['Kaas']);
    });
    it(`S-07e: A wist afgevinkte, B vinkte eerder af → weg (eerst ${order} online)`, async () => {
      const r = await scenario(order, [
        ({ a, la, id }) => void a.app.toggleChecked(la, id),
        ({ b, lb, id }) => void b.app.toggleChecked(lb, id),
        ({ adv }) => adv(2_000),
        ({ a, la }) => void a.app.clearChecked(la),
      ]);
      expect(r.a).toEqual([]);
    });
    it(`S-07f / F-07: herstel wint van de verwijdering op beide apparaten (eerst ${order} online)`, async () => {
      const r = await scenario(order, [
        async ({ a, la, id, adv }) => {
          const { result } = a.app.deleteItem(la, id);
          await adv(3_000);
          a.app.undo(result);
        },
      ]);
      expect(r.a).toEqual(['Kaas']);
      expect(r.b).toEqual(['Kaas']);
    });
  }
});
