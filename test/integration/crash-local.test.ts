// S-02 (lokaal deel, M2): crash midden in een transactie → alles waarvan `committed` is opgelost, is er na de herstart.
import fc from 'fast-check';
import { singleDevice, tmpDbFile } from '../support/single';
import { CrashingSqlDriver } from '../support/CrashingSqlDriver';
import type { SqlDriver } from '../../src/storage/SqlDriver';

const numRuns = Math.min(Number(process.env.SEEDS ?? 200), 60);

describe('S-02: geen verlies bij crash (lokaal)', () => {
  it('S-02: crash op een willekeurig statement → bevestigd ⊆ na herstart; niet-bevestigd mag weg', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 400 }), fc.integer({ min: 1, max: 40 }), async (crashAt, n) => {
        const file = tmpDbFile();
        let crash!: CrashingSqlDriver;
        const d = await singleDevice({ file, wrap: (inner: SqlDriver) => (crash = new CrashingSqlDriver(inner)) });
        const listId = d.app.lists()[0].id;
        crash.count = 0;
        crash.crashAt = crashAt;
        const confirmed: string[] = [];
        const pending: Promise<void>[] = [];
        for (let i = 0; i < n; i++) {
          const name = `artikel-${i}`;
          try {
            const r = d.app.addItem(listId, { text: name });
            pending.push(r.committed.then(() => void confirmed.push(name)).catch(() => {}));
          } catch {
            break;
          }
        }
        await Promise.all(pending);
        const after = await d.restart();
        const names = new Set(after.app.view(listId).sections.flatMap((s) => s.items.map((i) => i.name)));
        for (const c of confirmed) expect(names.has(c)).toBe(true);
        // De database is consistent: alles wat er staat, is een geldig item.
        for (const nm of names) expect(nm).toMatch(/^artikel-\d+$/);
      }),
      { numRuns, seed: 20261006 },
    );
  });
});
