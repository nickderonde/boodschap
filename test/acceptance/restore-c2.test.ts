// CR-03 C-2 / R-1 (Eindtester): een telefoon die uit een iPhone-back-up is hersteld (database mee, deviceOnly-sleutels niet)
// krijgt een nieuwe identiteit met een geldige publieke sleutel (64 hex-tekens) en ontvangt wijzigingen via een relay die,
// net als strfry, een REQ met een lege/ongeldige `authors`-waarde weigert (CLOSED). Echte NostrTransport + WS-test-relay.
import fs from 'node:fs';
import WebSocket from 'ws';
import { createNostrTransport } from '../../src/sync/transports/nostr/NostrTransport';
import { createTestDevice, type TestDevice } from '../sim/device';
import { FAST, makeWsWorld, names, SwitchableWsFactory, waitFor, wsShareAndJoin, type WsWorld } from '../sim/ws';
import { realTimers } from '../support/VirtualScheduler';
import { MemoryKeyStore } from '../support/MemoryKeyStore';
import { tmpDbFile } from '../support/single';
import { canonicalOf } from './helpers';

let w: WsWorld;
afterEach(async () => {
  await w?.stop();
});

async function wsDevice(name: string, o: { dbFile?: string; keys?: MemoryKeyStore } = {}): Promise<TestDevice> {
  const net = new SwitchableWsFactory();
  const d = await createTestDevice({
    name,
    endpoints: w.urls,
    timers: realTimers,
    dbFile: o.dbFile,
    keys: o.keys,
    config: { ...FAST },
    transportFactory: ({ clock, timers, relays, config }) =>
      Object.assign(
        createNostrTransport({ relays, wsFactory: net.factory, clock, timers, publishTimeoutMs: config.publishTimeoutMs, connectTimeoutMs: config.connectTimeoutMs, backoffMaxMs: config.backoffMaxMs }),
        { setOnline: (b: boolean) => net.setOnline(b) },
      ),
  });
  w.devices.push(d);
  w.factories.set(d, net);
  return d;
}

function backupDb(file: string): string {
  const copy = tmpDbFile('herstel');
  for (const suffix of ['', '-wal', '-shm']) if (fs.existsSync(file + suffix)) fs.copyFileSync(file + suffix, copy + suffix);
  return copy;
}

/** Stuurt een REQ en geeft het eerste antwoord terug (EOSE of CLOSED). */
function rawReq(url: string, filter: unknown): Promise<unknown[]> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    const t = setTimeout(() => {
      ws.terminate();
      resolve(['TIMEOUT']);
    }, 3_000);
    ws.on('open', () => ws.send(JSON.stringify(['REQ', 'x', filter])));
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m[0] === 'EOSE' || m[0] === 'CLOSED') {
        clearTimeout(t);
        ws.terminate();
        resolve(m);
      }
    });
  });
}

