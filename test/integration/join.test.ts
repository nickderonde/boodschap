// F-13 / F-14 / F-15 (WS): delen en koppelen.
import { addWsDevice, makeWsWorld, names, sleep, waitFor, wsShareAndJoin, type WsWorld } from '../sim/ws';

let w: WsWorld;
afterEach(async () => {
  await w?.stop();
});

describe('F-14: lijst koppelen (WS)', () => {
  it('F-14 / H-01: A deelt en gaat offline; B koppelt en ziet de volledige lijst (staat op de relays)', async () => {
    w = await makeWsWorld(2);
    const a = await addWsDevice(w, 'A');
    const b = await addWsDevice(w, 'B');
    const listA = a.app.lists()[0].id;
    for (const t of ['melk', 'brood', 'kaas']) a.app.addItem(listA, { text: t });
    await a.app.flushWrites();
    const info = await a.app.share(listA);
    await waitFor(async () => (await a.app.shareInfo(listA)).ready); // "Klaar om te koppelen"
    a.net.online(false);
    await a.shutdown();
    const r = await b.app.join(info.text);
    expect(r.kind).toBe('joined');
    if (r.kind !== 'joined') return;
    await waitFor(() => !b.app.syncStatus(r.listId).fetching);
    expect(names(b, r.listId)).toEqual(['brood', 'kaas', 'melk']);
    expect(b.app.view(r.listId).name).toBe('Boodschappen');
  });

  it('F-14: beschadigde code → Nederlandse foutcode, geen crash, geen lijst; dubbel koppelen → bestaande lijst', async () => {
    w = await makeWsWorld(1);
    const a = await addWsDevice(w, 'A');
    const b = await addWsDevice(w, 'B');
    const before = b.app.lists().length;
    expect(await b.app.join('hallo')).toEqual({ kind: 'error', code: 'geen-code' });
    const info = await a.app.share(a.app.lists()[0].id);
    const broken = info.code.slice(0, 12) + (info.code[12] === 'A' ? 'B' : 'A') + info.code.slice(13);
    expect(await b.app.join(broken)).toEqual({ kind: 'error', code: 'controlesom' });
    expect(b.app.lists()).toHaveLength(before);
    const j1 = await b.app.join(info.text);
    const j2 = await b.app.join(info.link);
    expect(j1.kind).toBe('joined');
    expect(j2).toEqual({ kind: 'already-present', listId: (j1 as { listId: string }).listId });
    expect(b.app.lists()).toHaveLength(before + 1);
    // A koppelt zijn eigen code: de lijst staat er al.
    expect((await a.app.join(info.code)).kind).toBe('already-present');
  });

  it('F-14 / L-2: één lege snelle relay en één gevulde relay met 500 ms vertraging → "Ophalen…" en daarna de volledige lijst, nooit een lege of halve lijst', async () => {
    w = await makeWsWorld(2);
    const [fast, slow] = w.relays;
    const a = await addWsDevice(w, 'A', { endpoints: [slow.url] });
    const listA = a.app.lists()[0].id;
    for (let i = 0; i < 10; i++) a.app.addItem(listA, { text: `artikel ${i}` });
    const info = await a.app.share(listA);
    await waitFor(async () => (await a.app.shareInfo(listA)).ready);
    slow.faults.latencyMs = 500;
    const b = await addWsDevice(w, 'B', { endpoints: [fast.url, slow.url] });
    const r = await b.app.join(info.text);
    if (r.kind !== 'joined') throw new Error();
    const seenTotals = new Set<number>();
    const t0 = Date.now();
    while (b.app.syncStatus(r.listId).fetching && Date.now() - t0 < 12_000) {
      seenTotals.add(b.app.view(r.listId).total);
      expect(b.app.syncStatus(r.listId)).toMatchObject({ kind: 'bezig', fetching: true }); // "Ophalen…"
      await sleep(20);
    }
    expect([...seenTotals]).toEqual([0]); // tijdens het ophalen: niets getoond
    expect(b.app.view(r.listId).total).toBe(10); // daarna in één keer de volledige lijst
  });

  it('F-14 (b): alle open relays EOSE zonder data → lege lijst; (c) na 10 s afgesloten', async () => {
    w = await makeWsWorld(1);
    const a = await addWsDevice(w, 'A');
    const listA = a.app.lists()[0].id;
    // A deelt maar komt nooit online: de relay heeft niets.
    a.net.online(false);
    const info = await a.app.share(listA);
    const b = await addWsDevice(w, 'B');
    const r = await b.app.join(info.text);
    if (r.kind !== 'joined') throw new Error();
    const ms = await waitFor(() => !b.app.syncStatus(r.listId).fetching, 12_000);
    expect(ms).toBeLessThan(10_500);
    expect(b.app.view(r.listId).total).toBe(0);
    expect(b.app.view(r.listId).name).toBe('Gedeelde lijst');
  });

  it('F-14 (c): geen EOSE (relay reageert niet) → na 10 s afgesloten met een lege lijst', async () => {
    w = await makeWsWorld(1);
    const a = await addWsDevice(w, 'A');
    const info = await a.app.share(a.app.lists()[0].id);
    a.net.online(false);
    w.relays[0].faults.latencyMs = 20_000; // EOSE komt niet binnen 10 s
    const b = await addWsDevice(w, 'B');
    const r = await b.app.join(info.text);
    if (r.kind !== 'joined') throw new Error();
    const ms = await waitFor(() => !b.app.syncStatus(r.listId).fetching, 15_000, 100);
    expect(ms).toBeGreaterThan(9_000);
    expect(ms).toBeLessThan(11_500);
    expect(b.app.view(r.listId).total).toBe(0);
  }, 20_000);

  it('F-14 / E-15: geen publicatie zolang joined_pending', async () => {
    w = await makeWsWorld(1);
    const a = await addWsDevice(w, 'A');
    const info = await a.app.share(a.app.lists()[0].id);
    a.net.online(false);
    w.relays[0].wipe(); // relay leeg: B blijft tot de time-out "Ophalen…"
    w.relays[0].faults.latencyMs = 3_000; // EOSE pas na 3 s
    const b = await addWsDevice(w, 'B');
    const r = await b.app.join(info.text);
    if (r.kind !== 'joined') throw new Error();
    await sleep(1_500);
    expect(b.app.syncStatus(r.listId).fetching).toBe(true);
    const bPub = b.app.sharedLists()[0].identity.id;
    expect(w.relays[0].dumpEvents().filter((e) => e.pubkey === bPub)).toHaveLength(0);
  });

  it('F-13: een lijst die nooit gedeeld is, gebruikt geen netwerk', async () => {
    w = await makeWsWorld(1);
    const a = await addWsDevice(w, 'A');
    a.app.addItem(a.app.lists()[0].id, { text: 'melk' });
    a.app.createList('Tweede');
    await sleep(300);
    expect(w.factories.get(a)!.urls).toEqual([]);
    expect(w.relays[0].connectionsAccepted).toBe(0);
  });

  it('F-16 (WS): drie apparaten op één lijst', async () => {
    w = await makeWsWorld(2);
    const [a, b, c] = [await addWsDevice(w, 'A'), await addWsDevice(w, 'B'), await addWsDevice(w, 'C')];
    const ids = await wsShareAndJoin(a, [b, c]);
    a.app.addItem(ids.get(a)!, { text: 'van A' });
    b.app.addItem(ids.get(b)!, { text: 'van B' });
    c.app.addItem(ids.get(c)!, { text: 'van C' });
    await waitFor(() => [a, b, c].every((d) => names(d, ids.get(d)!).length === 3), 10_000);
    expect(names(c, ids.get(c)!)).toEqual(['van A', 'van B', 'van C']);
  });
});
