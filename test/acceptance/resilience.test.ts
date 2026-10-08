// Acceptatietests (Eindtester): crash/kill, relay-uitval en -dataverlies, drie apparaten, klokafwijking, grote lijst,
// delen/koppelen. Hub met virtuele tijd; alleen publieke API's (facade, harnas, test-relays).
import { addDevice, makeWorld, shareAndJoin } from '../sim/hub';
import type { TestDevice } from '../sim/device';
import type { MemoryRelay } from '../../src/sync/transports/memory/MemoryHub';
import { tmpDbFile } from '../support/single';
import { allItems, expectSameState, find, HOUR, lcgWords, sortedNames } from './helpers';

const R4 = ['wss://relay-1.test', 'wss://relay-2.test', 'wss://relay-3.test', 'wss://relay-4.test'];

function mustAdd(d: TestDevice, listId: string, text: string): string {
  const r = d.app.addItem(listId, { text }, { force: true }).result;
  if (r.kind !== 'added') throw new Error('niet toegevoegd: ' + text);
  return r.itemId;
}

describe('S-02 / H-04: app gekilld direct na een wijziging en herstart', () => {
  it('ET-S02-1: bevestigde wijzigingen overleven een kill; ze komen na herstart alsnog bij de partner (offline gewijzigd)', async () => {
    const w = await makeWorld();
    const a = await addDevice(w, 'A', { dbFile: tmpDbFile('a') });
    const b = await addDevice(w, 'B');
    const ids = await shareAndJoin(w, a, [b]);
    const la = ids.get(a)!;
    a.net.online(false); // vliegtuigmodus, zoals H-04
    const confirmed: string[] = [];
    for (const n of ['kill-1', 'kill-2', 'kill-3']) {
      const r = a.app.addItem(la, { text: n });
      await r.committed; // bevestigd aan de UI
      confirmed.push(n);
    }
    a.kill(); // direct gekilld
    await a.restart();
    expect(sortedNames(a, la)).toEqual(confirmed); // niet weg
    expect(sortedNames(b, ids.get(b)!)).toEqual([]);
    a.net.online(true);
    await w.settle(30_000);
    expect(sortedNames(b, ids.get(b)!)).toEqual(confirmed);
    expectSameState([a, b], ids);
  });

  for (const stmts of [3, 9, 17]) {
    it(`ET-S02-2: kill midden in een transactie (na ${stmts} SQL-statements) terwijl er wijzigingen binnenkomen: wat bevestigd was, is er na herstart en komt aan; de staat is niet corrupt`, async () => {
      const w = await makeWorld();
      const a = await addDevice(w, 'A', { dbFile: tmpDbFile('a') });
      const b = await addDevice(w, 'B');
      const ids = await shareAndJoin(w, a, [b]);
      const la = ids.get(a)!;
      a.killSwitch.killAfterStatements = stmts;
      const confirmed: string[] = [];
      for (let i = 0; i < 12 && !a.killSwitch.killed; i++) {
        try {
          const r = a.app.addItem(la, { text: `artikel ${i}` });
          void r.committed.then(() => confirmed.push(`artikel ${i}`)).catch(() => {});
        } catch {
          break;
        }
        await w.settle(300);
      }
      await w.settle(5_000);
      expect(a.killSwitch.killed).toBe(true); // de kill is echt midden in het werk geraakt
      a.killSwitch.killAfterStatements = null;
      await a.restart();
      await w.settle(60_000);
      const after = sortedNames(a, la);
      for (const c of confirmed) expect(after).toContain(c);
      expect(sortedNames(b, ids.get(b)!)).toEqual(after);
      expectSameState([a, b], ids);
    });
  }

  for (const point of ['after-commit', 'after-prepare', 'after-persist', 'after-send'] as const) {
    it(`ET-S02-3: kill op het punt "${point}" tijdens het publiceren, daarna herstart -> alles aanwezig en bij de partner`, async () => {
      const w = await makeWorld();
      const a = await addDevice(w, 'A', { dbFile: tmpDbFile('a') });
      const b = await addDevice(w, 'B');
      const ids = await shareAndJoin(w, a, [b]);
      const la = ids.get(a)!;
      a.crashAt(point);
      const r = a.app.addItem(la, { text: `na ${point}` });
      void r.committed.catch(() => {}); // na de kill bevriest de zombie: niet erop wachten
      await w.settle(10_000);
      expect([point, a.killSwitch.killed]).toEqual([point, true]); // het punt is echt geraakt
      a.crashAt(null);
      await a.restart();
      await w.settle(60_000);
      expect(sortedNames(a, la)).toEqual([`na ${point}`]);
      expect(sortedNames(b, ids.get(b)!)).toEqual([`na ${point}`]);
      expectSameState([a, b], ids);
    });
  }
});