describe('C-2 / R-1: herstel uit een back-up', () => {
  it('ET-C2-0: de test-relay gedraagt zich als strfry: een REQ met lege of ongeldige authors wordt met CLOSED geweigerd, een geldige niet', async () => {
    w = await makeWsWorld(1);
    const r1 = await rawReq(w.urls[0], { kinds: [30078], authors: [''] });
    const r2 = await rawReq(w.urls[0], { kinds: [30078], authors: ['abc'] });
    const r3 = await rawReq(w.urls[0], { kinds: [30078], authors: ['a'.repeat(64)] });
    expect(r1[0]).toBe('CLOSED');
    expect(r2[0]).toBe('CLOSED');
    expect(r3[0]).toBe('EOSE');
  });

  it('ET-C2-1: een herstelde telefoon krijgt een nieuwe, geldige pubkey (64 hex), houdt lijst en items, ontvangt wijzigingen van B via de strikte relay en B ziet de wijzigingen van de herstelde telefoon', async () => {
    w = await makeWsWorld(2);
    const fileA = tmpDbFile('a');
    const keysA = new MemoryKeyStore();
    const a = await wsDevice('A', { dbFile: fileA, keys: keysA });
    const b = await wsDevice('B');
    const ids = await wsShareAndJoin(a, [b]);
    const [la, lb] = [ids.get(a)!, ids.get(b)!];
    for (const n of ['melk', 'brood']) a.app.addItem(la, { text: n });
    await waitFor(() => names(b, lb).length === 2, 20_000);
    await waitFor(async () => a.app.syncStatus(la).pending === 0, 20_000);
    const oldPk = a.app.sharedLists()[0].identity.id;
    expect(oldPk).toMatch(/^[0-9a-f]{64}$/);

    // Herstel: database + Keychain (zonder deviceOnly-items) op een ander toestel, terwijl het origineel blijft bestaan
    const a2 = await wsDevice('A-hersteld', { dbFile: backupDb(fileA), keys: keysA.restoredCopy() });
    const newPk = a2.app.sharedLists()[0].identity.id;
    expect(newPk).toMatch(/^[0-9a-f]{64}$/); // R-1: geen lege of ongeldige sleutel
    expect(newPk).not.toBe(oldPk);
    expect(a2.app.deviceId).not.toBe(a.app.deviceId);
    expect(names(a2, la)).toEqual(['brood', 'melk']); // lijst en items zijn er

    // Wijzigingen komen binnen op de herstelde telefoon (via de relay die lege authors weigert) ...
    b.app.addItem(lb, { text: 'kaas' });
    await waitFor(() => names(a2, la).includes('kaas'), 20_000);
    // ... en die van de herstelde telefoon bij B en bij het origineel
    a2.app.addItem(la, { text: 'eieren' });
    await waitFor(() => names(b, lb).includes('eieren') && names(a, la).includes('eieren'), 20_000);
    await waitFor(() => a.app.syncStatus(la).pending === 0 && a2.app.syncStatus(la).pending === 0 && b.app.syncStatus(lb).pending === 0, 20_000);
    expect(canonicalOf(a2, la)).toBe(canonicalOf(b, lb));
    expect(canonicalOf(a, la)).toBe(canonicalOf(b, lb));

    // Op de relays staan alleen geldige 64-hex-pubkeys en de oude sleutel is niet door de kopie hergebruikt
    const events = w.relays.flatMap((r) => r.dumpEvents());
    for (const e of events) expect(e.pubkey).toMatch(/^[0-9a-f]{64}$/);
    expect(new Set(events.map((e) => e.pubkey)).has(newPk)).toBe(true);
    // De herstelde telefoon heeft geen status "fout" en geen voortdurend foutalarm (REQ werd niet geweigerd)
    expect(['gesynchroniseerd', 'bezig']).toContain(a2.app.syncStatus(la).kind);
    expect(a2.log.lines.filter((l) => l.level === 'error')).toEqual([]);
  }, 90_000);

  it('ET-C2-2: een gewone herstart (zelfde Keychain) houdt dezelfde pubkey; een tweede start van de herstelde kopie roteert niet opnieuw', async () => {
    w = await makeWsWorld(1);
    const fileA = tmpDbFile('a');
    const keysA = new MemoryKeyStore();
    const a = await wsDevice('A', { dbFile: fileA, keys: keysA });
    const b = await wsDevice('B');
    const ids = await wsShareAndJoin(a, [b]);
    const la = ids.get(a)!;
    a.app.addItem(la, { text: 'melk' });
    await waitFor(() => names(b, ids.get(b)!).includes('melk'), 15_000);
    const pk = a.app.sharedLists()[0].identity.id;
    await a.restart();
    expect(a.app.sharedLists()[0].identity.id).toBe(pk);
    const a2 = await wsDevice('A-hersteld', { dbFile: backupDb(fileA), keys: keysA.restoredCopy() });
    const pk2 = a2.app.sharedLists()[0].identity.id;
    expect(pk2).not.toBe(pk);
    await a2.restart();
    expect(a2.app.sharedLists()[0].identity.id).toBe(pk2);
  }, 60_000);
});
