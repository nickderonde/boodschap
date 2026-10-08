// S-08: het andere apparaat komt later online (relay als brievenbus), WS.
import { addWsDevice, makeWsWorld, names, waitFor, wsShareAndJoin, type WsWorld } from '../sim/ws';

let w: WsWorld;
afterEach(async () => {
  await w?.stop();
});

describe('S-08: relay als brievenbus (WS)', () => {
  it('S-08a: B is offline terwijl A 50 wijzigingen doet; B online → gelijk binnen 10 s', async () => {
    w = await makeWsWorld(3);
    const a = await addWsDevice(w, 'A');
    const b = await addWsDevice(w, 'B');
    const ids = await wsShareAndJoin(a, [b]);
    b.net.online(false);
    const listA = ids.get(a)!;
    for (let i = 0; i < 50; i++) a.app.addItem(listA, { text: `w${i}` });
    await waitFor(async () => a.app.syncStatus(listA).kind === 'gesynchroniseerd', 10_000);
    b.net.online(true);
    const ms = await waitFor(() => names(b, ids.get(b)!).length === 50, 10_000);
    expect(ms).toBeLessThan(10_000);
  });

  it('S-08b / H-06: A wijzigt en sluit de app vóór B online komt; B krijgt alles zonder A', async () => {
    w = await makeWsWorld(2);
    const a = await addWsDevice(w, 'A');
    const b = await addWsDevice(w, 'B');
    const ids = await wsShareAndJoin(a, [b]);
    b.net.online(false);
    const listA = ids.get(a)!;
    a.app.addItem(listA, { text: 'melk' });
    a.app.addItem(listA, { text: 'eieren' });
    await a.app.background(); // flush + max 2 s wachten op acks + sluiten
    await a.shutdown();
    b.net.online(true);
    await waitFor(() => names(b, ids.get(b)!).length === 2, 10_000);
    expect(names(b, ids.get(b)!)).toEqual(['Eieren', 'Melk']);
  });

  it('S-08c: B 7 dagen offline (gesimuleerde klok) → idem', async () => {
    w = await makeWsWorld(2);
    const a = await addWsDevice(w, 'A');
    const b = await addWsDevice(w, 'B');
    const ids = await wsShareAndJoin(a, [b]);
    b.net.online(false);
    const WEEK = 7 * 86_400_000;
    // Een week verstrijkt voor iedereen (relays en apparaten).
    for (const r of w.relays) r.clockOffsetMs = WEEK;
    a.clock.offsetMs = WEEK;
    b.clock.offsetMs = WEEK;
    a.app.addItem(ids.get(a)!, { text: 'na een week' });
    await waitFor(() => a.app.syncStatus(ids.get(a)!).kind === 'gesynchroniseerd', 10_000);
    b.net.online(true);
    await waitFor(() => names(b, ids.get(b)!).includes('Na een week'), 10_000);
    b.app.addItem(ids.get(b)!, { text: 'antwoord van B' });
    await waitFor(() => names(a, ids.get(a)!).includes('Antwoord van B'), 10_000);
  });
});
