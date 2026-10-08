// S-02 (volledig, M3a): seeds × crashpunten (midden in een transactie, na commit, na prepare, na persist, na send),
// met KillSwitch → alles waarvan `committed` is opgelost, is er na de herstart en komt aan bij B.
import fc from 'fast-check';
import { addDevice, makeWorld, names, shareAndJoin } from '../sim/hub';
import type { FaultPoint } from '../../src/sync/engine/context';

const numRuns = Math.max(20, Math.floor(Number(process.env.SEEDS ?? 200) / 2));

type Point = FaultPoint | 'mid-tx';
const POINTS: Point[] = ['mid-tx', 'after-commit', 'after-prepare', 'after-persist', 'after-send'];

describe('S-02: geen verlies bij kill op willekeurige punten (hub)', () => {
  it('S-02: bevestigd ⊆ na herstart, en alles komt aan bij B', async () => {
    const killedAt = new Map<string, number>();
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...POINTS), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 60 }), fc.boolean(), async (point, n, stmt, offline) => {
        const w = await makeWorld();
        const a = await addDevice(w, 'A');
        const b = await addDevice(w, 'B');
        const ids = await shareAndJoin(w, a, [b]);
        const listA = ids.get(a)!;
        if (offline) a.net.online(false);
        if (point === 'mid-tx') a.killSwitch.killAfterStatements = stmt;
        else a.crashAt(point);
        const confirmed: string[] = [];
        for (let i = 0; i < n; i++) {
          if (a.killSwitch.killed) break;
          try {
            const r = a.app.addItem(listA, { text: `artikel ${i}` });
            void r.committed.then(() => confirmed.push(`Artikel ${i}`)).catch(() => {});
          } catch {
            break;
          }
          await w.sched.advance(300);
        }
        await w.sched.advance(5_000);
        if (a.killSwitch.killed) killedAt.set(point, (killedAt.get(point) ?? 0) + 1);
        // Herstart (ook als er geen crash plaatsvond: dan is het een gewone herstart).
        a.crashAt(null);
        a.killSwitch.killAfterStatements = null;
        await a.restart();
        a.net.online(true);
        await w.settle(60_000);
        const after = names(a, listA);
        for (const c of confirmed) expect(after).toContain(c);
        const atB = names(b, ids.get(b)!);
        for (const c of confirmed) expect(atB).toContain(c);
        expect(atB).toEqual(after);
      }),
      { numRuns, seed: 20261006, endOnFailure: true },
    );
    // Elk crashpunt is in deze run minstens één keer echt geraakt.
    for (const p of POINTS) expect([p, (killedAt.get(p) ?? 0) > 0]).toEqual([p, true]);
  }, 600_000);
});
