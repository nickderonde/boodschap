// NF-12: elke foutknop van de WS-test-relay werkt (met een kale ws-client).
import WebSocket from 'ws';
import { finalizeEvent } from 'nostr-tools/pure';
import { WsTestRelay } from './WsTestRelay';
import { SeededRandom } from '../support/SeededRandom';
import type { NEvent } from './RelayCore';

const rnd = new SeededRandom(3);
const sk = rnd.bytes(32);
const D = 'ab'.repeat(16) + ':0';
const ev = (created_at: number, content = 'x', d = D): NEvent => finalizeEvent({ kind: 30078, created_at, tags: [['d', d]], content }, sk) as NEvent;

async function client(url: string) {
  const ws = new WebSocket(url);
  const frames: unknown[][] = [];
  ws.on('message', (m) => frames.push(JSON.parse(m.toString())));
  await new Promise<void>((res, rej) => {
    ws.once('open', () => res());
    ws.once('error', rej);
    ws.once('close', () => rej(new Error('closed')));
  });
  const wait = async (pred: (f: unknown[]) => boolean, ms = 2_000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const f = frames.find(pred);
      if (f) return f;
      await new Promise((r) => setTimeout(r, 10));
    }
    return undefined;
  };
  return { ws, frames, wait, send: (f: unknown[]) => ws.send(JSON.stringify(f)) };
}

let relay: WsTestRelay;
beforeEach(async () => {
  relay = await WsTestRelay.start();
});
afterEach(async () => {
  await relay.stop();
});

const now = () => Math.floor(Date.now() / 1000);

