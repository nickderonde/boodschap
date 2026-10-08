// Tests bij de codereview van de Architect (docs/reviews/review-architect-code-M1-M3b.md). Elke test faalt zonder de fix.
import { addDevice, makeWorld, names, shareAndJoin } from '../sim/hub';
import { singleDevice } from '../support/single';
import { CrashingSqlDriver } from '../support/CrashingSqlDriver';
import { VirtualScheduler } from '../support/VirtualScheduler';
import { RelayConnection, type WebSocketLike } from '../../src/sync/transports/nostr/RelayConnection';
import { rollbackTarget } from '../../src/sync/engine/Publisher';
import { nullLogger } from '../../src/core/types';
import type { SqlDriver } from '../../src/storage/SqlDriver';
import type { StoredMessage } from '../../src/sync/transports/memory/MemoryHub';

const HOUR = 3_600_000;

describe('Review M1–M3b: belangrijke bevindingen', () => {
  it('bevinding 1: na een terugrol wordt het ingetrokken event nooit meer verzonden (EOSE tijdens de herflush)', async () => {
    const w = await makeWorld({ relays: ['wss://k0.test'] });
    const relay = w.hub.relay('wss://k0.test');
    relay.faults.futureToleranceSec = 900;
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B');
    const ids = await shareAndJoin(w, a, [b]);
    const listA = ids.get(a)!;
    // Na de terugrol: tijdens het voorbereiden van het vervangende event komt er een EOSE binnen, en de relay zou het
    // ingetrokken event nu wél accepteren.
    let rolledBack = false;
    const withdrawn: string[] = [];
    const origRollback = a.app.rollbackFloor.bind(a.app);
    a.app.rollbackFloor = async (...args) => {
      const before = (await a.app.readShards(args[0]))!.shards.get(args[1])!.lastEventId;
      const ok = await origRollback(...args);
      if (ok && before) withdrawn.push(before);
      if (ok) rolledBack = true;
      return ok;
    };
    const t = a.transport()!;
    const origPrepare = t.prepare.bind(t);
    let triggered = false;
    t.prepare = async (p) => {
      if (rolledBack && !triggered) {
        triggered = true;
        relay.faults.futureToleranceSec = Infinity;
        a.app.foreground(); // nieuwe REQ → EOSE → eigen-staatcontrole
        await w.sched.advance(20);
      }
      return origPrepare(p);
    };
    a.clock.offsetMs = HOUR;
    a.app.addItem(listA, { text: 'na klokfout' });
    await w.settle(30_000);
    expect(rolledBack).toBe(true);
    expect(triggered).toBe(true);
    // Het ingetrokken event mag nergens staan (ook niet via de eigen-staatcontrole); de relay houdt het nieuwste event.
    const aPub = a.app.sharedLists()[0].identity.id;
    const stored = relay.all().filter((m) => m.sender === aPub);
    expect(withdrawn.length).toBeGreaterThan(0);
    for (const id of withdrawn) expect(relay.received > 0 && stored.some((m) => m.id === id)).toBe(false);
    const last = (await a.app.readShards(listA))!.shards.get(0)!.lastEventId;
    expect(stored.map((m) => m.id)).toContain(last);
    expect(names(b, ids.get(b)!)).toEqual(['Na klokfout']);
  });

  it('bevinding 2: een vervalste kopie met hetzelfde event-ID van relay A onderdrukt het echte event van relay B niet', async () => {
    const w = await makeWorld({ relays: ['wss://evil.test', 'wss://good.test'] });
    const evil = w.hub.relay('wss://evil.test');
    const good = w.hub.relay('wss://good.test');
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B');
    const ids = await shareAndJoin(w, a, [b]);
    b.net.online(false);
    a.app.addItem(ids.get(a)!, { text: 'echt' });
    await w.settle(5_000);
    const aPub = a.app.sharedLists()[0].identity.id;
    const real = good.all().find((m) => m.sender === aPub)!;
    // De kwade relay levert hetzelfde ID met een vervalste inhoud, en levert sneller.
    const forged: StoredMessage = { ...real, envelopeB64: real.envelopeB64.replace(/^.{8}/, 'AAAAAAAA'), corrupt: false };
    evil.store.set(`${real.channel}|${real.slot}|${real.sender}`, forged);
    good.faults.latencyMs = 300;
    b.net.online(true);
    await w.settle(10_000);
    expect(names(b, ids.get(b)!)).toEqual(['Echt']);
  });

  it('bevinding 3: kick() tijdens het verbinden opent geen tweede socket', async () => {
    const sched = new VirtualScheduler();
    let sockets = 0;
    const slow = (): WebSocketLike => {
      sockets++;
      return { readyState: 0, send() {}, close() {}, onopen: null, onmessage: null, onclose: null, onerror: null }; // opent nooit
    };
    const c = new RelayConnection({
      url: 'wss://traag.test', wsFactory: slow, timers: sched.timers('c'), log: nullLogger, connectTimeoutMs: 10_000,
      publishTimeoutMs: 8_000, backoffMaxMs: 60_000, jitter: () => 0.5,
      events: { state() {}, message() {}, eose() {}, outcome() {}, closedSub() {} },
    });
    c.connect(true);
    c.kick(); // voorgrond
    c.kick(); // netwerkherstel
    c.kick(); // pull-to-refresh
    expect(sockets).toBe(1);
    c.close();
  });

  it('bevinding 5: een mislukte COMMIT sluit de transactie; de taak wordt afgewezen, de cache herladen en de volgende schrijfactie slaagt', async () => {
    let crash!: CrashingSqlDriver;
    const d = await singleDevice({ wrap: (inner: SqlDriver) => (crash = new CrashingSqlDriver(inner)) });
    const listId = d.app.lists()[0].id;
    await d.app.addItem(listId, { text: 'brood' }).committed;
    const errors: string[] = [];
    d.app.onError((e) => errors.push(e.code));
    crash.failOnce = /^COMMIT/;
    const r = d.app.addItem(listId, { text: 'melk' });
    await expect(r.committed).rejects.toThrow();
    await d.app.flushWrites();
    expect(errors).toEqual(['opslaan-mislukt']);
    expect(d.app.view(listId).total).toBe(1);
    await d.app.addItem(listId, { text: 'kaas' }).committed;
    expect(d.app.view(listId).total).toBe(2);
  });
});

