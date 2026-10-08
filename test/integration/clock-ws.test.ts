// S-16 tegen de WS-relay: klok +1 u en −1 u, twee toleranties met 3 herstarts, B-1 en I-3 (M3b).
import { addWsDevice, makeWsWorld, names, sleep, waitFor, wsShareAndJoin, type WsWorld } from '../sim/ws';
import { tmpDbFile } from '../support/single';

let w: WsWorld;
afterEach(async () => {
  await w?.stop();
});
const HOUR = 3_600_000;

describe('S-16: klokafwijking tegen de WS-relay', () => {
  it('S-16: apparaat +1 u, relay-tolerantie 900 s → aanwezig ≤ 30 s; geen rotatie', async () => {
    w = await makeWsWorld(1);
    const a = await addWsDevice(w, 'A', { clockOffsetMs: HOUR });
    const b = await addWsDevice(w, 'B');
    const listA = a.app.lists()[0].id;
    a.app.addItem(listA, { text: 'voor' });
    const info = await a.app.share(listA);
    const ms = await waitFor(async () => (await a.app.shareInfo(listA)).ready, 30_000);
    expect(ms).toBeLessThan(30_000);
    expect(a.app.syncEngine!.debug.publisher.rotations).toBe(0);
    const j = await b.app.join(info.text);
    if (j.kind === 'error') throw new Error();
    await waitFor(() => names(b, j.listId).includes('Voor'));
  }, 40_000);

  it('S-16 (L-3): apparaat −1 u, relay pastToleranceSec = 1800 → aanwezig ≤ 30 s', async () => {
    w = await makeWsWorld(1);
    w.relays[0].pastToleranceSec = 1800;
    const a = await addWsDevice(w, 'A', { clockOffsetMs: -HOUR });
    const listA = a.app.lists()[0].id;
    await a.app.share(listA);
    const ms = await waitFor(async () => (await a.app.shareInfo(listA)).ready, 30_000);
    expect(ms).toBeLessThan(30_000);
    expect(a.app.syncEngine!.debug.offsetSec()).toBeGreaterThan(0);
  }, 40_000);

  it('S-16 / E-3 / B-1: twee relays (300 s en 900 s), apparaat +10 min, 3 herstarts → geen nieuwe identiteit, offset persistent, geen terugrol', async () => {
    w = await makeWsWorld(2);
    w.relays[0].futureToleranceSec = 300;
    w.relays[1].futureToleranceSec = 900;
    const a = await addWsDevice(w, 'A', { clockOffsetMs: 10 * 60_000, dbFile: tmpDbFile() });
    const b = await addWsDevice(w, 'B');
    const ids = await wsShareAndJoin(a, [b]);
    const pk = a.app.sharedLists()[0].identity.id;
    for (let i = 0; i < 3; i++) {
      a.app.addItem(ids.get(a)!, { text: `art ${i}` });
      await sleep(400);
      await a.restart();
      expect(await a.app.getClockOffset()).toBeLessThan(0);
      await sleep(400);
    }
    await waitFor(() => names(b, ids.get(b)!).length === 3, 10_000);
    expect(a.app.sharedLists()[0].identity.id).toBe(pk);
    expect(a.log.codes()).not.toContain('identity.rotated');
    expect(a.log.codes()).not.toContain('floor.rollback');
  }, 30_000);

  it('I-3 (WS): +1 u, 5 bewerkingen in 2 s, 200 ms latentie → geen rotatie, aanwezig ≤ 30 s', async () => {
    w = await makeWsWorld(1);
    w.relays[0].faults.latencyMs = 200;
    const a = await addWsDevice(w, 'A');
    const b = await addWsDevice(w, 'B');
    const ids = await wsShareAndJoin(a, [b]);
    a.clock.offsetMs = HOUR;
    for (let i = 0; i < 5; i++) {
      a.app.addItem(ids.get(a)!, { text: `snel ${i}` });
      await sleep(400);
    }
    const ms = await waitFor(() => names(b, ids.get(b)!).length === 5, 30_000);
    expect(ms).toBeLessThan(30_000);
    expect(a.app.syncEngine!.debug.publisher.rotations).toBe(0);
  }, 40_000);
});
