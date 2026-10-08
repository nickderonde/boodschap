// Repository (§9.2): alle SQL loopt hierdoor, onder één async-mutex (E-4).
// tx(): BEGIN IMMEDIATE … COMMIT (ROLLBACK bij een fout). read(): alleen-lezen, zonder eigen BEGIN.
import { Mutex } from './mutex';
import type { SqlDriver, SqlParam } from './SqlDriver';

export interface SqlReader {
  all<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
  get<T>(sql: string, params?: SqlParam[]): Promise<T | undefined>;
}

export interface SqlTx extends SqlReader {
  run(sql: string, params?: SqlParam[]): Promise<{ changes: number }>;
  exec(sql: string): Promise<void>;
}

export class Repository {
  private readonly mutex = new Mutex();

  constructor(private readonly db: SqlDriver) {}

  /** Voor tests (mutex.test): houdt deze repository de mutex vast? */
  get mutexHeld(): boolean {
    return this.mutex.held;
  }

  private reader(): SqlReader {
    const db = this.db;
    return {
      all: <T>(sql: string, params?: SqlParam[]) => db.all<T>(sql, params),
      get: async <T>(sql: string, params?: SqlParam[]) => (await db.all<T>(sql, params))[0],
    };
  }

  async tx<T>(fn: (tx: SqlTx) => Promise<T>): Promise<T> {
    return this.mutex.run(async () => {
      const db = this.db;
      await db.exec('BEGIN IMMEDIATE');
      const t: SqlTx = { ...this.reader(), run: (sql, params) => db.run(sql, params), exec: (sql) => db.exec(sql) };
      let result: T;
      try {
        result = await fn(t);
        // Ook een mislukte COMMIT (schijf vol, I/O-fout) moet de transactie sluiten (review bevinding 5).
        await db.exec('COMMIT');
      } catch (e) {
        try {
          await db.exec('ROLLBACK');
        } catch {
          // verbinding kan al weg zijn (kill), of er stond geen transactie meer open
        }
        throw e;
      }
      return result;
    });
  }

  async read<T>(fn: (r: SqlReader) => Promise<T>): Promise<T> {
    return this.mutex.run(() => fn(this.reader()));
  }

  /** Statements buiten een transactie (PRAGMA's bij openen). Ook onder de mutex. */
  async execRaw(sql: string): Promise<void> {
    return this.mutex.run(() => this.db.exec(sql));
  }

  async close(): Promise<void> {
    return this.mutex.run(() => this.db.close());
  }
}
