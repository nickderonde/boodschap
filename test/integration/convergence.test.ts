// S-04 / S-18 / S-11 (sync-deel): convergentie voor willekeurige scenario's op de hub, ≥ 200 seeds per run.
import fc from 'fast-check';
import { actionArb, assertConverged, runScenario } from '../sim/scenario';

const numRuns = Number(process.env.SEEDS ?? 200);
const seed = Number(process.env.SEED ?? 20261006);

describe('S-04 / S-18: convergentie (hub, willekeurige scenario\'s)', () => {
  it('S-04: 2 en 3 apparaten — offline-periodes, vertraging, herordening, duplicaten, wipe, kill+restart', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 3 }), fc.array(actionArb(3), { minLength: 1, maxLength: 60 }), fc.integer({ min: 1, max: 1e6 }), async (n, actions, s) => {
        const res = await runScenario(n, actions.map((a) => ('d' in a ? { ...a, d: a.d % n } : a)), s);
        assertConverged(res);
      }),
      { numRuns, seed, endOnFailure: true },
    );
  }, 600_000);

  it('S-18 / F-16: 5 apparaten op één lijst', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(actionArb(5), { minLength: 1, maxLength: 40 }), fc.integer({ min: 1, max: 1e6 }), async (actions, s) => {
        const res = await runScenario(5, actions, s);
        assertConverged(res);
      }),
      { numRuns: Math.max(20, Math.floor(numRuns / 5)), seed: seed + 5, endOnFailure: true },
    );
  }, 600_000);
});
