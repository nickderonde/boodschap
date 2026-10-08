// Acceptatietests (Eindtester) tegen de lokale WebSocket-test-relay met echte Nostr-events, echte handtekeningen en
// productievensters: derde partij (NF-01..NF-03, S-14, S-11), latentie (S-12, S-03) en eventgrootte van 1000 items (S-15).
import { randomBytes } from 'node:crypto';
import WebSocket from 'ws';
import { finalizeEvent, getEventHash, getPublicKey } from 'nostr-tools/pure';
import { addWsDevice, makeWsWorld, names, sleep, waitFor, wsShareAndJoin, type WsWorld } from '../sim/ws';
import type { NEvent } from '../relay/RelayCore';
import type { TestDevice } from '../sim/device';
import { DEFAULT_CONFIG } from '../../src/config';
import { canonicalOf, lcgWords } from './helpers';

let w: WsWorld;
afterEach(async () => {
  await w?.stop();
});

const PROD = {
  localWindowMs: DEFAULT_CONFIG.localWindowMs,
  remoteWindowMs: DEFAULT_CONFIG.remoteWindowMs,
  minFlushGapMs: DEFAULT_CONFIG.minFlushGapMs,
  statusThrottleMs: DEFAULT_CONFIG.statusThrottleMs,
};

/** De aanvaller: een gewone WebSocket-client van de relay. Geeft het OK-antwoord terug. */
function attackerSend(url: string, ev: unknown): Promise<string> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    const done = (s: string) => {
      try {
        ws.terminate();
      } catch {
        /* */
      }
      resolve(s);
    };
    const t = setTimeout(() => done('timeout'), 3_000);
    ws.on('open', () => ws.send(JSON.stringify(['EVENT', ev])));
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m[0] === 'OK') {
        clearTimeout(t);
        done(`${m[2]}:${m[3]}`);
      }
    });
    ws.on('error', () => done('error'));
  });
}

function eventsOf(w0: WsWorld, pubkey?: string): NEvent[] {
  return w0.relays.flatMap((r) => r.dumpEvents()).filter((e) => !pubkey || e.pubkey === pubkey);
}

/** Pubkey van het apparaat dat het laatst een event op de relay zette, bepaald uit de relay zelf (zoals een aanvaller). */
function newest(evs: NEvent[]): NEvent {
  return [...evs].sort((a, b) => b.created_at - a.created_at)[0];
}

describe('NF-01 / NF-03: een lezer van de relay ziet geen inhoud en kan lijsten niet koppelen', () => {
  const SECRETS = ['Zondagse-Barbecue-lijst', 'Gehaktballetjes-Spezial', 'allergisch-voor-pinda-notitie', 'Bio Hummus Extra', 'bakjes-groot'];
  it('ET-NF01-1: namen, notities, lijstnaam en eenheden komen niet leesbaar voor in events of logs; alleen een d-tag; geen kind 0', async () => {
    w = await makeWsWorld(2);
    const a = await addWsDevice(w, 'A');
    const b = await addWsDevice(w, 'B');
    const la = a.app.lists()[0].id;
    a.app.renameList(la, SECRETS[0]);
    a.app.addItem(la, { text: SECRETS[1], note: SECRETS[2], quantity: 3, unit: SECRETS[4] });
    const ids = await wsShareAndJoin(a, [b]);
    b.app.addItem(ids.get(b)!, { text: SECRETS[3] });
    await waitFor(() => names(a, la).length === 2, 15_000);
    await sleep(2_500);
    const dump = JSON.stringify(eventsOf(w));
    const logs = a.log.text() + b.log.text();
    for (const s of [...SECRETS, 'zuivel', 'vlees-vis', 'Boodschappen']) {
      expect([s, dump.toLowerCase().includes(s.toLowerCase())]).toEqual([s, false]);
      expect([s, logs.toLowerCase().includes(s.toLowerCase())]).toEqual([s, false]);
    }
    for (const e of eventsOf(w)) {
      expect(e.kind).toBe(30078);
      expect(e.tags.every((t) => t[0] === 'd' && t.length === 2)).toBe(true);
    }
  });

  it('ET-NF03-1: twee identieke lijsten van één toestel krijgen verschillende pubkeys, d-tags en ciphertext', async () => {
    w = await makeWsWorld(1);
    const a = await addWsDevice(w, 'A');
    const l1 = a.app.lists()[0].id;
    const l2 = a.app.createList('Boodschappen').result.listId;
    for (const l of [l1, l2]) a.app.addItem(l, { text: 'identiek item' });
    await a.app.flushWrites();
    await a.app.share(l1);
    await a.app.share(l2);
    await waitFor(() => new Set(eventsOf(w).map((e) => e.pubkey)).size === 2, 15_000);
    const evs = eventsOf(w);
    expect(new Set(evs.map((e) => e.tags[0][1])).size).toBe(evs.length);
    expect(new Set(evs.map((e) => e.tags[0][1].split(':')[0])).size).toBe(2);
    expect(new Set(evs.map((e) => e.content)).size).toBe(evs.length);
  });
});

