// NF-01 / NF-02 / NF-03 / NF-05 / NF-06 (WS): versleuteling, aanvaller, metadata, logs en netwerk.
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import { addWsDevice, makeWsWorld, names, sleep, waitFor, wsShareAndJoin, type WsWorld } from '../sim/ws';
import { canonicalList } from '../../src/core/canonical';
import { open } from '../../src/core/crypto/aead';
import { buildAad } from '../../src/core/crypto/aead';
import { fromBase64 } from '../../src/core/bytes';
import { SeededRandom } from '../support/SeededRandom';
import type { NEvent } from '../relay/RelayCore';

let w: WsWorld;
afterEach(async () => {
  await w?.stop();
});

const SECRETS = ['halfvolle melk', 'Weekendboodschappen', 'notitie-geheim-1234', 'Hondenbrokken XL', 'pindakaas-extra'];

describe('NF-01: geen leesbare gebruikersinhoud in events of logs', () => {
  it('NF-01: unieke testteksten (≥ 7 tekens) en categorie-ID\'s komen niet voor in dumpEvents() of de logs', async () => {
    w = await makeWsWorld(2);
    const a = await addWsDevice(w, 'A');
    const b = await addWsDevice(w, 'B');
    const listA = a.app.lists()[0].id;
    a.app.renameList(listA, SECRETS[1]);
    a.app.addItem(listA, { text: SECRETS[0], note: SECRETS[2], quantity: 7, unit: 'pak' });
    a.app.addItem(listA, { text: SECRETS[3] });
    const ids = await wsShareAndJoin(a, [b]);
    b.app.addItem(ids.get(b)!, { text: SECRETS[4] });
    await waitFor(() => names(a, listA).length === 3);
    const dump = JSON.stringify(w.relays.flatMap((r) => r.dumpEvents()));
    const logs = a.log.text() + b.log.text();
    for (const s of [...SECRETS, 'zuivel-eieren', 'huisdieren', 'Boodschappen']) {
      expect([s, dump.includes(s)]).toEqual([s, false]);
      expect([s, logs.includes(s)]).toEqual([s, false]);
    }
  });
});

describe('NF-02: een derde die de relay leest, kan niets lezen of wijzigen', () => {
  it('NF-02 (a–e): zonder sleutel niet te ontsleutelen; eigen sleutel + onze d-tag of gekopieerde content → genegeerd; replay en kind-5 van een vreemde → geen effect', async () => {
    w = await makeWsWorld(1);
    const a = await addWsDevice(w, 'A');
    const b = await addWsDevice(w, 'B');
    const ids = await wsShareAndJoin(a, [b]);
    a.app.addItem(ids.get(a)!, { text: 'geheim artikel' });
    await waitFor(() => names(b, ids.get(b)!).length === 1);
    const aPub = a.app.sharedLists()[0].identity.id;
    const real = w.relays[0].dumpEvents().find((e) => e.pubkey === aPub)!;
    const d = real.tags[0][1];
    const [tag, slot] = d.split(':');
    // (a) zonder de lijstsleutel: ontsleutelen faalt
    expect(() => open(new SeededRandom(1).bytes(32), buildAad(aPub, tag, Number(slot)), fromBase64(real.content))).toThrow();
    const before = canonicalList(b.app.stateOf(ids.get(b)!));
    const attacker = new SeededRandom(99).bytes(32);
    const now = Math.floor(Date.now() / 1000);
    // (c) gekopieerde content onder eigen sleutel en onze d-tag → AAD klopt niet → genegeerd
    const copied = finalizeEvent({ kind: 30078, created_at: now + 5, tags: [['d', d]], content: real.content }, attacker) as NEvent;
    w.relays[0].core.handleEvent(copied, 1000);
    // (e) kind-5 van een vreemde tegen A's event → geen effect (de relay verwijdert alleen eigen events)
    const del = finalizeEvent({ kind: 5, created_at: now, tags: [['e', real.id]], content: '' }, attacker) as NEvent;
    w.relays[0].core.handleEvent(del, 200);
    expect(w.relays[0].dumpEvents().some((e) => e.id === real.id)).toBe(true);
    // (d) replay van het echte event → geen effect
    w.relays[0].dropConnections();
    b.app.foreground();
    await sleep(1_000);
    expect(canonicalList(b.app.stateOf(ids.get(b)!))).toBe(before);
    expect(getPublicKey(attacker)).not.toBe(aPub);
  });
});

describe('NF-03 / NF-05: metadata en logs', () => {
  it('NF-03: alleen een d-tag; d niet afgeleid van de naam; 2 lijsten → 2 pubkeys; geen kind 0', async () => {
    w = await makeWsWorld(1);
    const a = await addWsDevice(w, 'A');
    const l1 = a.app.lists()[0].id;
    const l2 = a.app.createList('Boodschappen').result.listId; // zelfde naam
    await a.app.share(l1);
    await a.app.share(l2);
    await waitFor(() => new Set(w.relays[0].dumpEvents().map((e) => e.pubkey)).size === 2, 10_000);
    const evs = w.relays[0].dumpEvents();
    for (const e of evs) {
      expect(e.kind).toBe(30078);
      expect(e.tags).toHaveLength(1);
      expect(e.tags[0][0]).toBe('d');
      expect(e.tags[0][1]).toMatch(/^[0-9a-f]{32}:\d{1,2}$/);
    }
    const tags = new Set(evs.map((e) => e.tags[0][1].split(':')[0]));
    expect(tags.size).toBe(2); // zelfde naam, toch verschillende tags
    expect(evs.some((e) => e.kind === 0)).toBe(false);
  });

  it('NF-05: deelcode en payload komen niet in de logs tijdens delen en koppelen', async () => {
    w = await makeWsWorld(1);
    const a = await addWsDevice(w, 'A');
    const b = await addWsDevice(w, 'B');
    const listA = a.app.lists()[0].id;
    const info = await a.app.share(listA);
    await b.app.join(info.text);
    await sleep(300);
    const logs = a.log.text() + b.log.text();
    const code = info.code.replace(/^BS1-/, '');
    expect(logs).not.toContain(code.slice(0, 16));
    expect(logs).not.toContain(info.link.split('#')[1].slice(0, 16));
    const secretHex = a.keys.data.get(`bs.list.${listA}.secret`)!;
    expect(logs).not.toContain(secretHex);
  });
});

describe('NF-06: geen andere netwerkverbindingen', () => {
  it('NF-06: elke WebSocket-URL hoort bij de relayset; fetch en XMLHttpRequest gooien', async () => {
    w = await makeWsWorld(2);
    const a = await addWsDevice(w, 'A');
    const b = await addWsDevice(w, 'B');
    const ids = await wsShareAndJoin(a, [b]);
    a.app.addItem(ids.get(a)!, { text: 'x' });
    await waitFor(() => names(b, ids.get(b)!).length === 1);
    for (const d of [a, b]) for (const url of w.factories.get(d)!.urls) expect(w.urls).toContain(url);
    expect(() => (globalThis as unknown as { fetch: () => void }).fetch()).toThrow(/NF-06/);
    expect(() => new (globalThis as unknown as { XMLHttpRequest: new () => unknown }).XMLHttpRequest()).toThrow(/NF-06/);
  });
});