describe('S-09 / S-10 / S-11 / NF-02e: relay valt uit, gooit data weg of levert duplicaten', () => {
  async function trio() {
    const w = await makeWorld({ relays: R4 });
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B');
    const ids = await shareAndJoin(w, a, [b]);
    const relays = [...w.hub.relays.values()];
    return { w, a, b, ids, la: ids.get(a)!, lb: ids.get(b)!, relays };
  }
  async function activity(p: Awaited<ReturnType<typeof trio>>, extra?: () => Promise<void>) {
    const { w, a, b, la, lb } = p;
    a.net.online(false);
    for (const n of ['a1', 'a2', 'a3']) mustAdd(a, la, n);
    mustAdd(b, lb, 'b1');
    await w.settle(1_500);
    const shared = mustAdd(b, lb, 'gedeeld');
    await w.settle(1_500);
    a.net.online(true);
    await w.settle(3_000);
    if (extra) await extra();
    b.app.updateItem(lb, shared, { quantity: 4 });
    mustAdd(a, la, 'a4');
    await w.settle(60_000);
  }
  const expected = ['a1', 'a2', 'a3', 'a4', 'b1', 'gedeeld'];

  it('ET-S09-1: 1 van de 4 relays ligt er de hele tijd uit -> sync gewoon binnen normale tijd', async () => {
    const p = await trio();
    p.relays[0].setDown(true);
    await p.w.settle(1_000);
    mustAdd(p.a, p.la, 'tijdens-uitval');
    await p.w.settle(5_000); // S-12-orde: geen minuten
    expect(sortedNames(p.b, p.lb)).toContain('tijdens-uitval');
    await activity(p);
    expect(sortedNames(p.a, p.la)).toEqual([...expected, 'tijdens-uitval'].sort());
    expectSameState([p.a, p.b], p.ids);
  });

  it('ET-S09-2: 3 van de 4 relays weg: nog steeds bruikbaar en convergent; relays die terugkomen krijgen de staat alsnog', async () => {
    const p = await trio();
    for (const r of p.relays.slice(0, 3)) r.setDown(true);
    await p.w.settle(1_000);
    await activity(p);
    expectSameState([p.a, p.b], p.ids);
    for (const r of p.relays.slice(0, 3)) r.setDown(false);
    await p.w.settle(120_000);
    for (const r of p.relays) expect([r.name, r.all().length > 0]).toEqual([r.name, true]);
    expect(sortedNames(p.a, p.la)).toEqual(expected);
  });

  it('ET-S09-3: alle relays onbereikbaar: app blijft volledig bruikbaar, niets gaat verloren; na terugkeer van 1 relay convergeren de apparaten', async () => {
    const p = await trio();
    for (const r of p.relays) r.setDown(true);
    await p.w.settle(1_000);
    const errors: string[] = [];
    p.a.app.onError((e) => errors.push(e.code));
    p.b.app.onError((e) => errors.push(e.code));
    const id = mustAdd(p.a, p.la, 'zonder-relay');
    p.a.app.updateItem(p.la, id, { quantity: 2 });
    p.a.app.toggleChecked(p.la, id);
    mustAdd(p.b, p.lb, 'ook-zonder');
    await p.w.settle(10 * 60_000);
    expect(find(p.a, p.la, 'zonder-relay')?.checked).toBe(true);
    expect(['offline', 'fout', 'bezig']).toContain(p.a.app.syncStatus(p.la).kind);
    p.relays[2].setDown(false); // 1 relay komt terug
    await p.w.settle(5 * 60_000);
    expect(sortedNames(p.a, p.la)).toEqual(['ook-zonder', 'zonder-relay']);
    expectSameState([p.a, p.b], p.ids);
  });

  it('ET-S10-1: relay(s) herstarten zonder data (wipe) midden in het gebruik: alles convergeert, relays worden weer gevuld', async () => {
    const p = await trio();
    await activity(p, async () => {
      p.relays[0].wipe();
      p.relays[1].wipe();
    });
    await p.w.settle(180_000);
    expectSameState([p.a, p.b], p.ids);
    expect(sortedNames(p.a, p.la)).toEqual(expected);
    for (const r of p.relays.slice(0, 2)) expect([r.name, r.all().length > 0]).toEqual([r.name, true]);
  });

  it('ET-S10-2: ALLE relays raken tegelijk hun data kwijt: beide apparaten publiceren opnieuw en een later gekoppeld apparaat ziet alles', async () => {
    const p = await trio();
    await activity(p);
    for (const r of p.relays) {
      r.wipe();
      r.dropConnections(); // een herstart van de relay: verbinding weg, data weg
    }
    await p.w.settle(180_000);
    for (const r of p.relays) expect([r.name, r.all().length > 0]).toEqual([r.name, true]);
    const c = await addDevice(p.w, 'C');
    const info = await p.a.app.share(p.la);
    const j = await c.app.join(info.text);
    if (j.kind === 'error') throw new Error(j.code);
    p.a.net.online(false);
    p.b.net.online(false);
    await p.w.settle(60_000);
    expect(sortedNames(c, j.listId)).toEqual(expected);
  });

  // Was DEFECT D-ET-01 (minor, door de Engineer opgelost; de test.failing-markering is verwijderd): een relay die data kwijtraakt ZONDER de verbinding te verbreken (retentie/opschonen) wordt
  // ook na foreground() of pull-to-refresh (syncNow) niet gevuld; de eigen-staatcontrole (S-10) draait niet opnieuw.
  // Bij een gewone herstart van de relay (ET-S10-2) werkt het wel.
  it('ET-S10-4: relay wist data zonder verbinding te verbreken; pull-to-refresh (S-13/UX-13) moet de relay opnieuw vullen', async () => {
    const p = await trio();
    mustAdd(p.a, p.la, 'x');
    await p.w.settle(20_000);
    for (const r of p.relays) r.wipe();
    void p.a.app.syncNow();
    void p.b.app.syncNow();
    await p.w.settle(180_000);
    for (const r of p.relays) expect([r.name, r.all().length > 0]).toEqual([r.name, true]);
  });

  // Was DEFECT D-ET-05 (minor, S-03/S-17; door de Engineer opgelost): na een periode waarin alle relays elke publicatie weigeren
  // moet de app de wachtende wijziging vanzelf alsnog versturen, zonder handeling van de gebruiker.
  it('ET-S17-1: na een periode van weigeringen verstuurt de app de wachtende wijziging vanzelf, zonder handeling van de gebruiker', async () => {
    const p = await trio();
    await p.w.settle(5_000);
    for (const r of p.relays) r.faults.refuse = 'blocked:';
    mustAdd(p.a, p.la, 'melk');
    await p.w.settle(60_000);
    expect(p.a.app.syncStatus(p.la).kind).toBe('fout');
    for (const r of p.relays) r.faults.refuse = null;
    await p.w.settle(10 * 60_000);
    expect(p.a.app.syncStatus(p.la).pending).toBe(0);
    expect(sortedNames(p.b, p.lb)).toEqual(['melk']);
  });

  it('ET-S11-1: relay levert alles 10x dubbel, in willekeurige volgorde en met vertraging -> staat gelijk aan enkelvoudige levering', async () => {
    const p = await trio();
    for (const r of p.relays.slice(0, 3)) {
      r.faults.duplicate = 10;
      r.faults.reorder = true;
      r.faults.latencyMs = 400;
    }
    await activity(p);
    expect(sortedNames(p.a, p.la)).toEqual(expected);
    expectSameState([p.a, p.b], p.ids);
    expect(find(p.a, p.la, 'gedeeld')?.quantity).toBe(4);
  });

  it('ET-S10-3: relay laat events stil vallen (zoals nos.lol, geen OK) naast een gezonde relay -> convergeert', async () => {
    const p = await trio();
    p.relays[0].faults.silentDrop = true;
    p.relays[1].faults.silentDrop = true;
    await activity(p);
    expect(sortedNames(p.b, p.lb)).toEqual(expected);
    expectSameState([p.a, p.b], p.ids);
  });

  it('ET-S09-4: een flapperende relay (elke 2 s aan/uit) veroorzaakt geen verlies of dubbele staat', async () => {
    const p = await trio();
    const flap = async (r: MemoryRelay, times: number) => {
      for (let i = 0; i < times; i++) {
        r.setDown(i % 2 === 0);
        await p.w.settle(2_000);
      }
      r.setDown(false);
    };
    const t = flap(p.relays[0], 40);
    await activity(p);
    await t;
    await p.w.settle(60_000);
    expect(sortedNames(p.a, p.la)).toEqual(expected);
    expectSameState([p.a, p.b], p.ids);
  });

  it('ET-S09-5: alles tegelijk (1 uit, 1 stil, 1 dubbel+herordend, 1 wipe) -> convergeert', async () => {
    const p = await trio();
    p.relays[0].setDown(true);
    p.relays[1].faults.silentDrop = true;
    p.relays[2].faults.duplicate = 5;
    p.relays[2].faults.reorder = true;
    await activity(p, async () => p.relays[3].wipe());
    await p.w.settle(180_000);
    expect(sortedNames(p.a, p.la)).toEqual(expected);
    expectSameState([p.a, p.b], p.ids);
  });
});

