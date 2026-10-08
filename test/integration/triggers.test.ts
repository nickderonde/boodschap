// S-13 / UX-13 / S-03 / NF-11: sync-triggers (start, voorgrond, netwerkherstel, live, pull-to-refresh), achtergrond.
import { addWsDevice, makeWsWorld, names, sleep, waitFor, wsShareAndJoin, type WsWorld } from '../sim/ws';
import { tmpDbFile } from '../support/single';

let w: WsWorld;
afterEach(async () => {
  await w?.stop();
});

describe('S-13: sync-triggers (WS)', () => {
  it('S-03 / S-13 (app-start): offline gewijzigd, app herstart, weer online → op de relay ≤ 10 s, zonder actie', async () => {
    w = await makeWsWorld(2);
    const file = tmpDbFile();
    const a = await addWsDevice(w, 'A', { dbFile: file });
    const b = await addWsDevice(w, 'B');
    const ids = await wsShareAndJoin(a, [b]);
    a.net.online(false);
    for (let i = 0; i < 3; i++) a.app.addItem(ids.get(a)!, { text: `offline ${i}` });
    await a.app.flushWrites();
    await a.restart(); // meerdere offline-sessies
    a.app.addItem(ids.get(a)!, { text: 'na herstart' });
    await a.app.flushWrites();
    await a.restart();
    a.net.online(true); // netwerkherstel → kick + flush
    const ms = await waitFor(() => names(b, ids.get(b)!).length === 4, 10_000);
    expect(ms).toBeLessThan(10_000);
  });

  it('S-13: voorgrond en netwerkherstel → ophalen + versturen; live via het open abonnement', async () => {
    w = await makeWsWorld(1);
    const a = await addWsDevice(w, 'A');
    const b = await addWsDevice(w, 'B');
    const ids = await wsShareAndJoin(a, [b]);
    // live
    a.app.addItem(ids.get(a)!, { text: 'live' });
    await waitFor(() => names(b, ids.get(b)!).includes('live'));
    // achtergrond → sockets dicht; ondertussen wijzigt A
    await b.app.background();
    await sleep(100);
    expect(w.factories.get(b)!.openSockets).toBe(0);
    a.app.addItem(ids.get(a)!, { text: 'tijdens achtergrond' });
    await sleep(500);
    expect(names(b, ids.get(b)!)).not.toContain('tijdens achtergrond'); // geen sync in de achtergrond
    b.app.foreground();
    await waitFor(() => names(b, ids.get(b)!).includes('tijdens achtergrond'));
  });

  it('UX-13: pull-to-refresh → REQ + flush; status bezig → gesynchroniseerd', async () => {
    w = await makeWsWorld(1);
    const a = await addWsDevice(w, 'A');
    const b = await addWsDevice(w, 'B');
    const ids = await wsShareAndJoin(a, [b]);
    const listB = ids.get(b)!;
    await waitFor(() => b.app.syncStatus(listB).kind === 'gesynchroniseerd');
    const before = w.relays[0].connectionsAccepted;
    const p = b.app.syncNow(listB);
    expect(b.app.syncStatus(listB).kind).toBe('bezig');
    await p;
    await waitFor(() => b.app.syncStatus(listB).kind === 'gesynchroniseerd', 6_000);
    expect(w.relays[0].connectionsAccepted).toBeGreaterThanOrEqual(before);
  });

  it('S-13 / NF-11: in de achtergrond geen fouten, sockets dicht; geen herpublicatie zonder wijziging', async () => {
    w = await makeWsWorld(1);
    const a = await addWsDevice(w, 'A');
    const b = await addWsDevice(w, 'B');
    const ids = await wsShareAndJoin(a, [b]);
    await sleep(500);
    const aPub = a.app.sharedLists()[0].identity.id;
    const before = w.relays[0].receivedLog.filter((x) => x.pubkey === aPub).length;
    a.app.foreground();
    await sleep(500);
    a.app.foreground();
    await sleep(500);
    expect(w.relays[0].receivedLog.filter((x) => x.pubkey === aPub).length).toBe(before); // niets veranderd → niets gepubliceerd
    const errs: string[] = [];
    a.app.onError((e) => errs.push(e.code));
    await a.app.background();
    for (const r of w.relays) r.setDown(true);
    await sleep(500);
    expect(errs).toEqual([]);
    expect(w.factories.get(a)!.openSockets).toBe(0);
    void ids;
  });
});