describe('NF-02 / S-14 / S-11: een derde met toegang tot de relay kan niets vervalsen', () => {
  async function setup(nRelays = 1) {
    w = await makeWsWorld(nRelays);
    const a = await addWsDevice(w, 'A');
    const b = await addWsDevice(w, 'B');
    const ids = await wsShareAndJoin(a, [b]);
    const [la, lb] = [ids.get(a)!, ids.get(b)!];
    a.app.addItem(la, { text: 'echt-1' });
    await waitFor(() => names(b, lb).includes('echt-1'), 15_000);
    await sleep(1_500);
    const errors: string[] = [];
    for (const d of [a, b]) d.app.onError((e) => errors.push(e.code));
    return { a, b, la, lb, relay: w.relays[0], errors };
  }

  async function expectUnchanged(p: Awaited<ReturnType<typeof setup>>, before: { a: string; b: string }) {
    await sleep(1_500);
    expect(canonicalOf(p.a, p.la)).toBe(before.a);
    expect(canonicalOf(p.b, p.lb)).toBe(before.b);
    expect(names(p.b, p.lb)).toEqual(['echt-1']);
  }

  it('ET-NF02-1: eigen sleutelpaar: gekopieerde content, aangepaste ciphertext, willekeurige content, onbekende d-tag, andere kinds, te groot -> staat ongewijzigd, geen foutalarm', async () => {
    const p = await setup();
    const real = newest(eventsOf(w).filter((e) => e.kind === 30078));
    const d = real.tags[0][1];
    const before = { a: canonicalOf(p.a, p.la), b: canonicalOf(p.b, p.lb) };
    const sk = new Uint8Array(randomBytes(32));
    const now = Math.floor(Date.now() / 1000);
    const flip = real.content.slice(0, -4) + (real.content.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    p.relay.maxEventBytes = 10_000_000;
    const attacks = [
      finalizeEvent({ kind: 30078, created_at: now + 5, tags: [['d', d]], content: real.content }, sk), // gekopieerd
      finalizeEvent({ kind: 30078, created_at: now + 6, tags: [['d', d]], content: flip }, sk), // aangepast
      finalizeEvent({ kind: 30078, created_at: now + 600, tags: [['d', d]], content: Buffer.from(randomBytes(120)).toString('base64') }, sk),
      finalizeEvent({ kind: 30078, created_at: now + 7, tags: [['d', 'ffffffffffffffffffffffffffffffff:0']], content: real.content }, sk),
      finalizeEvent({ kind: 1, created_at: now, tags: [], content: 'hallo' }, sk),
      finalizeEvent({ kind: 0, created_at: now, tags: [], content: '{"name":"x"}' }, sk),
      finalizeEvent({ kind: 30078, created_at: now + 8, tags: [['d', d]], content: 'x'.repeat(150_000) }, sk), // te groot
      finalizeEvent({ kind: 5, created_at: now + 9, tags: [['e', real.id]], content: '' }, sk), // verwijderen van andermans event
    ];
    for (const ev of attacks) await attackerSend(p.relay.url, ev);
    expect(getPublicKey(sk)).not.toBe(real.pubkey);
    await expectUnchanged(p, before);
    expect(p.relay.dumpEvents().some((e) => e.id === real.id)).toBe(true); // kind-5 van een vreemde heeft geen effect
    expect(p.errors).toEqual([]);
    for (const dv of [p.a, p.b]) expect(dv.log.lines.filter((l) => l.level === 'error')).toEqual([]);
    // en het systeem werkt gewoon door
    p.a.app.addItem(p.la, { text: 'echt-2' });
    await waitFor(() => names(p.b, p.lb).includes('echt-2'), 15_000);
  }, 60_000);

  it('ET-NF02-2: vervalste events met A\'s pubkey (ongeldige handtekening, id klopt niet, aangepaste inhoud, nieuwere created_at) worden genegeerd en A herstelt de relay', async () => {
    // Een echte relay controleert handtekeningen; alleen een kapotte/kwaadwillende relay slaat zulke events op. Daarom 3 relays,
    // waarvan er 1 de vervalsingen opslaat en doorgeeft (NF-02e: geen permanent verlies, ook niet via een kwaadwillende relay).
    const p = await setup(3);
    const reals = eventsOf(w).filter((e) => e.kind === 30078);
    const aPub = newest(reals).pubkey;
    const real = newest(reals.filter((e) => e.pubkey === aPub));
    const before = { a: canonicalOf(p.a, p.la), b: canonicalOf(p.b, p.lb) };
    p.relay.core.opts.verifySignatures = false; // relay 0 is kwaadwillend/kapot en laat dit toe
    const tampered = real.content.slice(0, -4) + (real.content.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    const base = { kind: 30078, pubkey: aPub, tags: real.tags, sig: real.sig };
    const forgeries: NEvent[] = [];
    // (1) aangepaste content, id opnieuw berekend, handtekening van het origineel (ongeldig)
    const f1 = { ...base, created_at: real.created_at + 100, content: tampered, id: '' };
    f1.id = getEventHash(f1);
    forgeries.push(f1 as NEvent);
    // (2) aangepaste content met het id van het origineel (id klopt niet met de inhoud)
    forgeries.push({ ...base, created_at: real.created_at + 200, content: tampered, id: real.id.replace(/^./, real.id[0] === 'a' ? 'b' : 'a') } as NEvent);
    // (3) willekeurige content, willekeurige sig, ver in de toekomst
    const f3 = { ...base, created_at: real.created_at + 300, content: Buffer.from(randomBytes(200)).toString('base64'), sig: randomBytes(64).toString('hex'), id: '' };
    f3.id = getEventHash(f3);
    forgeries.push(f3 as NEvent);
    for (const f of forgeries) await attackerSend(p.relay.url, f);
    await expectUnchanged(p, before);
    expect(p.errors).toEqual([]);
    // De relay bevat nu nep-events op A's slot (nieuwer dan het echte); A en B moeten gewoon door kunnen werken.
    p.relay.core.opts.verifySignatures = true;
    p.a.app.addItem(p.la, { text: 'echt-2' });
    p.b.app.addItem(p.lb, { text: 'echt-3' });
    await waitFor(() => names(p.b, p.lb).includes('echt-2') && names(p.a, p.la).includes('echt-3'), 30_000);
    await sleep(2_000);
    expect(canonicalOf(p.a, p.la)).toBe(canonicalOf(p.b, p.lb));
    expect(names(p.a, p.la)).toEqual(['echt-1', 'echt-2', 'echt-3']);
  }, 90_000);

  it('ET-NF02-3: replay van een oude staat door de relay (alleen een oud eigen event terug) -> geen regressie; apparaat publiceert opnieuw (S-10c, S-11)', async () => {
    const p = await setup();
    const aEvents1 = eventsOf(w).filter((e) => e.kind === 30078);
    const oldA = newest(aEvents1);
    p.a.app.addItem(p.la, { text: 'echt-2' });
    p.a.app.addItem(p.la, { text: 'echt-3' });
    await waitFor(() => names(p.b, p.lb).length === 3, 15_000);
    await sleep(2_000);
    const latest = canonicalOf(p.b, p.lb);
    // De relay vergeet alles en serveert alleen het oude event.
    p.relay.wipe();
    expect(p.relay.core.handleEvent(oldA, 2_000)?.ok).toBe(true);
    p.relay.dropConnections();
    await sleep(3_000);
    expect(canonicalOf(p.b, p.lb)).toBe(latest);
    expect(canonicalOf(p.a, p.la)).toBe(latest);
    expect(names(p.b, p.lb)).toEqual(['echt-1', 'echt-2', 'echt-3']);
    // zelfherstel: de relay krijgt de nieuwste staat terug, en een nieuw apparaat ziet alles
    await waitFor(() => newest(eventsOf(w).filter((e) => e.pubkey === oldA.pubkey)).created_at > oldA.created_at, 20_000);
    const c = await addWsDevice(w, 'C');
    const info = await p.a.app.share(p.la);
    const j = await c.app.join(info.text);
    if (j.kind === 'error') throw new Error(j.code);
    await waitFor(() => names(c, j.listId).length === 3, 20_000);
  }, 60_000);

  it('ET-NF02-4: een buitenstaander met een foute of beschadigde code kan niet koppelen en krijgt niets te zien', async () => {
    const p = await setup();
    const info = await p.a.app.share(p.la);
    const e = await addWsDevice(w, 'Indringer');
    const mutate = (s: string) => s.slice(0, 9) + (s[9] === 'Q' ? 'R' : 'Q') + s.slice(10);
    for (const bad of [mutate(info.code), info.code.slice(0, info.code.length - 6), info.code.replace(/[A-Z0-9]/, '*')]) {
      const r = await e.app.join(bad);
      expect(r.kind).toBe('error');
    }
    expect(e.app.lists().filter((l) => l.shared)).toHaveLength(0);
    await sleep(500);
    expect(e.app.lists().flatMap((l) => (l.shared ? [l.name] : []))).toEqual([]);
  }, 30_000);
});

describe('S-12 / S-03 / S-08a: latentie (productievensters, live abonnement)', () => {
  async function measure(a: TestDevice, b: TestDevice, la: string, lb: string, n: number, gapMs: number) {
    const addedAt = new Map<string, number>();
    const seenAt = new Map<string, number>();
    const poll = setInterval(() => {
      for (const [d, l] of [[a, la], [b, lb]] as const) for (const s of d.app.view(l).sections) for (const it of s.items) {
        const key = `${d.name}|${it.name}`;
        if (!seenAt.has(key)) seenAt.set(key, Date.now());
      }
    }, 10);
    try {
      for (let i = 0; i < n; i++) {
        const [src, dst, l] = i % 2 === 0 ? [a, b, la] : [b, a, lb];
        const name = `wijziging-${i}`;
        addedAt.set(`${dst.name}|${name}`, Date.now());
        src.app.addItem(l, { text: name });
        await sleep(gapMs);
      }
      const t0 = Date.now();
      while ([...addedAt.keys()].some((k) => !seenAt.has(k)) && Date.now() - t0 < 12_000) await sleep(20);
    } finally {
      clearInterval(poll);
    }
    const lat = [...addedAt].map(([k, t]) => (seenAt.get(k) ?? Infinity) - t).sort((x, y) => x - y);
    return { lat, p95: lat[Math.ceil(0.95 * lat.length) - 1], max: lat[lat.length - 1], median: lat[Math.floor(lat.length / 2)] };
  }

  it('ET-S12-1: 50 wijzigingen, afwisselend A->B en B->A (3 relays): p95 <= 2 s en max <= 5 s', async () => {
    w = await makeWsWorld(3);
    const a = await addWsDevice(w, 'A', { config: PROD });
    const b = await addWsDevice(w, 'B', { config: PROD });
    const ids = await wsShareAndJoin(a, [b]);
    const r = await measure(a, b, ids.get(a)!, ids.get(b)!, 50, 250);
    // eslint-disable-next-line no-console
    console.log(`S-12 (normaal): mediaan ${r.median} ms, p95 ${r.p95} ms, max ${r.max} ms`);
    expect(r.p95).toBeLessThanOrEqual(2_000);
    expect(r.max).toBeLessThanOrEqual(5_000);
  }, 60_000);

  it('ET-S12-2: dezelfde meting met 1 van 3 relays uit en 1 relay 300 ms vertraagd (S-09: dezelfde latentie)', async () => {
    w = await makeWsWorld(3);
    const a = await addWsDevice(w, 'A', { config: PROD });
    const b = await addWsDevice(w, 'B', { config: PROD });
    const ids = await wsShareAndJoin(a, [b]);
    w.relays[0].setDown(true);
    w.relays[1].faults.latencyMs = 300;
    await sleep(500);
    const r = await measure(a, b, ids.get(a)!, ids.get(b)!, 50, 250);
    // eslint-disable-next-line no-console
    console.log(`S-12 (1 uit, 1 traag): mediaan ${r.median} ms, p95 ${r.p95} ms, max ${r.max} ms`);
    expect(r.p95).toBeLessThanOrEqual(2_000);
    expect(r.max).toBeLessThanOrEqual(5_000);
  }, 60_000);

  it('ET-S03-2 / S-08a: A is offline en maakt 5 wijzigingen; na herstel van de verbinding staan ze <= 10 s bij B; B (eerst offline) haalt 50 wijzigingen binnen 10 s in', async () => {
    w = await makeWsWorld(3);
    const a = await addWsDevice(w, 'A', { config: PROD });
    const b = await addWsDevice(w, 'B', { config: PROD });
    const ids = await wsShareAndJoin(a, [b]);
    const [la, lb] = [ids.get(a)!, ids.get(b)!];
    a.net.online(false);
    for (let i = 0; i < 5; i++) a.app.addItem(la, { text: `offline-${i}` });
    await sleep(1_500);
    expect(names(b, lb)).toEqual([]);
    const t0 = Date.now();
    a.net.online(true);
    await waitFor(() => names(b, lb).length === 5, 10_000, 20);
    expect(Date.now() - t0).toBeLessThanOrEqual(10_000);
    // S-08a
    b.net.online(false);
    for (let i = 0; i < 50; i++) a.app.addItem(la, { text: `veel-${i}` });
    await waitFor(async () => a.app.syncStatus(la).pending === 0, 15_000);
    const t1 = Date.now();
    b.net.online(true);
    await waitFor(() => names(b, lb).length === 55, 10_000, 20);
    expect(Date.now() - t1).toBeLessThanOrEqual(10_000);
  }, 60_000);
});

describe('S-15 / NF-10: 1000 items met 30% tombstones over echte Nostr-events', () => {
  async function big(maxEventBytes?: number) {
    w = await makeWsWorld(2);
    if (maxEventBytes) for (const r of w.relays) r.maxEventBytes = maxEventBytes;
    const a = await addWsDevice(w, 'A');
    const b = await addWsDevice(w, 'B');
    const la = a.app.lists()[0].id;
    const word = lcgWords(7);
    for (let i = 0; i < 1000; i++) {
      const r = a.app.addItem(la, { text: `${word()} ${word()}`, note: i % 3 === 0 ? `${word()} ${word()}` : undefined }, { force: true }).result;
      if (r.kind !== 'added') throw new Error();
    }
    const ids = a.app.view(la).sections.flatMap((s) => s.items).filter((_, i) => i % 10 < 3);
    for (const it of ids) a.app.deleteItem(la, it.id);
    await a.app.flushWrites();
    const map = await wsShareAndJoin(a, [b]);
    const lb = map.get(b)!;
    const expected = 1000 - ids.length;
    await waitFor(() => b.app.view(lb).total === expected, 60_000, 100);
    return { a, b, la, lb, expected };
  }

  it('ET-S15-3: events <= 48 KiB (JSON-bytes), <= 16 delen per apparaat, B krijgt precies de levende items', async () => {
    const p = await big();
    await sleep(2_000);
    expect(p.b.app.view(p.lb).total).toBe(p.expected);
    expect(canonicalOf(p.a, p.la)).toBe(canonicalOf(p.b, p.lb));
    for (const e of eventsOf(w)) expect(Buffer.byteLength(JSON.stringify(e))).toBeLessThanOrEqual(48 * 1024);
    const per = new Map<string, number>();
    for (const r of w.relays) for (const e of r.dumpEvents()) per.set(`${r.url}|${e.pubkey}`, (per.get(`${r.url}|${e.pubkey}`) ?? 0) + 1);
    for (const n of per.values()) expect(n).toBeLessThanOrEqual(16);
  }, 120_000);

  it('ET-S15-4: relays weigeren events > 16 KiB: sync convergeert via kleinere delen, daarna werken wijzigingen nog', async () => {
    const p = await big(16 * 1024);
    for (const e of eventsOf(w)) expect(Buffer.byteLength(JSON.stringify(e))).toBeLessThanOrEqual(16 * 1024);
    p.b.app.addItem(p.lb, { text: 'laatste' });
    await waitFor(() => p.a.app.view(p.la).sections.some((s) => s.items.some((i) => i.name === 'laatste')), 30_000);
    await sleep(2_000);
    expect(canonicalOf(p.a, p.la)).toBe(canonicalOf(p.b, p.lb));
  }, 120_000);
});
