// SqlDriver-wrapper die na N statements SimulatedCrash gooit (S-02, §13.3), of één keer faalt (commitfout, UX-05).
import type { SqlDriver, SqlParam } from '../../src/storage/SqlDriver';

export class SimulatedCrash extends Error {
  constructor(msg = 'SimulatedCrash') {
    super(msg);
    this.name = 'SimulatedCrash';
  }
}

export class CrashingSqlDriver implements SqlDriver {
  count = 0;
  /** Gooit bij statement nummer `crashAt` (1-gebaseerd) en daarna altijd. */
  crashAt = Infinity;
  /** Laat eenmalig een statement falen dat aan dit patroon voldoet (geen crash, wel een fout). */
  failOnce: RegExp | null = null;
  crashed = false;
  onCrash: (() => void) | null = null;

  constructor(private readonly inner: SqlDriver) {}

  private tick(sql: string): void {
    if (this.crashed) throw new SimulatedCrash();
    this.count++;
    if (this.count >= this.crashAt) {
      this.crashed = true;
      this.onCrash?.();
      throw new SimulatedCrash();
    }
    if (this.failOnce && this.failOnce.test(sql)) {
      this.failOnce = null;
      throw new Error('opslag-fout (test)');
    }
  }

  async exec(sql: string): Promise<void> {
    if (/^(ROLLBACK)/i.test(sql.trim()) && this.crashed) throw new SimulatedCrash();
    if (!/^(ROLLBACK)/i.test(sql.trim())) this.tick(sql);
    return this.inner.exec(sql);
  }
  async run(sql: string, params?: SqlParam[]): Promise<{ changes: number }> {
    this.tick(sql);
    return this.inner.run(sql, params);
  }
  async all<T>(sql: string, params?: SqlParam[]): Promise<T[]> {
    this.tick(sql);
    return this.inner.all<T>(sql, params);
  }
  async close(): Promise<void> {
    return this.inner.close();
  }
}
