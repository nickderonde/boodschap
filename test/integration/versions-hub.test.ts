// Versies, vloer, terugrollen en klokcorrectie op de hub (§6.6, §6.8; S-10b, S-16, B-1, B-2, I-3, D-03).
import { addDevice, makeWorld, names, shareAndJoin } from '../sim/hub';
import type { TestDevice } from '../sim/device';

const HOUR = 3_600_000;

async function setup(opts: { relayTolerances: number[]; aOffsetMs: number; latencyMs?: number; config?: Record<string, number> }) {
  const relays = opts.relayTolerances.map((_, i) => `wss://t${i}.test`);
  const w = await makeWorld({ relays });
  relays.forEach((r, i) => {
    const relay = w.hub.relay(r);
    relay.faults.futureToleranceSec = opts.relayTolerances[i];
    relay.faults.latencyMs = opts.latencyMs ?? 0;
  });
  const a = await addDevice(w, 'A', { clockOffsetMs: opts.aOffsetMs, config: opts.config });
  const b = await addDevice(w, 'B', { config: opts.config });
  return { w, a, b, relays };
}

const engine = (d: TestDevice) => d.app.syncEngine!;
const rotations = (d: TestDevice) => engine(d).debug.publisher.rotations;
const aStoredOn = (w: Awaited<ReturnType<typeof makeWorld>>, relay: string, sender: string) => w.hub.relay(relay).all().filter((m) => m.sender === sender);

