// S-12: maximale vertraging bij twee open, online apps — lokale test-relay, productievensters, live abonnement.
import { addWsDevice, makeWsWorld, sleep, wsShareAndJoin, type WsWorld } from '../sim/ws';
import { DEFAULT_CONFIG } from '../../src/config';

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

describe('S-12: latentie (WS, productievensters)', () => {
  it('S-12: 50 opeenvolgende wijzigingen op A zichtbaar op B met p95 ≤ 2 s en max ≤ 5 s', async () => {
    w = await makeWsWorld(3);
    const a = await addWsDevice(w, 'A', { config: PROD });
    const b = await addWsDevice(w, 'B', { config: PROD });
    const ids = await wsShareAndJoin(a, [b]);
    const listA = ids.get(a)!;
    const listB = ids.get(b)!;
    const addedAt = new Map<string, number>();
    const seenAt = new Map<string, number>();
    const poll = setInterval(() => {
      for (const s of b.app.view(listB).sections) for (const it of s.items) if (!seenAt.has(it.name)) seenAt.set(it.name, Date.now());
    }, 10);
    try {
      for (let i = 0; i < 50; i++) {
        const name = `wijziging ${i}`;
        addedAt.set(name, Date.now());
        a.app.addItem(listA, { text: name });
        await sleep(150);
      }
      const t0 = Date.now();
      while (seenAt.size < 50 && Date.now() - t0 < 10_000) await sleep(20);
    } finally {
      clearInterval(poll);
    }
    const lat = [...addedAt].map(([n, t]) => (seenAt.get(n) ?? Infinity) - t).sort((x, y) => x - y);
    const p95 = lat[Math.ceil(0.95 * lat.length) - 1];
    expect(seenAt.size).toBe(50);
    expect(p95).toBeLessThanOrEqual(2_000);
    expect(lat[lat.length - 1]).toBeLessThanOrEqual(5_000);
  }, 30_000);
});
