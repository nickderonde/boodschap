// NF-12: gesimuleerde apparaten — kill → geen I/O meer, herstart zonder BUSY, I-2 (geen dubbele ID's of nonces over
// 5 herstarts) en K-1 (zombies bevriezen zonder unhandled rejections).
import { addDevice, makeWorld, shareAndJoin } from './hub';
import { tmpDbFile } from '../support/single';
import { fromBase64 } from '../../src/core/bytes';
import { toHex } from '../../src/core/bytes';
import type { MemoryTransport } from '../../src/sync/transports/memory/MemoryTransport';

describe('NF-12: gesimuleerde apparaten en KillSwitch', () => {
  it('NF-12: na kill() vindt geen enkele I/O meer plaats (driver, timers, hub)', async () => {
    const w = await makeWorld();
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B');
    const ids = await shareAndJoin(w, a, [b]);
    const listA = ids.get(a)!;
    a.crashAt('after-prepare');
    a.app.addItem(listA, { text: 'net voor de crash' });
    await w.sched.advance(5_000);
    expect(a.killSwitch.killed).toBe(true);
    const relayCounts = [...w.hub.relays.values()].map((r) => r.received);
    const pendingTimers = w.sched.pending(`A#${a.incarnation}`);
    await w.sched.advance(120_000);
    expect(w.sched.pending(`A#${a.incarnation}`)).toBe(0);
    expect(pendingTimers).toBe(0);
    expect([...w.hub.relays.values()].map((r) => r.received)).toEqual(relayCounts);
  });

  it('NF-12: herstart op hetzelfde bestand zonder BUSY-lock, ook na een kill midden in een transactie', async () => {
    const w = await makeWorld();
    const file = tmpDbFile();
    const a = await addDevice(w, 'A', { dbFile: file });
    const listA = a.app.lists()[0].id;
    await a.app.addItem(listA, { text: 'blijft' }).committed;
    a.killSwitch.killAfterStatements = 2; // midden in de volgende transactie
    a.app.addItem(listA, { text: 'gaat verloren' });
    await w.sched.advance(100);
    expect(a.killSwitch.killed).toBe(true);
    await a.restart();
    await a.app.addItem(listA, { text: 'na herstart' }).committed;
    const names = a.app.view(listA).sections.flatMap((s) => s.items.map((i) => i.name)).sort();
    expect(names).toEqual(['blijft', 'na herstart']);
  });

  it('I-2: over 5 herstarts geen dubbele item-ID\'s of nonces', async () => {
    const w = await makeWorld();
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B');
    const ids = await shareAndJoin(w, a, [b]);
    const listA = ids.get(a)!;
    const itemIds: string[] = [];
    const nonceByEvent = new Map<string, string>();
    const collect = () => {
      for (const m of (a.transport() as MemoryTransport).sent) nonceByEvent.set(m.id, toHex(fromBase64((JSON.parse(m.raw) as { e: string }).e).subarray(1, 25)));
    };
    for (let k = 0; k < 6; k++) {
      for (let i = 0; i < 3; i++) {
        const r = a.app.addItem(listA, { text: `i${k}-${i}` }).result;
        if (r.kind === 'added') itemIds.push(r.itemId);
      }
      await w.settle(5_000);
      collect();
      if (k < 5) await a.restart();
    }
    expect(a.incarnation).toBe(5);
    expect(itemIds).toHaveLength(18);
    expect(new Set(itemIds).size).toBe(itemIds.length);
    // Elke publicatie (uniek event) heeft een unieke nonce, ook over herstarts heen.
    expect(nonceByEvent.size).toBeGreaterThanOrEqual(6);
    expect(new Set(nonceByEvent.values()).size).toBe(nonceByEvent.size);
  });

  it('K-1: zombies bevriezen zonder unhandled rejections', async () => {
    const seen: unknown[] = [];
    const h = (r: unknown) => seen.push(r);
    process.on('unhandledRejection', h);
    try {
      const w = await makeWorld();
      const a = await addDevice(w, 'A');
      const b = await addDevice(w, 'B');
      const ids = await shareAndJoin(w, a, [b]);
      for (const p of ['after-commit', 'after-persist', 'after-send'] as const) {
        a.crashAt(p);
        a.app.addItem(ids.get(a)!, { text: p });
        await w.sched.advance(5_000);
        await a.restart();
        await w.settle(10_000);
      }
      await new Promise((r) => setImmediate(r));
      expect(seen.filter((r) => !(r && typeof r === 'object' && (r as { name?: string }).name === 'SimulatedCrash'))).toEqual([]);
    } finally {
      process.off('unhandledRejection', h);
    }
  });
});