describe('S-18 / F-16 / S-04: drie apparaten', () => {
  it('ET-S18-1: drie apparaten, alle offline, elk eigen items + conflicten op hetzelfde item + verwijderen -> één gelijke staat', async () => {
    const w = await makeWorld({ relays: R4 });
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B');
    const c = await addDevice(w, 'C');
    const ids = await shareAndJoin(w, a, [b, c]);
    const [la, lb, lc] = [a, b, c].map((d) => ids.get(d)!);
    mustAdd(a, la, 'brood');
    mustAdd(a, la, 'kaas');
    await w.settle(30_000);
    for (const d of [a, b, c]) d.net.online(false);
    await w.settle(1_000);
    const idOf = (d: TestDevice, l: string, n: string) => find(d, l, n)!.id;
    mustAdd(a, la, 'van A');
    a.app.updateItem(la, idOf(a, la, 'brood'), { quantity: 1 });
    await w.settle(1_500);
    mustAdd(b, lb, 'van B');
    b.app.updateItem(lb, idOf(b, lb, 'brood'), { quantity: 2, note: 'B-notitie' });
    b.app.deleteItem(lb, idOf(b, lb, 'kaas'));
    await w.settle(1_500);
    mustAdd(c, lc, 'van C');
    c.app.updateItem(lc, idOf(c, lc, 'brood'), { quantity: 3 });
    c.app.toggleChecked(lc, idOf(c, lc, 'kaas')); // later dan B's verwijdering? nee: eerder in tijd dan B? zie onder
    await w.settle(1_500);
    for (const d of [c, a, b]) {
      d.net.online(true);
      await w.settle(7_000);
    }
    await w.settle(120_000);
    expectSameState([a, b, c], ids);
    expect(sortedNames(a, la)).toEqual(expect.arrayContaining(['van A', 'van B', 'van C', 'brood']));
    expect(find(a, la, 'brood')?.quantity).toBe(3); // C schreef als laatste
    expect(find(a, la, 'brood')?.note).toBe('B-notitie');
    // C's afvinken (later dan B's verwijdering) laat kaas herleven (R-DEL)
    expect(find(a, la, 'kaas')?.checked).toBe(true);
  });

  it('ET-S18-2: derde apparaat koppelt terwijl de rest offline is en ziet de hele lijst; daarna convergentie met één 1 uur voorlopende klok', async () => {
    const w = await makeWorld({ relays: R4 });
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B', { clockOffsetMs: HOUR });
    const ids = await shareAndJoin(w, a, [b]);
    for (const n of ['x1', 'x2', 'x3']) mustAdd(a, ids.get(a)!, n);
    await w.settle(30_000);
    const info = await a.app.share(ids.get(a)!);
    a.net.online(false);
    b.net.online(false);
    const c = await addDevice(w, 'C', { clockOffsetMs: -HOUR });
    const j = await c.app.join(info.text);
    if (j.kind === 'error') throw new Error(j.code);
    ids.set(c, j.listId);
    await w.settle(60_000);
    expect(sortedNames(c, j.listId)).toEqual(['x1', 'x2', 'x3']);
    mustAdd(c, j.listId, 'van C');
    a.net.online(true);
    b.net.online(true);
    await w.settle(120_000);
    expectSameState([a, b, c], ids);
    expect(sortedNames(a, ids.get(a)!)).toHaveLength(4);
  });
});

