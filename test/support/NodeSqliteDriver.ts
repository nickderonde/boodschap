// SqlDriver op node:sqlite (DatabaseSync, Node ≥ 22.13). Alleen voor tests (§9.2).
import { DatabaseSync } from 'node:sqlite';
import type { SqlDriver, SqlParam } from '../../src/storage/SqlDriver';

export class NodeSqliteDriver implements SqlDriver {
  private db: DatabaseSync | null;
  statements = 0;

  private readonly sharedHandle: boolean;

  /**
   * `handle` hergebruikt een bestaande verbinding (voor ':memory:' bij kill/herstart: de open transactie wordt bij
   * hardClose teruggedraaid, net als bij het sluiten van een bestand).
   */
  constructor(
    readonly file: string = ':memory:',
    handle?: DatabaseSync,
  ) {
    this.db = handle ?? new DatabaseSync(file);
    this.sharedHandle = !!handle;
  }

  /** De onderliggende verbinding (om na een kill op dezelfde ':memory:'-database te herstarten). */
  get rawHandle(): DatabaseSync | null {
    return this.db;
  }

  private get handle(): DatabaseSync {
    if (!this.db) throw new Error('database gesloten');
    return this.db;
  }

  async exec(sql: string): Promise<void> {
    this.statements++;
    this.handle.exec(sql);
  }

  async run(sql: string, params: SqlParam[] = []): Promise<{ changes: number }> {
    this.statements++;
    const r = this.handle.prepare(sql).run(...params);
    return { changes: Number(r.changes) };
  }

  async all<T>(sql: string, params: SqlParam[] = []): Promise<T[]> {
    this.statements++;
    return this.handle.prepare(sql).all(...params) as T[];
  }

  async close(): Promise<void> {
    this.hardClose();
  }

  /** Harde sluiting (kill): een open transactie gaat verloren. */
  hardClose(): void {
    if (!this.db) return;
    try {
      if (this.db.isTransaction) this.db.exec('ROLLBACK');
    } catch {
      // negeren
    }
    if (!this.sharedHandle && this.file !== ':memory:') this.db.close();
    this.db = null;
  }

  get isOpen(): boolean {
    return this.db !== null;
  }
}
