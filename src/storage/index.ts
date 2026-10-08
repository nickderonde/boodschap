// Publieke API van de opslaglaag. De driver zelf wordt hier bewust NIET geëxporteerd (§9.2): alle SQL via Repository.
export { Repository } from './Repository';
export type { SqlReader, SqlTx } from './Repository';
export type { SqlDriver, SqlParam } from './SqlDriver';
export { migrate, MIGRATIONS, SCHEMA_VERSION } from './migrations';
export type { KeyStore } from './KeyStore';
export { keyNames } from './KeyStore';
export * as dao from './dao';
