// S-10: herstel na relay-dataverlies en gelijke created_at (WS). Plus B-2 tegen de WS-relay.
import { addWsDevice, makeWsWorld, names, sleep, waitFor, wsShareAndJoin, type WsWorld } from '../sim/ws';

let w: WsWorld;
afterEach(async () => {
  await w?.stop();
});

const lastId = async (d: Awaited<ReturnType<typeof addWsDevice>>, listId: string) => (await d.app.readShards(listId))!.shards.get(0)!;

describe('S-10: relay-dataverlies (WS)', () => {
  it('S-10a: relay herstart zonder data → elk apparaat publiceert zijn eigen staat opnieuw; convergentie', async () => {
    w = await makeWsWorld(1);
    const a = await addWsDevice(w, 'A');
    const b = await addWsDevice(w, 'B');
    const ids = await wsShareAndJoin(a, [b]);
    a.app.addItem(ids.get(a)!, { text: 'van A' });
    b.app.addItem(ids.get(b)!, { text: 'van B' });
    await waitFor(() => names(a, ids.get(a)!).length === 2 && names(b, ids.get(b)!).length === 2);
    w.relays[0].wipe();
    w.relays[0].dropConnections(); // relay "herstart"
    const aPub = a.app.sharedLists()[0].identity.id;
    const bPub = b.app.sharedLists()[0].identity.id;
    await waitFor(() => {
      const ev = w.relays[0].dumpEvents();
      return ev.some((e) => e.pubkey === aPub) && ev.some((e) => e.pubkey === bPub);
    }, 10_000);
    // Een nieuw lid krijgt alles van de relay.
    const c = await addWsDevice(w, 'C');
    const info = await a.app.shareInfo(ids.get(a)!);
    const j = await c.app.join(info.text);
    if (j.kind === 'error') throw new Error();
    await waitFor(() => names(c, j.listId).length === 2);
  });

  it('S-10b: twee eigen publicaties in dezelfde seconde → de nieuwste wint (ook na een kill tussen de twee)', async () => {
    w = await makeWsWorld(1);
    const a = await addWsDevice(w, 'A');
    const b = await addWsDevice(w, 'B');
    const ids = await wsShareAndJoin(a, [b]);
    const listA = ids.get(a)!;
    await a.app.addItem(listA, { text: 'eerste' }).committed;
    await a.app.syncEngine!.flushNow(listA);
    const r1 = await lastId(a, listA);
    await a.restart();
    await a.app.addItem(listA, { text: 'tweede' }).committed;
    await a.app.syncEngine!.flushNow(listA);
    const r2 = await lastId(a, listA);
    expect(r2.lastVersion).toBeGreaterThan(r1.lastVersion);
    await waitFor(() => w.relays[0].dumpEvents().some((e) => e.id === r2.lastEventId));
    expect(w.relays[0].dumpEvents().some((e) => e.id === r1.lastEventId)).toBe(false); // vervangen
    await waitFor(() => names(b, ids.get(b)!).length === 2);
  });

  it('S-10c: relay levert alleen een oude eigen staat terug → apparaat publiceert opnieuw', async () => {
    w = await makeWsWorld(1);
    const a = await addWsDevice(w, 'A');
    const b = await addWsDevice(w, 'B');
    const ids = await wsShareAndJoin(a, [b]);
    const listA = ids.get(a)!;
    a.app.addItem(listA, { text: 'oud' });
    await waitFor(async () => a.app.syncStatus(listA).kind === 'gesynchroniseerd');
    const old = w.relays[0].dumpEvents().find((e) => e.pubkey === a.app.sharedLists()[0].identity.id)!;
    a.app.addItem(listA, { text: 'nieuw' });
    await waitFor(async () => (await lastId(a, listA)).lastEventId !== old.id && w.relays[0].dumpEvents().some((e) => e.id !== old.id && e.pubkey === old.pubkey));
    // De relay verliest het nieuwe event en heeft alleen het oude nog.
    w.relays[0].wipe();
    w.relays[0].core.handleEvent(old, 1000);
    w.relays[0].dropConnections();
    const newest = (await lastId(a, listA)).lastEventId;
    a.app.foreground();
    await waitFor(() => w.relays[0].dumpEvents().some((e) => e.id === newest), 10_000);
  });

  it('S-10d: een relay die zonder OK laat vallen → maximaal 5 retries, daarna herstel via de eigen-staatcontrole na EOSE', async () => {
    w = await makeWsWorld(1);
    const a = await addWsDevice(w, 'A', { config: { publishTimeoutMs: 200, retryDelaysMs: [50, 50, 50, 50, 50] } });
    const b = await addWsDevice(w, 'B');
    const ids = await wsShareAndJoin(a, [b]);
    const listA = ids.get(a)!;
    w.relays[0].faults.silentDrop = true;
    const aPub = a.app.sharedLists()[0].identity.id;
    const before = w.relays[0].receivedLog.length;
    a.app.addItem(listA, { text: 'stil' });
    await sleep(3_000);
    const fromA = w.relays[0].receivedLog.slice(before).filter((x) => x.pubkey === aPub);
    expect(fromA).toHaveLength(1 + 5); // eerste verzending + maximaal 5 retries
    expect(new Set(fromA.map((x) => x.id)).size).toBe(1); // steeds hetzelfde event
    w.relays[0].faults.silentDrop = false;
    w.relays[0].dropConnections(); // nieuwe REQ → EOSE → eigen-staatcontrole
    await waitFor(() => names(b, ids.get(b)!).includes('stil'), 10_000);
  });

  it('B-2 (WS): gelijktijdige flushes → strikt stijgende versies; de relay houdt het nieuwste event', async () => {
    w = await makeWsWorld(1);
    const a = await addWsDevice(w, 'A');
    const b = await addWsDevice(w, 'B');
    const ids = await wsShareAndJoin(a, [b]);
    const listA = ids.get(a)!;
    const eng = a.app.syncEngine!;
    const versions: number[] = [];
    const t = a.transport()!;
    const orig = t.prepare.bind(t);
    t.prepare = async (p) => {
      await sleep(30); // prepare laat even wachten (in-prepare)
      const m = await orig(p);
      versions.push(m.version);
      return m;
    };
    const ps: Promise<void>[] = [];
    for (let i = 0; i < 4; i++) {
      await a.app.addItem(listA, { text: `c${i}` }).committed;
      ps.push(eng.flushNow(listA));
    }
    await Promise.all(ps);
    for (let i = 1; i < versions.length; i++) expect(versions[i]).toBeGreaterThan(versions[i - 1]);
    const newest = (await lastId(a, listA)).lastEventId;
    await waitFor(() => w.relays[0].dumpEvents().some((e) => e.id === newest));
    await waitFor(() => names(b, ids.get(b)!).length === 4);
  });
});
