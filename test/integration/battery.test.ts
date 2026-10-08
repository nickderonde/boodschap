// NF-11: zuinig met batterij en data — geen timers < 30 s in rust, sockets dicht bij achtergrond, geen herpublicatie
// zonder wijziging. Op de hub (virtuele tijd), zodat de timers zichtbaar zijn.
import { addDevice, makeWorld, shareAndJoin } from '../sim/hub';
import type { MemoryTransport } from '../../src/sync/transports/memory/MemoryTransport';

describe('NF-11: batterij en data', () => {
  it('NF-11: in rust geen herhalende timers (geen polling); geen herpublicatie zonder wijziging', async () => {
    const w = await makeWorld();
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B');
    await shareAndJoin(w, a, [b]);
    await w.settle(120_000);
    const owner = `A#${a.incarnation}`;
    const sent = (a.transport() as MemoryTransport).sent.length;
    // Na een rustperiode van 10 minuten mogen er geen timers meer staan (alles event-gedreven).
    await w.settle(10 * 60_000);
    expect(w.sched.pending(owner)).toBe(0);
    expect((a.transport() as MemoryTransport).sent.length).toBe(sent);
  });

  it('NF-11: achtergrond → verbindingen dicht en alle timers van de engine gestopt', async () => {
    const w = await makeWorld();
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B');
    const ids = await shareAndJoin(w, a, [b]);
    a.app.addItem(ids.get(a)!, { text: 'x' });
    const bg = a.app.background();
    await w.sched.advance(3_000);
    await bg;
    const t = a.transport() as MemoryTransport;
    for (const ep of t.endpoints) expect(t.isOpen(ep)).toBe(false);
    await w.sched.advance(1_000);
    expect(w.sched.pending(`A#${a.incarnation}`)).toBe(0);
  });
});
