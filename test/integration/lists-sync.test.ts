// F-01 (sync), F-18, S-07 en S-04 tegen de WS-relay (2 apparaten).
import { addWsDevice, makeWsWorld, names, sleep, waitFor, wsShareAndJoin, type WsWorld } from '../sim/ws';
import { canonicalList } from '../../src/core/canonical';

let w: WsWorld;
afterEach(async () => {
  await w?.stop();
});

describe('F-01: hernoemen en verwijderen syncen (WS, 2 apparaten)', () => {
  it('F-01: hernoemen synct; verwijderen van een gedeelde lijst verwijdert hem op beide apparaten', async () => {
    w = await makeWsWorld(1);
    const a = await addWsDevice(w, 'A');
    const b = await addWsDevice(w, 'B');
    const ids = await wsShareAndJoin(a, [b]);
    a.app.renameList(ids.get(a)!, 'Weekmarkt');
    await waitFor(() => b.app.view(ids.get(b)!).name === 'Weekmarkt');
    const errors: string[] = [];
    b.app.onError((e) => errors.push(e.code));
    await a.app.deleteList(ids.get(a)!);
    expect(a.app.lists().some((l) => l.id === ids.get(a))).toBe(false); // direct uit de UI
    await waitFor(() => !b.app.lists().some((l) => l.id === ids.get(b)), 10_000);
    expect(errors).toContain('lijst-verwijderd-door-ander');
    // A heeft de lijst na de ack definitief afgerond: sleutels weg
    await waitFor(() => ![...a.keys.data.keys()].some((k) => k.includes(ids.get(a)!)), 10_000);
  });
});

describe('F-18: stoppen met delen / lijst verlaten (WS)', () => {
  it('F-18: sleutels weg, geen events meer van dit apparaat, de ander werkt door, lokale kopie blijft', async () => {
    w = await makeWsWorld(1);
    const a = await addWsDevice(w, 'A');
    const b = await addWsDevice(w, 'B');
    const ids = await wsShareAndJoin(a, [b]);
    a.app.addItem(ids.get(a)!, { text: 'gedeeld' });
    await waitFor(() => names(b, ids.get(b)!).length === 1);
    await waitFor(() => b.app.syncStatus(ids.get(b)!).kind === 'gesynchroniseerd');
    await sleep(300); // eigen herpublicatie van B na ontvangst afgerond
    const bPub = b.app.sharedLists()[0].identity.id;
    await b.app.leave(ids.get(b)!, true);
    await sleep(100);
    expect([...b.keys.data.keys()].filter((k) => k.includes(ids.get(b)!))).toEqual([]);
    expect(b.app.lists().find((l) => l.id === ids.get(b))).toMatchObject({ shared: false });
    expect(names(b, ids.get(b)!)).toEqual(['Gedeeld']);
    const before = w.relays[0].receivedLog.filter((x) => x.pubkey === bPub).length;
    b.app.addItem(ids.get(b)!, { text: 'alleen lokaal' });
    a.app.addItem(ids.get(a)!, { text: 'A gaat door' });
    await sleep(800);
    expect(w.relays[0].receivedLog.filter((x) => x.pubkey === bPub).length).toBe(before);
    expect(names(a, ids.get(a)!)).toEqual(['A gaat door', 'Gedeeld']);
    expect(names(b, ids.get(b)!)).toEqual(['Alleen lokaal', 'Gedeeld']);
    expect(b.app.syncStatus(ids.get(b)!).kind).toBe('lokaal');
  });
});

describe('S-07 / S-04 tegen de WS-relay', () => {
  it('S-07b (WS): A verwijdert, B bewerkt later → item terug op beide', async () => {
    w = await makeWsWorld(1);
    const a = await addWsDevice(w, 'A');
    const b = await addWsDevice(w, 'B');
    const ids = await wsShareAndJoin(a, [b]);
    const r = a.app.addItem(ids.get(a)!, { text: 'kaas' }).result;
    if (r.kind !== 'added') throw new Error();
    await waitFor(() => names(b, ids.get(b)!).length === 1);
    a.net.online(false);
    b.net.online(false);
    a.app.deleteItem(ids.get(a)!, r.itemId);
    await sleep(20);
    b.app.updateItem(ids.get(b)!, r.itemId, { name: 'oude kaas' });
    a.net.online(true);
    b.net.online(true);
    await waitFor(() => names(a, ids.get(a)!).join() === 'Oude kaas' && names(b, ids.get(b)!).join() === 'Oude kaas', 10_000);
  });

  it('S-04 (WS-variant): gelijktijdige offline bewerkingen op 2 apparaten → gelijke staat', async () => {
    w = await makeWsWorld(2);
    const a = await addWsDevice(w, 'A');
    const b = await addWsDevice(w, 'B');
    const ids = await wsShareAndJoin(a, [b]);
    const brood = a.app.addItem(ids.get(a)!, { text: 'brood' }).result;
    if (brood.kind !== 'added') throw new Error();
    await waitFor(() => names(b, ids.get(b)!).length === 1);
    a.net.online(false);
    b.net.online(false);
    // H-03
    a.app.addItem(ids.get(a)!, { text: 'melk' });
    a.app.updateItem(ids.get(a)!, brood.itemId, { name: 'volkorenbrood' });
    b.app.addItem(ids.get(b)!, { text: 'kaas' });
    b.app.updateItem(ids.get(b)!, brood.itemId, { quantity: 2 });
    a.net.online(true);
    b.net.online(true);
    await waitFor(() => canonicalList(a.app.stateOf(ids.get(a)!)) === canonicalList(b.app.stateOf(ids.get(b)!)) && names(a, ids.get(a)!).length === 3, 10_000);
    expect(names(b, ids.get(b)!)).toEqual(['Kaas', 'Melk', 'Volkorenbrood']);
    expect(b.app.view(ids.get(b)!).sections.flatMap((s) => s.items).find((i) => i.name === 'Volkorenbrood')?.quantity).toBe(2);
  });
});
