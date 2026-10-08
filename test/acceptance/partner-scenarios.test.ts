// Acceptatietests (Eindtester): de echte scenario's van Nick en zijn vrouw, op gesimuleerde apparaten met virtuele tijd.
// Alleen publieke API's: facade (BootschapApp), harnas (createTestDevice/World), test-relays.
import { addDevice, makeWorld, shareAndJoin, type World } from '../sim/hub';
import type { TestDevice } from '../sim/device';
import { tmpDbFile } from '../support/single';
import { allItems, DAY, expectSameState, find, sortedNames } from './helpers';

const R4 = ['wss://relay-1.test', 'wss://relay-2.test', 'wss://relay-3.test', 'wss://relay-4.test'];

async function pair(opts: { relays?: string[]; offsets?: [number, number]; names?: [string, string]; dbFiles?: [string?, string?] } = {}) {
  const w = await makeWorld({ relays: opts.relays });
  const [na, nb] = opts.names ?? ['Vrouw', 'Nick'];
  const a = await addDevice(w, na, { clockOffsetMs: opts.offsets?.[0], dbFile: opts.dbFiles?.[0] });
  const b = await addDevice(w, nb, { clockOffsetMs: opts.offsets?.[1], dbFile: opts.dbFiles?.[1] });
  const ids = await shareAndJoin(w, a, [b]);
  return { w, a, b, ids, la: ids.get(a)!, lb: ids.get(b)! };
}

function mustAdd(d: TestDevice, listId: string, text: string): string {
  const r = d.app.addItem(listId, { text }, { force: true }).result;
  if (r.kind !== 'added') throw new Error('niet toegevoegd: ' + text);
  return r.itemId;
}

describe('S-08 / S-03 / H-02 / H-06: partner later online (relay als brievenbus)', () => {
  it('ET-S08-1: vrouw voegt 5 items toe terwijl Nick offline is; Nick komt online en ziet ze binnen 10 s, terwijl de vrouw inmiddels offline is', async () => {
    const { w, a: vrouw, b: nick, la, lb, ids } = await pair();
    nick.net.online(false);
    await w.settle(2_000);
    for (const n of ['Melk', 'Brood', 'Kaas', 'Appels', 'Koffie']) mustAdd(vrouw, la, n);
    await w.settle(15_000);
    expect(vrouw.app.syncStatus(la).pending).toBe(0); // S-17: bevestigd door minstens 1 relay
    expect(sortedNames(nick, lb)).toEqual([]); // Nick was echt offline
    vrouw.net.online(false); // de vrouw is nu weg
    await w.settle(2_000);
    nick.net.online(true);
    await w.settle(10_000);
    expect(sortedNames(nick, lb)).toEqual(['Appels', 'Brood', 'Kaas', 'Koffie', 'Melk']);
    await w.settle(60_000);
    vrouw.net.online(true);
    await w.settle(30_000);
    expectSameState([vrouw, nick], ids);
  });

  it('ET-S08-2: vrouw voegt 5 items toe en sluit direct de app (naar de achtergrond); Nick komt later online en ziet alles', async () => {
    const { w, a: vrouw, b: nick, la, lb } = await pair();
    nick.net.online(false);
    await w.settle(1_000);
    for (const n of ['Pasta', 'Tomaten', 'Ui', 'Knoflook', 'Olijfolie']) mustAdd(vrouw, la, n);
    const closing = vrouw.app.background(); // app weg uit beeld: flush + max 2 s wachten op acks
    await w.settle(5_000);
    await closing;
    vrouw.net.online(false);
    await w.settle(30_000);
    nick.net.online(true);
    await w.settle(10_000);
    expect(sortedNames(nick, lb)).toEqual(['Knoflook', 'Olijfolie', 'Pasta', 'Tomaten', 'Ui']);
  });

  it('ET-S08-3: Nick is 50 wijzigingen en 7 dagen (gesimuleerde klok) offline; daarna gelijk', async () => {
    const { w, a, b, la, lb, ids } = await pair();
    b.net.online(false);
    for (let i = 0; i < 50; i++) {
      mustAdd(a, la, `Wijziging ${i}`);
      await w.settle(300);
    }
    await w.settle(20_000);
    a.net.online(false);
    for (let d = 0; d < 7; d++) await w.settle(DAY);
    b.net.online(true);
    await w.settle(10_000);
    expect(sortedNames(b, lb)).toHaveLength(50);
    a.net.online(true);
    await w.settle(30_000);
    expectSameState([a, b], ids);
  }, 120_000);

  it('ET-S03-1: offline wijzigingen over meerdere app-sessies (twee herstarts) gaan automatisch binnen 10 s na herstel van verbinding', async () => {
    const { w, a, b, la, lb, ids } = await pair({ dbFiles: [tmpDbFile('a'), undefined] });
    a.net.online(false);
    mustAdd(a, la, 'Sessie 1');
    await a.app.flushWrites();
    await a.restart();
    mustAdd(a, la, 'Sessie 2');
    await a.app.flushWrites();
    await a.restart();
    mustAdd(a, la, 'Sessie 3');
    await a.app.flushWrites();
    await w.settle(60_000);
    expect(sortedNames(b, lb)).toEqual([]);
    expect(a.app.syncStatus(la).pending).toBeGreaterThan(0);
    a.net.online(true);
    await w.settle(10_000); // geen handeling van de gebruiker
    expect(sortedNames(b, lb)).toEqual(['Sessie 1', 'Sessie 2', 'Sessie 3']);
    await w.settle(10_000);
    expect(a.app.syncStatus(la).pending).toBe(0);
    expectSameState([a, b], ids);
  });
});