describe('Review M1–M3b: kleine bevindingen', () => {
  it('bevinding 7: de keten-terugrol volgt de echte voorganger (prevId), niet een event met dezelfde versie', () => {
    const entries = new Map([
      // de echte voorganger: versie 100, staat misschien wél ergens (niet bewezen afwezig)
      ['echt', { version: 100, floorBefore: 50, clockDerived: true, prevId: null, absent: false }],
      // een ouder, wél afwezig event met toevallig dezelfde versie (na een eerdere terugrol)
      ['lokvogel', { version: 100, floorBefore: 10, clockDerived: true, prevId: null, absent: true }],
    ]);
    const f = { floorBefore: 100, clockDerived: true, prevId: 'echt' };
    const t = rollbackTarget(f, (id) => entries.get(id), (x) => (x as unknown as { absent: boolean }).absent);
    expect(t.newFloor).toBe(100); // niet verder dan de echte voorganger
    const t2 = rollbackTarget({ floorBefore: 100, clockDerived: false, prevId: 'lokvogel' }, (id) => entries.get(id), (x) => (x as unknown as { absent: boolean }).absent);
    expect(t2).toEqual({ newFloor: 10, sawClockDerived: true });
  });
});

// ---------------------------------------------------------------------------------------------------------------
import { addWsDevice, makeWsWorld, names as wsNames, waitFor, type WsWorld } from '../sim/ws';
import { CommandError } from '../../src/service/BootschapApp';
import { BootschapAppImpl } from '../../src/service/BootschapApp';
import { NodeSqliteDriver } from '../support/NodeSqliteDriver';
import { MemoryKeyStore } from '../support/MemoryKeyStore';
import { SeededRandom } from '../support/SeededRandom';
import { tmpDbFile } from '../support/single';
import { MemoryHub } from '../../src/sync/transports/memory/MemoryHub';
import { createMemoryTransport } from '../../src/sync/transports/memory/MemoryTransport';
import { formatHlc } from '../../src/core/hlc';
import type { ItemState } from '../../src/core/types';
import { toTextCode } from '../../src/core/codec/sharecode';