describe('S-16: klokafwijking van een uur', () => {
  it('ET-S16-1: apparaat +1 u en apparaat -1 u wisselen bewerkingen van hetzelfde veld af; wat de ander eerst zag, wint de ander nooit verkeerd', async () => {
    const w = await makeWorld();
    const a = await addDevice(w, 'Voor', { clockOffsetMs: HOUR });
    const b = await addDevice(w, 'Achter', { clockOffsetMs: -HOUR });
    const ids = await shareAndJoin(w, a, [b]);
    const [la, lb] = [ids.get(a)!, ids.get(b)!];
    const id = mustAdd(a, la, 'ping');
    await w.settle(15_000);
    for (let i = 1; i <= 8; i++) {
      const [d, l, other, lo] = i % 2 === 0 ? [a, la, b, lb] : [b, lb, a, la];
      d.app.updateItem(l, find(d, l, 'ping')!.id, { quantity: i });
      await w.settle(15_000); // de ander ziet het
      expect([i, find(other, lo, 'ping')!.quantity]).toEqual([i, i]);
    }
    expect(find(a, la, 'ping')!.quantity).toBe(8);
    expect(find(b, lb, 'ping')!.quantity).toBe(8);
    void id;
    expectSameState([a, b], ids);
  });

  it('ET-S16-2: de "achterlopende" klok wijzigt een item dat hij net zag en dat een voorlopend apparaat verwijderde-en-herstelde -> geen verloren wijzigingen', async () => {
    const w = await makeWorld();
    const a = await addDevice(w, 'Voor', { clockOffsetMs: HOUR });
    const b = await addDevice(w, 'Achter', { clockOffsetMs: -HOUR });
    const ids = await shareAndJoin(w, a, [b]);
    const [la, lb] = [ids.get(a)!, ids.get(b)!];
    mustAdd(a, la, 'melk');
    await w.settle(15_000);
    const tok = a.app.deleteItem(la, find(a, la, 'melk')!.id).result;
    await w.settle(7_000); // binnen het undo-venster van 10 s
    expect(find(b, lb, 'melk')).toBeUndefined();
    a.app.undo(tok);
    await w.settle(15_000);
    b.app.updateItem(lb, find(b, lb, 'melk')!.id, { quantity: 6 });
    b.app.toggleChecked(lb, find(b, lb, 'melk')!.id);
    await w.settle(30_000);
    expect(find(a, la, 'melk')).toMatchObject({ quantity: 6, checked: true });
    expectSameState([a, b], ids);
  });

  it('ET-S16-3: relays weigeren events > 15 min in de toekomst; apparaat +1 u -> wijziging komt binnen 30 s bij de partner (en omgekeerd, -1 u bij een relay met pastTolerance)', async () => {
    const w = await makeWorld({ relays: R4 });
    for (const r of w.hub.relays.values()) {
      r.faults.futureToleranceSec = 900;
      r.faults.pastToleranceSec = 1800;
    }
    const a = await addDevice(w, 'Voor', { clockOffsetMs: HOUR });
    const b = await addDevice(w, 'Achter', { clockOffsetMs: -HOUR });
    const c = await addDevice(w, 'Normaal');
    const ids = await shareAndJoin(w, a, [b, c]);
    mustAdd(a, ids.get(a)!, 'van voor');
    await w.settle(30_000);
    expect(sortedNames(c, ids.get(c)!)).toContain('van voor');
    expect(sortedNames(b, ids.get(b)!)).toContain('van voor');
    mustAdd(b, ids.get(b)!, 'van achter');
    await w.settle(30_000);
    expect(sortedNames(c, ids.get(c)!)).toContain('van achter');
    expect(sortedNames(a, ids.get(a)!)).toContain('van achter');
    expectSameState([a, b, c], ids);
  });

  it('ET-S16-4: een apparaat met klok +30 dagen (> 24 u): geen crash, partner kan gewoon verder; HLC van nieuwe items loopt niet 30 dagen mee (drift-bescherming)', async () => {
    const w = await makeWorld();
    const a = await addDevice(w, 'Ver-voor', { clockOffsetMs: 30 * 24 * HOUR });
    const b = await addDevice(w, 'Normaal');
    const ids = await shareAndJoin(w, a, [b]);
    const [la, lb] = [ids.get(a)!, ids.get(b)!];
    mustAdd(a, la, 'uit de toekomst');
    await w.settle(30_000);
    expect(sortedNames(b, lb)).toContain('uit de toekomst');
    const idNew = mustAdd(b, lb, 'nieuw van B');
    b.app.updateItem(lb, find(b, lb, 'uit de toekomst')!.id, { quantity: 5 }); // causaal: B zag het
    await w.settle(30_000);
    expect(find(a, la, 'uit de toekomst')?.quantity).toBe(5);
    expectSameState([a, b], ids);
    const hlcMs = parseInt(find(b, lb, 'nieuw van B')!.addedHlc.slice(0, 12), 16);
    const bNow = b.clock.nowMs();
    expect([idNew.length > 0, hlcMs <= bNow + 24 * HOUR + 60_000]).toEqual([true, true]);
  });
});