describe('Versies en klokcorrectie op de hub (S-16, S-10b, B-1, B-2, I-3)', () => {
  it('S-16 / B-1 positief: apparaat +1 u, alle relays tolerantie 900 s → terugrol, nieuw event aanwezig ≤ 30 s, geen rotatie', async () => {
    const { w, a, b, relays } = await setup({ relayTolerances: [900, 900], aOffsetMs: HOUR });
    const listA = a.app.lists()[0].id;
    a.app.addItem(listA, { text: 'melk' });
    await w.settle(2_000);
    const t0 = w.sched.now();
    await a.app.share(listA);
    await w.settle(30_000);
    const pub = (await a.app.readShards(listA))!;
    const sender = a.app.sharedLists()[0].identity.id;
    for (const r of relays) expect(aStoredOn(w, r, sender).length).toBe(1);
    expect(rotations(a)).toBe(0);
    expect(engine(a).debug.offsetSec()).toBeLessThan(-2700);
    expect(pub.shards.get(0)!.lastVersion).toBeLessThanOrEqual(Math.floor(w.sched.now() / 1000) + 900);
    expect(w.sched.now() - t0).toBeLessThanOrEqual(30_000);
    expect(a.log.codes()).toContain('floor.rollback');
    // B ziet het item
    const info = await a.app.shareInfo(listA);
    const j = await b.app.join(info.text);
    await w.settle(30_000);
    if (j.kind === 'error') throw new Error();
    expect(names(b, j.listId)).toEqual(['Melk']);
  });

  it('S-16 / E-3: twee relays (300 s en 900 s), apparaat +10 min, 3 herstarts → geen nieuwe identiteit, clock_offset_sec persistent, convergentie', async () => {
    const { w, a, b } = await setup({ relayTolerances: [300, 900], aOffsetMs: 10 * 60_000 });
    const ids = await shareAndJoin(w, a, [b]);
    const listA = ids.get(a)!;
    const listB = ids.get(b)!;
    const pk = a.app.sharedLists()[0].identity.id;
    for (let i = 0; i < 3; i++) {
      a.app.addItem(listA, { text: `artikel ${i}` });
      await w.settle(5_000);
      await a.restart();
      expect(await a.app.getClockOffset()).toBeLessThan(0); // persistent
      await w.settle(5_000);
    }
    await w.settle(15 * 60_000);
    expect(a.app.sharedLists()[0].identity.id).toBe(pk); // geen rotatie
    expect(names(b, listB)).toEqual(['Artikel 0', 'Artikel 1', 'Artikel 2']);
    // De strenge relay heeft uiteindelijk het nieuwste event van A.
    const last = (await a.app.readShards(listA))!.shards.get(0)!.lastEventId;
    expect(w.hub.relay('wss://t0.test').all().some((m) => m.id === last)).toBe(true);
  });

  it('B-1: A (900 s) accepteert e, B (300 s) weigert; kill en herstart; EOSE: A levert e, B weigert opnieuw → GEEN terugrol', async () => {
    const { w, a, b } = await setup({ relayTolerances: [300, 900], aOffsetMs: 10 * 60_000 });
    const ids = await shareAndJoin(w, a, [b]);
    const listA = ids.get(a)!;
    a.app.addItem(listA, { text: 'kaas' });
    await w.settle(3_000);
    const before = (await a.app.readShards(listA))!.shards.get(0)!;
    expect(w.hub.relay('wss://t1.test').all().some((m) => m.id === before.lastEventId)).toBe(true); // 900 s accepteerde
    expect(w.hub.relay('wss://t0.test').all().some((m) => m.id === before.lastEventId)).toBe(false); // 300 s weigerde
    await a.restart();
    await w.settle(10_000); // EOSE → eigen-staatcontrole stuurt e opnieuw naar t0, die weer weigert
    const after = (await a.app.readShards(listA))!.shards.get(0)!;
    expect(after.floorVersion).toBe(before.floorVersion);
    expect(a.log.codes()).not.toContain('floor.rollback');
    // Daarna een bewerking: A's nieuwste event komt op beide relays (de strenge na de wachttimer).
    a.app.addItem(listA, { text: 'worst' });
    await w.settle(15 * 60_000);
    const last = (await a.app.readShards(listA))!.shards.get(0)!.lastEventId;
    for (const r of ['wss://t0.test', 'wss://t1.test']) expect(w.hub.relay(r).all().some((m) => m.id === last)).toBe(true);
    expect(names(b, ids.get(b)!)).toEqual(['Kaas', 'Worst']);
  });

  it('I-3: +1 u, 5 bewerkingen in 2 s, relay-latentie 200 ms → geen rotatie, aanwezig ≤ 30 s', async () => {
    const { w, a, b } = await setup({ relayTolerances: [900, 900], aOffsetMs: 0, latencyMs: 200 });
    const ids = await shareAndJoin(w, a, [b]);
    a.clock.offsetMs = HOUR; // pas na het koppelen gaat de klok een uur vóór
    const listA = ids.get(a)!;
    const t0 = w.sched.now();
    for (let i = 0; i < 5; i++) {
      a.app.addItem(listA, { text: `snel ${i}` });
      await w.sched.advance(400);
    }
    await w.settle(30_000 - (w.sched.now() - t0));
    expect(rotations(a)).toBe(0);
    expect(names(b, ids.get(b)!)).toEqual(['Snel 0', 'Snel 1', 'Snel 2', 'Snel 3', 'Snel 4']);
  });

  it('D-03: RTT groter dan het venster (latentie 800 ms) en alle relays weigeren → terugrollen door de keten, geen rotatie, aanwezig ≤ 30 s', async () => {
    const { w, a, b } = await setup({ relayTolerances: [900, 900], aOffsetMs: 0, latencyMs: 800 });
    const ids = await shareAndJoin(w, a, [b]);
    a.clock.offsetMs = HOUR; // pas na het koppelen gaat de klok een uur vóór
    const listA = ids.get(a)!;
    const t0 = w.sched.now();
    for (let i = 0; i < 5; i++) {
      a.app.addItem(listA, { text: `traag ${i}` });
      await w.sched.advance(400);
    }
    await w.settle(30_000 - (w.sched.now() - t0));
    expect(rotations(a)).toBe(0);
    expect(names(b, ids.get(b)!)).toEqual(['Traag 0', 'Traag 1', 'Traag 2', 'Traag 3', 'Traag 4']);
  });

  it('D-03b: vloer-afgeleide opvolgers (venster 50 ms < RTT 400 ms) → terugrollen door de keten, geen rotatie, aanwezig ≤ 30 s', async () => {
    const { w, a, b } = await setup({ relayTolerances: [900], aOffsetMs: 0, latencyMs: 200, config: { localWindowMs: 50, minFlushGapMs: 50 } });
    const ids = await shareAndJoin(w, a, [b]);
    a.clock.offsetMs = HOUR;
    for (let i = 0; i < 5; i++) {
      a.app.addItem(ids.get(a)!, { text: `v${i}` });
      await w.sched.advance(400);
    }
    await w.settle(28_000);
    expect(rotations(a)).toBe(0);
    expect(names(b, ids.get(b)!)).toEqual(['V0', 'V1', 'V2', 'V3', 'V4']);
  });

  it('S-16: voorsprong > 1 u ná acceptatie → precies één rotatie, daarna convergentie', async () => {
    const { w, a, b } = await setup({ relayTolerances: [Infinity, Infinity], aOffsetMs: 3 * HOUR });
    const ids = await shareAndJoin(w, a, [b]);
    const listA = ids.get(a)!;
    // De klok van A wordt gecorrigeerd (bv. de gebruiker zet de tijd goed): de vloer ligt nu > 1 u vóór.
    a.clock.offsetMs = 0;
    a.app.addItem(listA, { text: 'na klokcorrectie' });
    await w.settle(30_000);
    expect(rotations(a)).toBe(1);
    a.app.addItem(listA, { text: 'nog een' });
    await w.settle(30_000);
    expect(rotations(a)).toBe(1);
    expect(names(b, ids.get(b)!)).toEqual(['Na klokcorrectie', 'Nog een']);
  });

  it('S-16 (L-3): apparaat −1 u, relay met pastToleranceSec = 1800 → clock-behind-correctie, aanwezig ≤ 30 s', async () => {
    const relays = ['wss://p0.test'];
    const w = await makeWorld({ relays });
    w.hub.relay(relays[0]).faults.pastToleranceSec = 1800;
    const a = await addDevice(w, 'A', { clockOffsetMs: -HOUR });
    const b = await addDevice(w, 'B');
    const listA = a.app.lists()[0].id;
    a.app.addItem(listA, { text: 'vroeg' });
    const info = await a.app.share(listA);
    await w.settle(30_000);
    expect(engine(a).debug.offsetSec()).toBeGreaterThan(0);
    const j = await b.app.join(info.text);
    await w.settle(20_000);
    if (j.kind === 'error') throw new Error();
    expect(names(b, j.listId)).toEqual(['Vroeg']);
  });

  it('S-10b: twee publicaties in dezelfde seconde — de nieuwste staat verliest nooit (ook na een kill tussen de twee)', async () => {
    const { w, a, b } = await setup({ relayTolerances: [Infinity, Infinity], aOffsetMs: 0 });
    const ids = await shareAndJoin(w, a, [b]);
    const listA = ids.get(a)!;
    await a.app.addItem(listA, { text: 'eerste' }).committed;
    await engine(a).flushNow(listA);
    const v1 = (await a.app.readShards(listA))!.shards.get(0)!.lastVersion;
    await a.restart(); // kill tussen de twee publicaties
    await a.app.addItem(listA, { text: 'tweede' }).committed;
    await engine(a).flushNow(listA); // zelfde virtuele seconde
    const v2 = (await a.app.readShards(listA))!.shards.get(0)!.lastVersion;
    expect(v2).toBeGreaterThan(v1);
    await w.settle(10_000);
    expect(names(b, ids.get(b)!)).toEqual(['Eerste', 'Tweede']);
  });

  it('B-2: gelijktijdige flushes (directe flush tijdens een venster-flush met wachtende prepare) → één tegelijk, strikt stijgende versies', async () => {
    const { w, a, b } = await setup({ relayTolerances: [Infinity, Infinity], aOffsetMs: 0 });
    const ids = await shareAndJoin(w, a, [b]);
    const listA = ids.get(a)!;
    const eng = engine(a);
    const versions: number[] = [];
    a.transport()!.on('outcome', () => {});
    const origPrepare = a.transport()!.prepare.bind(a.transport());
    let concurrent = 0;
    let maxConcurrent = 0;
    a.transport()!.prepare = async (p) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await w.sched.advance(0);
      const m = await origPrepare(p);
      versions.push(m.version);
      concurrent--;
      return m;
    };
    a.app.addItem(listA, { text: 'x1' });
    const p1 = eng.flushNow(listA);
    a.app.addItem(listA, { text: 'x2' });
    await a.app.flushWrites();
    const p2 = eng.flushNow(listA); // samengevoegd met de lopende flush
    const p3 = eng.flushNow(listA);
    await Promise.all([p1, p2, p3]);
    await w.settle(10_000);
    expect(maxConcurrent).toBe(1);
    for (let i = 1; i < versions.length; i++) expect(versions[i]).toBeGreaterThan(versions[i - 1]);
    expect(names(b, ids.get(b)!)).toEqual(['X1', 'X2']);
  });

  it('B-2: een geforceerde CAS-afwijking laat de flush herstarten', async () => {
    const { w, a, b } = await setup({ relayTolerances: [Infinity, Infinity], aOffsetMs: 0 });
    const ids = await shareAndJoin(w, a, [b]);
    const listA = ids.get(a)!;
    const origPersist = a.app.persistFlush.bind(a.app);
    let first = true;
    a.app.persistFlush = async (listId, writes) => {
      if (first) {
        first = false;
        // Iemand anders verhoogt de vloer tussen lezen en persisteren.
        await a.app.repo.tx((tx) => tx.run('UPDATE shard_state SET floor_version = floor_version + 7 WHERE list_id=?', [listId]));
      }
      return origPersist(listId, writes);
    };
    a.app.addItem(listA, { text: 'cas' });
    await w.settle(10_000);
    expect(a.log.codes()).toContain('flush.cas-retry');
    expect(names(b, ids.get(b)!)).toEqual(['Cas']);
  });
});