describe('Review M1–M3b: bevinding 4 (relay-hints en F-14)', () => {
  let w: WsWorld;
  afterEach(async () => {
    await w?.stop();
  });

  it('bevinding 4: B koppelt via een code met hints naar A\'s eigen relay en convergeert zonder herstart', async () => {
    w = await makeWsWorld(2);
    const [custom, other] = w.relays;
    const a = await addWsDevice(w, 'A', { endpoints: [custom.url] });
    const b = await addWsDevice(w, 'B', { endpoints: [other.url], dynamicRelays: true });
    const listA = a.app.lists()[0].id;
    a.app.addItem(listA, { text: 'via hint' });
    const info = await a.app.share(listA);
    await waitFor(async () => (await a.app.shareInfo(listA)).ready);
    // B heeft al een (andere) gedeelde lijst, zodat zijn transport al bestaat vóór het koppelen.
    await b.app.share(b.app.lists()[0].id);
    const r = await b.app.join(info.text);
    if (r.kind !== 'joined') throw new Error();
    expect(await b.app.relays()).toContain(custom.url);
    await waitFor(() => wsNames(b, r.listId).includes('Via hint'), 10_000);
    b.app.addItem(r.listId, { text: 'van B' });
    await waitFor(() => wsNames(a, listA).includes('Van B'), 10_000);
  });

  it('bevinding 4: setRelays bereikt de transport zonder herstart', async () => {
    w = await makeWsWorld(2);
    const [r0, r1] = w.relays;
    const a = await addWsDevice(w, 'A', { endpoints: [r0.url], dynamicRelays: true });
    const listA = a.app.lists()[0].id;
    await a.app.share(listA);
    await waitFor(async () => (await a.app.shareInfo(listA)).ready);
    await a.app.setRelays([r1.url]);
    a.app.addItem(listA, { text: 'naar r1' });
    const aPub = a.app.sharedLists()[0].identity.id;
    await waitFor(() => r1.dumpEvents().some((e) => e.pubkey === aPub), 10_000);
  });
});

describe('Review M1–M3b: bevinding 8 (alleen wss://)', () => {
  it('bevinding 8: ws:// wordt in productie geweigerd (setRelays) en een ws://-hint wordt niet overgenomen', async () => {
    const d = await singleDevice();
    await expect(d.app.setRelays(['ws://onveilig.example'])).rejects.toBeInstanceOf(CommandError);
    await expect(d.app.setRelays(['wss://ok.example', 'ws://onveilig.example'])).rejects.toBeInstanceOf(CommandError);
    await d.app.setRelays(['wss://ok.example']);
    expect(await d.app.relays()).toEqual(['wss://ok.example']);
    const code = toTextCode({ secret: new SeededRandom(4).bytes(32), relayHints: ['ws://onveilig.example', 'wss://hint.example'] });
    const r = await d.app.join(code);
    expect(r.kind).toBe('joined');
    expect(await d.app.relays()).toEqual(['wss://ok.example', 'wss://hint.example']);
  });
});