describe('S-15 / NF-10 / F-02: grote lijst van 1000 items', () => {
  async function big(limitBytes?: number) {
    const w = await makeWorld({ relays: R4 });
    if (limitBytes) for (const r of w.hub.relays.values()) r.faults.maxBytes = limitBytes;
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B');
    const la = a.app.lists()[0].id;
    const word = lcgWords(42);
    const added: string[] = [];
    for (let i = 0; i < 1000; i++) {
      const name = `${word()} ${word()}`;
      mustAdd(a, la, name);
      added.push(name);
      if (i % 3 === 0) {
        const it = find(a, la, name)!;
        a.app.updateItem(la, it.id, { note: word() + ' ' + word() });
      }
    }
    // 30% tombstones
    const victims = allItems(a, la).filter((_, i) => i % 10 < 3);
    for (const v of victims) a.app.deleteItem(la, v.id);
    await a.app.flushWrites();
    const ids = await shareAndJoin(w, a, [b]);
    await w.settle(120_000);
    return { w, a, b, ids, la, lb: ids.get(b)!, victims: victims.length };
  }

  it('ET-S15-1: 1000 items met 30% tombstones: elk event <= 48 KiB, <= 16 delen, staat gelijk op B', async () => {
    const p = await big();
    expect(allItems(p.a, p.la)).toHaveLength(1000 - p.victims);
    expect(allItems(p.b, p.lb)).toHaveLength(1000 - p.victims);
    expectSameState([p.a, p.b], p.ids);
    for (const r of p.w.hub.relays.values()) {
      const perSender = new Map<string, number>();
      for (const m of r.all()) {
        expect([r.name, m.raw.length <= 48 * 1024]).toEqual([r.name, true]);
        perSender.set(m.sender, (perSender.get(m.sender) ?? 0) + 1);
      }
      for (const n of perSender.values()) expect(n).toBeLessThanOrEqual(16);
    }
  }, 120_000);

  it('ET-S15-2: alle relays weigeren events > 16 KiB: sync convergeert via kleinere delen', async () => {
    const p = await big(16 * 1024);
    expect(allItems(p.b, p.lb)).toHaveLength(1000 - p.victims);
    expectSameState([p.a, p.b], p.ids);
    for (const r of p.w.hub.relays.values()) for (const m of r.all()) expect(m.raw.length).toBeLessThanOrEqual(16 * 1024);
    // en daarna werken verdere wijzigingen nog
    mustAdd(p.b, p.lb, 'na groot');
    await p.w.settle(60_000);
    expect(find(p.a, p.la, 'na groot')).toBeDefined();
  }, 120_000);
});

