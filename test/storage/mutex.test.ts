// S-02 / E-4: geen lees- of schrijfactie buiten de mutex. De driver wordt verpakt in een spion die faalt als een
// aanroep plaatsvindt zonder dat de Repository de mutex vasthoudt. De service-suite draait eenmaal met de spion.
import { NodeSqliteDriver } from '../support/NodeSqliteDriver';
import { BootschapAppImpl } from '../../src/service/BootschapApp';
import { Repository } from '../../src/storage';
import { MemoryKeyStore } from '../support/MemoryKeyStore';
import { FakeClock, realTimers } from '../support/VirtualScheduler';
import { SeededRandom } from '../support/SeededRandom';
import type { SqlDriver, SqlParam } from '../../src/storage/SqlDriver';
import fs from 'node:fs';
import path from 'node:path';

class SpyDriver implements SqlDriver {
  violations: string[] = [];
  repo: Repository | null = null;
  constructor(private readonly inner: SqlDriver) {}
  private check(sql: string) {
    if (!this.repo?.mutexHeld) this.violations.push(sql.slice(0, 40));
  }
  async exec(sql: string) {
    this.check(sql);
    return this.inner.exec(sql);
  }
  async run(sql: string, p?: SqlParam[]) {
    this.check(sql);
    return this.inner.run(sql, p);
  }
  async all<T>(sql: string, p?: SqlParam[]) {
    this.check(sql);
    return this.inner.all<T>(sql, p);
  }
  async close() {
    return this.inner.close();
  }
}

describe('E-4: alle SQL onder de mutex', () => {
  it('S-02: een volledige service-run doet geen enkele SQL-aanroep buiten de mutex', async () => {
    const spy = new SpyDriver(new NodeSqliteDriver());
    const app = new BootschapAppImpl({ db: spy, keys: new MemoryKeyStore(), clock: new FakeClock(), timers: realTimers, random: new SeededRandom(3) });
    spy.repo = app.repo;
    await app.init();
    const listId = app.lists()[0].id;
    const ids: string[] = [];
    for (let i = 0; i < 20; i++) {
      const r = app.addItem(listId, { text: `p${i}` }).result;
      if (r.kind === 'added') ids.push(r.itemId);
    }
    app.toggleChecked(listId, ids[0]);
    app.updateItem(listId, ids[1], { category: 'dranken' });
    app.clearChecked(listId);
    app.createList('Twee');
    await app.share(listId);
    await app.flushWrites();
    await app.readFlush(listId);
    await app.pendingCount(listId);
    expect(spy.violations).toEqual([]);
  });

  it('E-4: storage/index.ts exporteert geen driver-implementatie', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../src/storage/index.ts'), 'utf8');
    expect(src).not.toMatch(/ExpoSqliteDriver|NodeSqliteDriver|openExpoSqliteDriver/);
  });
});