describe('Review M1–M3b: bevindingen 10, 11, 14, 15', () => {
  it('bevinding 10: genLists bewaart alleen de laatste generaties', async () => {
    const w = await makeWorld();
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B');
    await shareAndJoin(w, a, [b]);
    for (let i = 0; i < 20; i++) await a.app.syncEngine!.listsChanged();
    expect(a.app.syncEngine!.debug.genListsSize()).toBeLessThanOrEqual(4);
  });

  it('bevinding 11: een snapshot van 1000 items opnieuw mergen kost een handvol statements (batch-SELECT)', async () => {
    const d = await singleDevice();
    const listId = d.app.lists()[0].id;
    const h = formatHlc(d.clock.nowMs(), 0, 'ffffffffffffffff');
    const items = new Map<string, ItemState>();
    for (let i = 0; i < 1000; i++) {
      const id = `I${String(i).padStart(15, '0')}`;
      items.set(id, { id, regs: { n: [`p${i}`, h], k: ['overig', h], x: [false, h], a: [1, h] }, del: null });
    }
    expect(await d.app.mergeRemote(listId, { regs: {}, items })).toBe(true);
    const drv = d.driver as NodeSqliteDriver;
    const before = drv.statements;
    expect(await d.app.mergeRemote(listId, { regs: {}, items })).toBe(false);
    expect(drv.statements - before).toBeLessThan(20); // zonder batch: ≥ 1000 SELECT's
  });

  it('bevinding 14: gedeeld zonder transport → bij een latere start met transport worden nostr_pubkey en de eigen rij in members aangevuld', async () => {
    const file = tmpDbFile();
    const keys = new MemoryKeyStore();
    const rnd = new SeededRandom(8);
    const clock = { nowMs: () => 1_759_740_000_000 };
    const timers = { setTimeout: () => null, clearTimeout: () => {} };
    const app1 = new BootschapAppImpl({ db: new NodeSqliteDriver(file), keys, clock, timers, random: rnd });
    await app1.init();
    const listId = app1.lists()[0].id;
    await app1.share(listId);
    await app1.shutdown();
    const hub = new MemoryHub(clock, timers);
    const app2 = new BootschapAppImpl({
      db: new NodeSqliteDriver(file), keys, clock, timers, random: rnd,
      transport: (relays) => createMemoryTransport(hub, { endpoints: relays, clock, timers }),
    });
    await app2.init();
    await app2.whenSyncStarted();
    await app2.flushWrites();
    const row = await app2.repo.read((r) => r.get<{ nostr_pubkey: string | null }>('SELECT nostr_pubkey FROM lists WHERE id=?', [listId]));
    expect(row?.nostr_pubkey).toMatch(/^[0-9a-f]{64}$/);
    const members = await app2.members(listId);
    expect(members).toContain(row!.nostr_pubkey);
    await app2.shutdown();
  });

  it('bevinding 15: pause() bij naar de achtergrond gaan is begrensd (±3 s), ook als een flush op klokantwoorden wacht', async () => {
    const w = await makeWorld({ relays: ['wss://snel.test', 'wss://traag.test'] });
    for (const r of w.hub.relays.values()) r.faults.futureToleranceSec = 900;
    w.hub.relay('wss://traag.test').faults.latencyMs = 6_000;
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B');
    const ids = await shareAndJoin(w, a, [b]);
    a.clock.offsetMs = HOUR;
    a.app.addItem(ids.get(a)!, { text: 'e1' });
    await w.sched.advance(1_500); // snelle relay weigerde al, trage nog niet
    a.app.addItem(ids.get(a)!, { text: 'e2' });
    await w.sched.advance(1_100); // flush wacht nu op het antwoord van de trage relay (I-3)
    const t0 = w.sched.now();
    let done = false;
    const p = a.app.background().then(() => (done = true));
    for (let i = 0; i < 40 && !done; i++) await w.sched.advance(100);
    await p;
    expect(w.sched.now() - t0).toBeLessThanOrEqual(3_500);
  });
});

describe('O-ET-02: kill direct na een niet-bevestigde schrijfactie', () => {
  it('O-ET-02: geeft geen onbehandelde rejection (de zombie bevriest)', async () => {
    const seen: unknown[] = [];
    const h = (r: unknown) => seen.push(r);
    process.on('unhandledRejection', h);
    try {
      const w = await makeWorld();
      const a = await addDevice(w, 'A');
      const b = await addDevice(w, 'B');
      const ids = await shareAndJoin(w, a, [b]);
      void a.app.addItem(ids.get(a)!, { text: 'onbevestigd' }).committed.catch(() => {});
      a.kill();
      await w.sched.advance(5_000);
      await new Promise((r) => setImmediate(r));
      expect(seen).toEqual([]);
      await a.restart();
      await w.settle(10_000);
    } finally {
      process.off('unhandledRejection', h);
    }
  });
});