describe('NF-12: test-relay en foutknoppen', () => {
  it('NIP-01: EVENT → OK, REQ → EVENT + EOSE, live doorsturen, vervangbare semantiek (hoogste created_at, gelijk → laagste id)', async () => {
    const c = await client(relay.url);
    const e1 = ev(now());
    c.send(['EVENT', e1]);
    expect(await c.wait((f) => f[0] === 'OK' && f[1] === e1.id)).toEqual(['OK', e1.id, true, '']);
    const r = await client(relay.url);
    r.send(['REQ', 's', { kinds: [30078], '#d': [D] }]);
    expect(await r.wait((f) => f[0] === 'EOSE')).toBeTruthy();
    expect(r.frames.filter((f) => f[0] === 'EVENT')).toHaveLength(1);
    const e2 = ev(now() + 1, 'nieuw');
    c.send(['EVENT', e2]);
    expect(await r.wait((f) => f[0] === 'EVENT' && (f[2] as NEvent).id === e2.id)).toBeTruthy(); // live
    expect(relay.dumpEvents().map((e) => e.id)).toEqual([e2.id]); // e1 vervangen
    const older = ev(now() - 10, 'ouder');
    c.send(['EVENT', older]);
    await c.wait((f) => f[0] === 'OK' && f[1] === older.id);
    expect(relay.dumpEvents().map((e) => e.id)).toEqual([e2.id]);
    const t = now() + 5;
    const [a, b] = [ev(t, 'a'), ev(t, 'b')];
    c.send(['EVENT', a]);
    c.send(['EVENT', b]);
    await c.wait((f) => f[0] === 'OK' && f[1] === b.id);
    expect(relay.dumpEvents().map((e) => e.id)).toEqual([a.id < b.id ? a.id : b.id]);
    c.ws.close();
    r.ws.close();
  });

  it('foutknoppen: maxEventBytes, created_at te laat/te vroeg, refuse, rateLimit, silentDrop, ongeldige handtekening', async () => {
    const c = await client(relay.url);
    relay.maxEventBytes = 200;
    const big = ev(now(), 'x'.repeat(500));
    c.send(['EVENT', big]);
    expect((await c.wait((f) => f[1] === big.id))?.[3]).toMatch(/^invalid: event too large/);
    relay.maxEventBytes = 65_536;
    relay.futureToleranceSec = 900;
    const late = ev(now() + 3600);
    c.send(['EVENT', late]);
    expect((await c.wait((f) => f[1] === late.id))?.[3]).toBe('invalid: created_at too late');
    relay.pastToleranceSec = 1800;
    const early = ev(now() - 3600);
    c.send(['EVENT', early]);
    expect((await c.wait((f) => f[1] === early.id))?.[3]).toBe('invalid: created_at too early');
    relay.refuse('blocked:');
    const ref = ev(now() + 1);
    c.send(['EVENT', ref]);
    expect((await c.wait((f) => f[1] === ref.id))?.[3]).toMatch(/^blocked:/);
    relay.refuse(null);
    relay.rateLimitEvery = 1;
    const rl = ev(now() + 2);
    c.send(['EVENT', rl]);
    expect((await c.wait((f) => f[1] === rl.id))?.[3]).toMatch(/^rate-limited:/);
    relay.rateLimitEvery = 0;
    relay.faults.silentDrop = true;
    const sd = ev(now() + 3);
    c.send(['EVENT', sd]);
    expect(await c.wait((f) => f[1] === sd.id, 300)).toBeUndefined();
    relay.faults.silentDrop = false;
    const bad = { ...ev(now() + 4), sig: '00'.repeat(64) };
    c.send(['EVENT', bad]);
    expect((await c.wait((f) => f[1] === bad.id))?.[3]).toBe('invalid: bad signature');
    c.ws.close();
  });

  it('foutknoppen: down, dropConnections, flap, latencyMs, duplicate, reorder, wipe, klok', async () => {
    const c = await client(relay.url);
    const e1 = ev(now());
    c.send(['EVENT', e1]);
    await c.wait((f) => f[0] === 'OK');
    relay.faults.duplicate = 3;
    const r = await client(relay.url);
    r.send(['REQ', 's', { kinds: [30078] }]);
    await r.wait((f) => f[0] === 'EOSE');
    expect(r.frames.filter((f) => f[0] === 'EVENT')).toHaveLength(3);
    relay.faults.duplicate = 1;
    relay.faults.reorder = true;
    relay.faults.latencyMs = 200;
    const t0 = Date.now();
    r.send(['REQ', 's2', { kinds: [30078] }]);
    await r.wait((f) => f[0] === 'EOSE' && f[1] === 's2');
    expect(Date.now() - t0).toBeGreaterThanOrEqual(350); // 200 ms per richting
    relay.faults.latencyMs = 0;
    relay.wipe();
    expect(relay.dumpEvents()).toHaveLength(0);
    const closed = new Promise((res) => c.ws.once('close', res));
    relay.dropConnections();
    await closed;
    relay.setDown(true);
    // "down": de relay accepteert geen sessie — de verbinding wordt meteen verbroken.
    const dc = new WebSocket(relay.url);
    await new Promise((res) => dc.once('close', res));
    relay.setDown(false);
    const again = await client(relay.url);
    relay.flap(100);
    await new Promise((res) => setTimeout(res, 250));
    relay.flap(null);
    expect(relay.faults.down).toBe(false);
    relay.clockOffsetMs = 7 * 86_400_000;
    relay.futureToleranceSec = 900;
    const future = ev(now() + 7 * 86_400);
    const k = await client(relay.url);
    k.send(['EVENT', future]);
    expect((await k.wait((f) => f[1] === future.id))?.[2]).toBe(true);
    again.ws.close();
    k.ws.close();
    r.ws.close();
  });

  it('kind-5 alleen voor dezelfde pubkey', async () => {
    const c = await client(relay.url);
    const e1 = ev(now());
    c.send(['EVENT', e1]);
    await c.wait((f) => f[1] === e1.id);
    const other = new SeededRandom(9).bytes(32);
    const del = finalizeEvent({ kind: 5, created_at: now(), tags: [['e', e1.id]], content: '' }, other) as NEvent;
    c.send(['EVENT', del]);
    await c.wait((f) => f[1] === del.id);
    expect(relay.dumpEvents().some((e) => e.id === e1.id)).toBe(true);
    const own = finalizeEvent({ kind: 5, created_at: now(), tags: [['e', e1.id]], content: '' }, sk) as NEvent;
    c.send(['EVENT', own]);
    await c.wait((f) => f[1] === own.id);
    expect(relay.dumpEvents().some((e) => e.id === e1.id)).toBe(false);
    c.ws.close();
  });
});

describe('Review CR-03 R-1: ongeldige filters, zoals strfry', () => {
  it('R-1: een REQ met een lege of ongeldige author krijgt CLOSED en geen abonnement; een geldige author werkt', async () => {
    const c = await client(relay.url);
    c.send(['REQ', 'leeg', { kinds: [30078], authors: [''] }]);
    expect(await c.wait((f) => f[0] === 'CLOSED' && f[1] === 'leeg')).toBeTruthy();
    c.send(['REQ', 'kort', { kinds: [30078], authors: ['abc'] }]);
    expect(await c.wait((f) => f[0] === 'CLOSED' && f[1] === 'kort')).toBeTruthy();
    c.send(['REQ', 'goed', { kinds: [30078], authors: ['ab'.repeat(32)] }]);
    expect(await c.wait((f) => f[0] === 'EOSE' && f[1] === 'goed')).toBeTruthy();
    expect(c.frames.some((f) => f[0] === 'EOSE' && f[1] === 'leeg')).toBe(false);
    c.ws.close();
  });
});

