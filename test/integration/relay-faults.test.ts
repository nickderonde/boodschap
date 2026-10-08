// S-09: relay-uitval (WS, 3 relays).
import { capitalizeName } from '../../src/core/capitalize';
import { addWsDevice, makeWsWorld, names, sleep, waitFor, wsShareAndJoin, type WsWorld } from '../sim/ws';
import { RelayConnection, type WebSocketLike } from '../../src/sync/transports/nostr/RelayConnection';
import { VirtualScheduler } from '../support/VirtualScheduler';
import { nullLogger } from '../../src/core/types';
import { canonicalList } from '../../src/core/canonical';

let w: WsWorld;
afterEach(async () => {
  await w?.stop();
});

describe('S-09: relay-uitval (WS)', () => {
  it('S-09: met 1 of 2 van 3 relays down/traag/weigerend werkt de sync binnen dezelfde latentie', async () => {
    w = await makeWsWorld(3);
    const a = await addWsDevice(w, 'A');
    const b = await addWsDevice(w, 'B');
    const ids = await wsShareAndJoin(a, [b]);
    const cases: [string, () => void, () => void][] = [
      ['één down', () => w.relays[0].setDown(true), () => w.relays[0].setDown(false)],
      ['twee down', () => { w.relays[0].setDown(true); w.relays[1].setDown(true); }, () => { w.relays[0].setDown(false); w.relays[1].setDown(false); }],
      ['één traag (3 s)', () => (w.relays[2].faults.latencyMs = 3_000), () => (w.relays[2].faults.latencyMs = 0)],
      ['één weigert', () => w.relays[1].refuse('blocked:'), () => w.relays[1].refuse(null)],
      ['één laat stil vallen', () => (w.relays[0].faults.silentDrop = true), () => (w.relays[0].faults.silentDrop = false)],
    ];
    let i = 0;
    for (const [, on, off] of cases) {
      on();
      await sleep(200);
      const t = `item ${i++}`;
      a.app.addItem(ids.get(a)!, { text: t });
      const ms = await waitFor(() => names(b, ids.get(b)!).includes(capitalizeName(t)), 5_000); // UX-17
      expect(ms).toBeLessThan(2_000);
      off();
    }
  });

  it('S-09: alle relays onbereikbaar → app volledig bruikbaar, niets verloren, geen crash; na terugkeer convergentie', async () => {
    w = await makeWsWorld(3);
    const a = await addWsDevice(w, 'A');
    const b = await addWsDevice(w, 'B');
    const ids = await wsShareAndJoin(a, [b]);
    for (const r of w.relays) r.setDown(true);
    await sleep(300);
    for (let i = 0; i < 5; i++) a.app.addItem(ids.get(a)!, { text: `offline ${i}` });
    b.app.addItem(ids.get(b)!, { text: 'van B' });
    await sleep(500);
    expect(a.app.syncStatus(ids.get(a)!)).toMatchObject({ kind: 'offline', pending: 5 });
    expect(a.app.view(ids.get(a)!).total).toBe(5);
    w.relays[2].setDown(false);
    a.app.foreground(); // kick: backoff afbreken
    b.app.foreground();
    await waitFor(() => names(a, ids.get(a)!).length === 6 && names(b, ids.get(b)!).length === 6, 10_000);
    expect(canonicalList(a.app.stateOf(ids.get(a)!))).toBe(canonicalList(b.app.stateOf(ids.get(b)!)));
  });

  it('S-09: een relay die later terugkomt krijgt de staat alsnog (eigen-staatcontrole)', async () => {
    w = await makeWsWorld(3);
    const a = await addWsDevice(w, 'A');
    const b = await addWsDevice(w, 'B');
    const ids = await wsShareAndJoin(a, [b]);
    w.relays[0].setDown(true);
    w.relays[0].wipe();
    a.app.addItem(ids.get(a)!, { text: 'tijdens uitval' });
    await waitFor(() => names(b, ids.get(b)!).includes('Tijdens uitval'));
    w.relays[0].setDown(false);
    a.app.foreground();
    const aPub = a.app.sharedLists()[0].identity.id;
    const last = (await a.app.readShards(ids.get(a)!))!.shards.get(0)!.lastEventId;
    await waitFor(() => w.relays[0].dumpEvents().some((e) => e.pubkey === aPub && e.id === last), 10_000);
  });

  it('S-09: flapperende relay (aan/uit elke 300 ms) veroorzaakt geen verlies of dubbele staat', async () => {
    w = await makeWsWorld(2);
    const a = await addWsDevice(w, 'A', { config: { backoffMaxMs: 500 } });
    const b = await addWsDevice(w, 'B', { config: { backoffMaxMs: 500 } });
    const ids = await wsShareAndJoin(a, [b]);
    w.relays[0].flap(300);
    for (let i = 0; i < 15; i++) {
      a.app.addItem(ids.get(a)!, { text: `f${i}` });
      await sleep(100);
    }
    w.relays[0].flap(null);
    a.app.foreground();
    b.app.foreground();
    await waitFor(() => names(b, ids.get(b)!).length === 15, 10_000);
    expect(canonicalList(a.app.stateOf(ids.get(a)!))).toBe(canonicalList(b.app.stateOf(ids.get(b)!)));
    expect(new Set(names(b, ids.get(b)!)).size).toBe(15);
  });

  it('S-09: exponentiële backoff met max 60 s; kick() breekt de backoff af', async () => {
    const sched = new VirtualScheduler();
    const attempts: number[] = [];
    const failing = (): WebSocketLike => {
      attempts.push(sched.now());
      const s: WebSocketLike = { readyState: 3, send() {}, close() {}, onopen: null, onmessage: null, onclose: null, onerror: null };
      sched.timers('x').setTimeout(() => s.onerror?.({}), 1);
      return s;
    };
    const c = new RelayConnection({
      url: 'wss://dood.test', wsFactory: failing, timers: sched.timers('c'), log: nullLogger, connectTimeoutMs: 10_000,
      publishTimeoutMs: 8_000, backoffMaxMs: 60_000, jitter: () => 0.5,
      events: { state() {}, message() {}, eose() {}, outcome() {}, closedSub() {} },
    });
    c.connect(true);
    await sched.advance(10 * 60_000);
    const gaps = attempts.slice(1).map((t, i) => t - attempts[i]);
    expect(gaps.slice(0, 6).map((g) => Math.round(g / 1000))).toEqual([1, 2, 4, 8, 16, 32]);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(60_000 * 1.2 + 10);
    expect(gaps[gaps.length - 1]).toBeGreaterThanOrEqual(60_000 * 0.8);
    const before = attempts.length;
    c.kick(); // direct opnieuw
    await sched.advance(5);
    expect(attempts.length).toBe(before + 1);
    c.close();
  });
});
