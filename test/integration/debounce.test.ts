// S-21: publicaties worden gebundeld (op virtuele tijd, productievensters).
import { addDevice, makeWorld, shareAndJoin } from '../sim/hub';
import type { MemoryTransport } from '../../src/sync/transports/memory/MemoryTransport';

describe('S-21: debounce', () => {
  it('S-21: 5 wijzigingen binnen 1 s → 1 event per relay per gewijzigd deel', async () => {
    const w = await makeWorld();
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B');
    const ids = await shareAndJoin(w, a, [b]);
    const listA = ids.get(a)!;
    const t = a.transport() as MemoryTransport;
    const before = t.sent.length;
    for (let i = 0; i < 5; i++) {
      a.app.addItem(listA, { text: `x${i}` });
      await w.sched.advance(150);
    }
    await w.settle(10_000);
    const sends = t.sent.slice(before);
    expect(new Set(sends.map((m) => m.id)).size).toBe(1); // één event (S=1)
    for (const r of w.hub.relays.values()) expect(r.all().filter((m) => m.sender === sends[0].sender)).toHaveLength(1);
  });

  it('S-21: aanhoudend maximaal 1 publicatie per seconde per lijst; venster van 1000 ms', async () => {
    const w = await makeWorld();
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B');
    const ids = await shareAndJoin(w, a, [b]);
    const listA = ids.get(a)!;
    const t = a.transport() as MemoryTransport;
    const before = t.sent.length;
    const times: number[] = [];
    const orig = t.send.bind(t);
    t.send = (m, to) => {
      if (!times.length || times[times.length - 1] !== w.sched.now()) times.push(w.sched.now());
      orig(m, to);
    };
    for (let i = 0; i < 50; i++) {
      a.app.addItem(listA, { text: `y${i}` });
      await w.sched.advance(200);
    }
    await w.settle(10_000);
    const events = new Set(t.sent.slice(before).map((m) => m.id)).size;
    expect(events).toBeLessThanOrEqual(11); // 10 s aan wijzigingen → ≤ 1/s (+1)
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(1000);
  });

  it('S-21: herpublicatie na alleen ontvangen wijzigingen gebruikt een venster van 3000 ms', async () => {
    const w = await makeWorld();
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B');
    const ids = await shareAndJoin(w, a, [b]);
    const tb = b.transport() as MemoryTransport;
    const before = tb.sent.length;
    a.app.addItem(ids.get(a)!, { text: 'van A' });
    await w.sched.advance(1_100); // A publiceert na 1 s; B ontvangt
    await w.sched.advance(2_500);
    expect(tb.sent.length).toBe(before); // nog niet: venster 3 s
    await w.sched.advance(1_000);
    expect(tb.sent.length).toBeGreaterThan(before);
  });
});
