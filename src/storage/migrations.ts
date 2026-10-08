// Migraties (NF-13): een array van functies; de huidige versie staat in meta.schema_version.
import type { Repository, SqlTx } from './Repository';

export type Migration = (tx: SqlTx) => Promise<void>;

const M1 = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE lists (
  id TEXT PRIMARY KEY,
  regs TEXT NOT NULL,
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  shared INTEGER NOT NULL DEFAULT 0,
  list_tag TEXT UNIQUE,
  nostr_pubkey TEXT,
  shard_count INTEGER NOT NULL DEFAULT 1,
  state_rev INTEGER NOT NULL DEFAULT 0,
  joined_pending INTEGER NOT NULL DEFAULT 0,
  future_schema INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE items (
  list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  regs TEXT NOT NULL, del_hlc TEXT, max_hlc TEXT NOT NULL,
  deleted INTEGER NOT NULL, checked INTEGER NOT NULL, category TEXT NOT NULL,
  name TEXT NOT NULL, name_norm TEXT NOT NULL, added_hlc TEXT NOT NULL,
  PRIMARY KEY (list_id, id)
) WITHOUT ROWID;
CREATE INDEX items_view ON items(list_id, deleted, checked, category, added_hlc);
CREATE INDEX items_name ON items(name_norm);
CREATE TABLE pending_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, list_id TEXT NOT NULL, item_id TEXT, rev INTEGER NOT NULL);
CREATE INDEX pending_list ON pending_changes(list_id);
CREATE TABLE shard_state (list_id TEXT NOT NULL, shard INTEGER NOT NULL, published_rev INTEGER NOT NULL DEFAULT 0,
  published_hash TEXT, acked_rev INTEGER NOT NULL DEFAULT 0, last_event_id TEXT, last_event_raw TEXT,
  last_version INTEGER NOT NULL DEFAULT 0,
  last_clock_derived INTEGER NOT NULL DEFAULT 0,
  floor_version INTEGER NOT NULL DEFAULT 0,
  floor_before INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (list_id, shard));
CREATE TABLE relay_acks (list_id TEXT, shard INTEGER, relay_url TEXT, event_id TEXT, version INTEGER, acked_ms INTEGER, PRIMARY KEY (list_id, shard, relay_url));
CREATE TABLE members (list_id TEXT, pubkey TEXT, last_seen_ms INTEGER, PRIMARY KEY (list_id, pubkey));
CREATE TABLE future_events (list_id TEXT, pubkey TEXT, d_tag TEXT, raw TEXT NOT NULL, received_ms INTEGER, PRIMARY KEY (list_id, pubkey, d_tag));
CREATE TABLE relays (url TEXT PRIMARY KEY, position INTEGER NOT NULL, source TEXT NOT NULL);
CREATE TABLE category_prefs (name_norm TEXT PRIMARY KEY, category TEXT NOT NULL, updated_ms INTEGER NOT NULL);
`;

export const MIGRATIONS: Migration[] = [
  async (tx) => {
    for (const stmt of M1.split(';').map((s) => s.trim()).filter(Boolean)) await tx.exec(stmt);
  },
  // 2 (review CR-03 R-1): lege of ongeldige ledenrijen opruimen. Een herstel zonder transport kon een lege pubkey in
  // `members` zetten; die belandde in het authors-filter van de REQ, en strfry-relays weigeren zo'n filter.
  async (tx) => {
    await tx.exec("DELETE FROM members WHERE pubkey IS NULL OR length(pubkey) <> 64 OR pubkey GLOB '*[^0-9a-f]*'");
    await tx.exec("UPDATE lists SET nostr_pubkey = NULL WHERE nostr_pubkey IS NOT NULL AND (length(nostr_pubkey) <> 64 OR nostr_pubkey GLOB '*[^0-9a-f]*')");
  },
];

export const SCHEMA_VERSION = MIGRATIONS.length;

/** Opent de database: PRAGMA's en alle ontbrekende migraties, elk in een eigen transactie. */
export async function migrate(repo: Repository, migrations: Migration[] = MIGRATIONS): Promise<number> {
  await repo.execRaw('PRAGMA journal_mode=WAL');
  await repo.execRaw('PRAGMA synchronous=FULL');
  await repo.execRaw('PRAGMA foreign_keys=ON');
  await repo.execRaw('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  const row = await repo.read((r) => r.get<{ value: string }>("SELECT value FROM meta WHERE key='schema_version'"));
  let version = row ? Number(row.value) : 0;
  for (let i = version; i < migrations.length; i++) {
    await repo.tx(async (tx) => {
      await migrations[i](tx);
      await tx.run("INSERT INTO meta(key,value) VALUES('schema_version',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [String(i + 1)]);
    });
    version = i + 1;
  }
  return version;
}