describe('S-04 / S-06 / H-03: beide offline, gelijktijdige wijzigingen', () => {
  async function conflict(first: 'A' | 'B', fa: (c: Ctx) => void, fb: (c: Ctx) => void, gapMs = 2_000) {
    const p = await pair();
    const id = mustAdd(p.a, p.la, 'Brood');
    await p.w.settle(20_000);
    expect(find(p.b, p.lb, 'Brood')).toBeDefined();
    const idB = find(p.b, p.lb, 'Brood')!.id;
    p.a.net.online(false);
    p.b.net.online(false);
    await p.w.settle(1_000);
    const ctx = { ...p, id, idB };
    fa(ctx);
    await p.w.settle(gapMs);
    fb(ctx);
    await p.w.settle(2_000);
    const [x, y] = first === 'A' ? [p.a, p.b] : [p.b, p.a];
    x.net.online(true);
    await p.w.settle(20_000);
    y.net.online(true);
    await p.w.settle(60_000);
    expectSameState([p.a, p.b], p.ids);
    return ctx;
  }
  type Ctx = { w: World; a: TestDevice; b: TestDevice; la: string; lb: string; id: string; idB: string };

  for (const first of ['A', 'B'] as const) {
    it(`ET-S04-1: A vinkt af en B past de hoeveelheid aan -> beide wijzigingen blijven (eerst ${first} online)`, async () => {
      const c = await conflict(first, ({ a, la, id }) => void a.app.toggleChecked(la, id), ({ b, lb, idB }) => void b.app.updateItem(lb, idB, { quantity: 3 }));
      for (const [d, l] of [[c.a, c.la], [c.b, c.lb]] as const) {
        const it = find(d, l, 'Brood')!;
        expect([d.name, it.checked, it.quantity]).toEqual([d.name, true, 3]);
      }
    });

    it(`ET-S06-1: zelfde veld gelijktijdig: de latere wijziging (hoogste HLC) wint op beide apparaten (eerst ${first} online)`, async () => {
      const c = await conflict(first, ({ a, la, id }) => void a.app.updateItem(la, id, { name: 'Volkorenbrood' }), ({ b, lb, idB }) => void b.app.updateItem(lb, idB, { name: 'Witbrood' }));
      expect(sortedNames(c.a, c.la)).toEqual(['Witbrood']);
      expect(sortedNames(c.b, c.lb)).toEqual(['Witbrood']);
    });

    it(`ET-S06-2: zelfde veld, omgekeerde volgorde in tijd: nu wint A (eerst ${first} online)`, async () => {
      const c = await conflict(first, ({ b, lb, idB }) => void b.app.updateItem(lb, idB, { quantity: 1 }), ({ a, la, id }) => void a.app.updateItem(la, id, { quantity: 9 }));
      expect(find(c.a, c.la, 'Brood')!.quantity).toBe(9);
      expect(find(c.b, c.lb, 'Brood')!.quantity).toBe(9);
    });
  }

  it('ET-S06-3: verschillende velden van hetzelfde item (naam, notitie, eenheid, categorie) blijven allemaal behouden', async () => {
    const c = await conflict(
      'A',
      ({ a, la, id }) => {
        a.app.updateItem(la, id, { name: 'Tarwebrood' });
        a.app.updateItem(la, id, { note: 'versgebakken' });
      },
      ({ b, lb, idB }) => {
        b.app.updateItem(lb, idB, { unit: 'stuks' });
        b.app.updateItem(lb, idB, { category: 'overig' });
      },
    );
    const it = find(c.b, c.lb, 'Tarwebrood')!;
    expect([it.note, it.unit, it.category]).toEqual(['versgebakken', 'stuks', 'overig']);
  });

  it('ET-S04-2: gelijktijdig dubbel toevoegen van hetzelfde product geeft twee items (toegestaan, sectie 3)', async () => {
    const { w, a, b, la, lb, ids } = await pair();
    a.net.online(false);
    b.net.online(false);
    mustAdd(a, la, 'Melk');
    mustAdd(b, lb, 'Melk');
    await w.settle(1_000);
    a.net.online(true);
    b.net.online(true);
    await w.settle(60_000);
    expect(sortedNames(a, la)).toEqual(['Melk', 'Melk']);
    expectSameState([a, b], ids);
  });
});