describe('F-13 / F-14 / F-15 / F-18 / NF-05: delen en koppelen via code/payload', () => {
  it('ET-F13-1: een lijst die nooit gedeeld is gebruikt geen netwerk', async () => {
    const w = await makeWorld({ relays: R4 });
    const a = await addDevice(w, 'A');
    mustAdd(a, a.app.lists()[0].id, 'privé');
    await w.settle(60_000);
    expect(a.app.syncStatus(a.app.lists()[0].id).kind).toBe('lokaal');
    for (const r of w.hub.relays.values()) expect([r.name, r.received, r.conns.size]).toEqual([r.name, 0, 0]);
  });

  it('ET-F14-1: koppelen via de hele deeltekst, via alleen de link en via alleen de code geeft dezelfde volledige lijst, ook als A daarna offline is', async () => {
    const w = await makeWorld({ relays: R4 });
    const a = await addDevice(w, 'A');
    const la = a.app.lists()[0].id;
    for (let i = 0; i < 20; i++) mustAdd(a, la, `artikel ${i}`);
    const info = await a.app.share(la);
    await w.settle(10_000);
    expect((await a.app.shareInfo(la)).ready).toBe(true);
    a.net.online(false); // A is weg
    await w.settle(5_000);
    expect(info.text).toContain(info.code);
    expect(info.text).toContain('boodschap://join#'); // ST-10: nieuw schema; oude links blijven werken (store-legacy-links.test.ts)
    const forms = [info.text, info.link, info.code, `  ${info.code.toLowerCase()}  `, 'Kom bij mijn lijst!\n' + info.text + '\nGroetjes'];
    for (let i = 0; i < forms.length; i++) {
      const d = await addDevice(w, `Dev${i}`);
      const r = await d.app.join(forms[i]);
      if (r.kind === 'error') throw new Error(`vorm ${i}: ${r.code}`);
      await w.settle(30_000);
      expect([i, sortedNames(d, r.listId).length]).toEqual([i, 20]);
      expect(d.app.lists().filter((l) => l.shared)).toHaveLength(1);
    }
  });

  it('ET-F14-2: ongeldige, beschadigde of foute codes geven een nette foutmelding, geen crash en geen halve lijst', async () => {
    const w = await makeWorld({ relays: R4 });
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B');
    const info = await a.app.share(a.app.lists()[0].id);
    const before = b.app.lists().length;
    const typo = info.code.slice(0, 12) + (info.code[12] === 'A' ? 'B' : 'A') + info.code.slice(13);
    const results = [];
    for (const bad of ['', '   ', 'hallo wereld', 'BS1-', 'bootschap://join#', 'bootschap://join#!!!!', info.code.slice(0, 20), typo, info.code + 'XXXX', '{"a":1}', 'x'.repeat(5000)]) {
      results.push(await b.app.join(bad));
    }
    for (const r of results) expect(r.kind).toBe('error');
    expect(results.map((r) => (r.kind === 'error' ? r.code : ''))).toEqual(expect.not.arrayContaining(['']));
    expect(b.app.lists()).toHaveLength(before); // geen halve lijst
    const typoRes = results[7];
    expect(typoRes.kind === 'error' && ['controlesom', 'beschadigd']).toBeTruthy();
    // en daarna werkt de echte code gewoon
    const ok = await b.app.join(info.code);
    expect(ok.kind).toBe('joined');
  });

  it('ET-F14-3: koppelen aan een lijst die al op het toestel staat opent die lijst en maakt geen tweede kopie', async () => {
    const w = await makeWorld({ relays: R4 });
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B');
    const la = a.app.lists()[0].id;
    const info = await a.app.share(la);
    const own = await a.app.join(info.text);
    expect(own).toEqual({ kind: 'already-present', listId: la });
    const j1 = await b.app.join(info.text);
    await w.settle(20_000);
    const j2 = await b.app.join(info.text);
    expect(j1.kind).toBe('joined');
    expect(j2.kind).toBe('already-present');
    if (j1.kind === 'error' || j2.kind === 'error') throw new Error();
    expect(j2.listId).toBe(j1.listId);
    expect(b.app.lists().filter((l) => l.shared)).toHaveLength(1);
  });

  it('NF-05 / ET-NF05-1: deelcode/sleutel verschijnt niet in de logs van delen en koppelen', async () => {
    const w = await makeWorld({ relays: R4 });
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B');
    const info = await a.app.share(a.app.lists()[0].id);
    await b.app.join(info.text);
    await w.settle(30_000);
    const logs = a.log.text() + b.log.text();
    const payload = info.link.split('#')[1];
    expect(logs).not.toContain(payload.slice(0, 20));
    expect(logs).not.toContain(info.code.replace(/^BS1-/, '').slice(0, 16));
  });

  it('ET-F18-1: lijst verlaten (met kopie): het andere apparaat blijft werken, wijzigingen stromen niet meer', async () => {
    const w = await makeWorld({ relays: R4 });
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B');
    const ids = await shareAndJoin(w, a, [b]);
    const [la, lb] = [ids.get(a)!, ids.get(b)!];
    mustAdd(a, la, 'voor het verlaten');
    await w.settle(15_000);
    await b.app.leave(lb, true);
    await w.settle(5_000);
    expect(sortedNames(b, lb)).toEqual(['voor het verlaten']); // lokale kopie
    expect(b.app.lists().find((l) => l.id === lb)?.shared).toBe(false);
    mustAdd(a, la, 'na het verlaten');
    mustAdd(b, lb, 'alleen B');
    await w.settle(60_000);
    expect(sortedNames(b, lb)).toEqual(['alleen B', 'voor het verlaten']);
    expect(sortedNames(a, la)).toEqual(['na het verlaten', 'voor het verlaten']);
  });
});
