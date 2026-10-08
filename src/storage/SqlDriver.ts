// Abstracte SQL-driver (§9.2). Implementaties: ExpoSqliteDriver (app) en NodeSqliteDriver (tests).

export type SqlParam = string | number | null;

export interface SqlDriver {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlParam[]): Promise<{ changes: number }>;
  all<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
  close(): Promise<void>;
}