describe('S-07 / R-DEL / H-05: verwijderen versus gelijktijdig bewerken', () => {
  async function rdel(first: 'A' | 'B', steps: Array<(c: { w: World; a: TestDevice; b: TestDevice; la: string; lb: string; ia: string; ib: string }) => void | Promise<void>>) {
    const p = await pair();
    const ia = mustAdd(p.a, p.la, 'Kaas');
    await p.w.settle(20_000);
    const ib = find(p.b, p.lb, 'Kaas')!.id;
    p.a.net.online(false);
    p.b.net.online(false);
    await p.w.settle(1_000);
    for (const s of steps) {
      await s({ w: p.w, a: p.a, b: p.b, la: p.la, lb: p.lb, ia, ib });
      await p.w.settle(2_000);
    }
    const [x, y] = first === 'A' ? [p.a, p.b] : [p.b, p.a];
    x.net.online(true);
    await p.w.settle(20_000);
    y.net.online(true);
    await p.w.settle(60_000);
    expectSameState([p.a, p.b], p.ids);
    return p;
  }

  for (const first of ['A', 'B'] as const) {
    it(`ET-S07-1: B bewerkt EERDER dan A verwijdert -> item weg op beide (H-05 omgekeerd; eerst ${first} online)`, async () => {
      const p = await rdel(first, [({ b, lb, ib }) => void b.app.updateItem(lb, ib, { quantity: 2 }), ({ a, la, ia }) => void a.app.deleteItem(la, ia)]);
      expect(sortedNames(p.a, p.la)).toEqual([]);
      expect(sortedNames(p.b, p.lb)).toEqual([]);
    });

    it(`ET-S07-2: B bewerkt LATER dan A verwijdert -> kaas terug met B's wijziging op beide (H-05; eerst ${first} online)`, async () => {
      const p = await rdel(first, [({ a, la, ia }) => void a.app.deleteItem(la, ia), ({ b, lb, ib }) => void b.app.updateItem(lb, ib, { name: 'Oude kaas', quantity: 4 })]);
      for (const [d, l] of [[p.a, p.la], [p.b, p.lb]] as const) {
        const it = find(d, l, 'Oude kaas');
        expect([d.name, it?.quantity]).toEqual([d.name, 4]);
      }
    });

    it(`ET-S07-3: B vinkt LATER af dan A verwijdert -> kaas terug en afgevinkt (eerst ${first} online)`, async () => {
      const p = await rdel(first, [({ a, la, ia }) => void a.app.deleteItem(la, ia), ({ b, lb, ib }) => void b.app.toggleChecked(lb, ib)]);
      expect(find(p.a, p.la, 'Kaas')?.checked).toBe(true);
      expect(find(p.b, p.lb, 'Kaas')?.checked).toBe(true);
    });

    it(`ET-S07-4: beide verwijderen -> weg; en daarna een nieuw item met dezelfde naam blijft (eerst ${first} online)`, async () => {
      const p = await rdel(first, [({ a, la, ia }) => void a.app.deleteItem(la, ia), ({ b, lb, ib }) => void b.app.deleteItem(lb, ib), ({ b, lb }) => void mustAdd(b, lb, 'Kaas')]);
      expect(sortedNames(p.a, p.la)).toEqual(['Kaas']);
      expect(sortedNames(p.b, p.lb)).toEqual(['Kaas']);
    });

    it(`ET-S07-5: A wist afgevinkte items, B vinkt het item LATER weer uit (ontvinkt) -> item herleeft ongevinkt (eerst ${first} online)`, async () => {
      // B vinkt eerst af (gesynct), A wist afgevinkte, daarna ontvinkt B (hogere HLC dan de verwijdering).
      const p = await pair();
      mustAdd(p.a, p.la, 'Kaas');
      await p.w.settle(10_000);
      const ib = find(p.b, p.lb, 'Kaas')!.id;
      p.b.app.toggleChecked(p.lb, ib);
      await p.w.settle(10_000);
      p.a.net.online(false);
      p.b.net.online(false);
      await p.w.settle(1_000);
      p.a.app.clearChecked(p.la);
      await p.w.settle(2_000);
      p.b.app.toggleChecked(p.lb, ib);
      await p.w.settle(2_000);
      const [x, y] = first === 'A' ? [p.a, p.b] : [p.b, p.a];
      x.net.online(true);
      await p.w.settle(20_000);
      y.net.online(true);
      await p.w.settle(60_000);
      expectSameState([p.a, p.b], p.ids);
      expect(find(p.a, p.la, 'Kaas')?.checked).toBe(false);
    });

    it(`ET-S07-6: F-07 herstel (ongedaan maken) wint van de verwijdering op beide apparaten (eerst ${first} online)`, async () => {
      const p = await rdel(first, [
        async ({ w, a, la, ia }) => {
          const tok = a.app.deleteItem(la, ia).result;
          await w.settle(3_000);
          a.app.undo(tok);
        },
      ]);
      expect(sortedNames(p.a, p.la)).toEqual(['Kaas']);
      expect(sortedNames(p.b, p.lb)).toEqual(['Kaas']);
    });
  }
});
