// SqlDriver op expo-sqlite (§9.2). Eén verbinding; serialisatie gebeurt in Repository.
import * as SQLite from 'expo-sqlite';
import type { SqlDriver, SqlParam } from './SqlDriver';

export async function openExpoSqliteDriver(name = 'bootschap.db'): Promise<SqlDriver> {
  const db = await SQLite.openDatabaseAsync(name);
  return {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params: SqlParam[] = []) => {
      const r = await db.runAsync(sql, params);
      return { changes: r.changes };
    },
    all: <T>(sql: string, params: SqlParam[] = []) => db.getAllAsync<T>(sql, params),
    close: () => db.closeAsync(),
  };
}
