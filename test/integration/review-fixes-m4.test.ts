// Tests bij de codereview M4/M5 van de Architect (docs/reviews/review-architect-code-M4-M5.md). Elk faalt zonder fix.
import { addDevice, makeWorld, names, shareAndJoin } from '../sim/hub';
import { singleDevice } from '../support/single';
import { BootschapAppImpl, CommandError } from '../../src/service/BootschapApp';
import { NodeSqliteDriver } from '../support/NodeSqliteDriver';
import { MemoryKeyStore } from '../support/MemoryKeyStore';
import { SeededRandom } from '../support/SeededRandom';
import { VirtualScheduler } from '../support/VirtualScheduler';
import { MemoryHub } from '../../src/sync/transports/memory/MemoryHub';
import { createMemoryTransport } from '../../src/sync/transports/memory/MemoryTransport';
import { toTextCode } from '../../src/core/codec/sharecode';
import type { Transport } from '../../src/sync/Transport';
import { materialize } from '../../src/core/crdt/materialize';
import { createItemDelta, editItemDelta } from '../../src/core/ops';
import { emptyList, mergeList } from '../../src/core/crdt/list';
import { formatHlc, HlcClock } from '../../src/core/hlc';

describe('Review M4/M5: N1 (pause/resume-race)', () => {
  it('N1: foreground() tijdens een lopende background() → de transport blijft open, status niet offline, wijzigingen komen aan', async () => {
    const w = await makeWorld();
    for (const r of w.hub.relays.values()) r.faults.latencyMs = 1_000; // pause() wacht zo op acks
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B');
    const ids = await shareAndJoin(w, a, [b]);
    a.app.addItem(ids.get(a)!, { text: 'vlak voor achtergrond' });
    await w.sched.advance(1_100); // publicatie onderweg
    const bg = a.app.background();
    await w.sched.advance(100);
    a.app.foreground(); // snel terug naar de voorgrond
    for (let i = 0; i < 40; i++) await w.sched.advance(100);
    await bg;
    await w.settle(30_000);
    const t = a.transport()!;
    expect(t.endpoints.some((ep) => t.isOpen(ep))).toBe(true);
    expect(a.app.syncStatus(ids.get(a)!).kind).not.toBe('offline');
    a.app.addItem(ids.get(a)!, { text: 'na terugkeer' });
    await w.settle(30_000);
    expect(names(b, ids.get(b)!)).toEqual(['Na terugkeer', 'Vlak voor achtergrond']);
  });
});

describe('Review M4/M5: N2 (single-flight engine/transport)', () => {
  it('N2: gelijktijdig join (met hints), setRelays en share → precies één levende transport en één engine', async () => {
    const sched = new VirtualScheduler();
    const hub = new MemoryHub(sched.clock(), sched.timers('hub'));
    const created: { t: Transport; closed: boolean }[] = [];
    const app = new BootschapAppImpl({
      db: new NodeSqliteDriver(),
      keys: new MemoryKeyStore(),
      clock: sched.clock(),
      timers: sched.timers('A'),
      random: new SeededRandom(21),
      transport: (relays) => {
        const t = createMemoryTransport(hub, { endpoints: relays, clock: sched.clock(), timers: sched.timers('A') });
        const rec = { t, closed: false };
        const close = t.close.bind(t);
        t.close = () => {
          rec.closed = true;
          close();
        };
        created.push(rec);
        return t;
      },
    });
    await app.init();
    await app.setRelays(['wss://een.test']);
    const second = app.createList('Twee').result.listId;
    await app.flushWrites();
    const code = toTextCode({ secret: new SeededRandom(5).bytes(32), relayHints: ['wss://hint.test'] });
    await Promise.all([app.join(code), app.setRelays(['wss://een.test', 'wss://twee.test']), app.share(second), app.share(app.lists()[0].id)]);
    await sched.advance(5_000);
    const alive = created.filter((c) => !c.closed);
    expect(alive).toHaveLength(1);
    expect(alive[0].t).toBe((app as unknown as { transportInstance: Transport }).transportInstance);
    expect(app.syncEngine).not.toBeNull();
    await app.shutdown();
  });
});

describe('Review M4/M5: K-2 en K-6', () => {
  it('K-2: na het afvinken van één item zijn alle andere ItemView-objecten dezelfde referenties (memo(ItemRow) werkt)', () => {
    const N = '0000000000000001';
    let l = emptyList();
    for (let i = 0; i < 1000; i++) {
      const id = `I${String(i).padStart(15, '0')}`;
      l = mergeList(l, createItemDelta(id, { name: `p${i}`, quantity: null, unit: null, note: null, category: 'overig', addedMs: 1 }, formatHlc(1_759_740_000_000 + i, 0, N)));
    }
    const before = materialize(l).sections.flatMap((s) => s.items);
    const target = 'I000000000000500';
    l = mergeList(l, editItemDelta(l.items.get(target)!, { x: true }, new HlcClock(N), 1_759_750_000_000));
    const after = materialize(l).sections.flatMap((s) => s.items);
    const byId = new Map(before.map((v) => [v.id, v]));
    const changed = after.filter((v) => byId.get(v.id) !== v).map((v) => v.id);
    expect(changed).toEqual([target]);
  });

  it('K-6: de facade weigert relay-adressen met rommel achter de host', async () => {
    const d = await singleDevice();
    await expect(d.app.setRelays(['wss://host iets'])).rejects.toBeInstanceOf(CommandError);
    await expect(d.app.setRelays(['wss://host/pad met spatie'])).rejects.toBeInstanceOf(CommandError);
    await d.app.setRelays(['wss://relay.example.org/nostr']);
    expect(await d.app.relays()).toEqual(['wss://relay.example.org/nostr']);
  });
});
