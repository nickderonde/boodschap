// SQL-toegang per tabel (§9.1). Alle functies krijgen een SqlReader/SqlTx van Repository (nooit de driver).
import { normalizeName } from '../core/categorize/normalize';
import { isItemDeleted, itemMaxHlc, regHlc, regValue } from '../core/crdt/item';
import { listName } from '../core/crdt/list';
import type { ItemState, Regs } from '../core/types';
import type { SqlReader, SqlTx } from './Repository';

export interface ListRow {
  id: string;
  regs: Regs;
  name: string;
  position: number;
  shared: boolean;
  listTag: string | null;
  nostrPubkey: string | null;
  shardCount: number;
  stateRev: number;
  joinedPending: boolean;
  futureSchema: boolean;
}

interface ListRowDb {
  id: string;
  regs: string;
  name: string;
  position: number;
  shared: number;
  list_tag: string | null;
  nostr_pubkey: string | null;
  shard_count: number;
  state_rev: number;
  joined_pending: number;
  future_schema: number;
}

function toListRow(r: ListRowDb): ListRow {
  return {
    id: r.id,
    regs: JSON.parse(r.regs) as Regs,
    name: r.name,
    position: r.position,
    shared: r.shared === 1,
    listTag: r.list_tag,
    nostrPubkey: r.nostr_pubkey,
    shardCount: r.shard_count,
    stateRev: r.state_rev,
    joinedPending: r.joined_pending === 1,
    futureSchema: r.future_schema === 1,
  };
}

// ---- meta ----

export async function getMeta(r: SqlReader, key: string): Promise<string | null> {
  const row = await r.get<{ value: string }>('SELECT value FROM meta WHERE key=?', [key]);
  return row ? row.value : null;
}

export async function setMeta(tx: SqlTx, key: string, value: string): Promise<void> {
  await tx.run('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, value]);
}

// ---- lists ----

export async function loadLists(r: SqlReader): Promise<ListRow[]> {
  return (await r.all<ListRowDb>('SELECT * FROM lists ORDER BY position, id')).map(toListRow);
}

export async function getList(r: SqlReader, id: string): Promise<ListRow | null> {
  const row = await r.get<ListRowDb>('SELECT * FROM lists WHERE id=?', [id]);
  return row ? toListRow(row) : null;
}

export async function getListByTag(r: SqlReader, tag: string): Promise<ListRow | null> {
  const row = await r.get<ListRowDb>('SELECT * FROM lists WHERE list_tag=?', [tag]);
  return row ? toListRow(row) : null;
}

export async function insertList(tx: SqlTx, row: { id: string; regs: Regs; position: number; shared?: boolean; listTag?: string | null; nostrPubkey?: string | null; joinedPending?: boolean }): Promise<void> {
  await tx.run('INSERT INTO lists(id, regs, name, position, shared, list_tag, nostr_pubkey, joined_pending) VALUES (?,?,?,?,?,?,?,?)', [
    row.id,
    JSON.stringify(row.regs),
    listName({ regs: row.regs }) ?? '',
    row.position,
    row.shared ? 1 : 0,
    row.listTag ?? null,
    row.nostrPubkey ?? null,
    row.joinedPending ? 1 : 0,
  ]);
}

export async function writeListRegs(tx: SqlTx, id: string, regs: Regs): Promise<void> {
  await tx.run('UPDATE lists SET regs=?, name=? WHERE id=?', [JSON.stringify(regs), listName({ regs }) ?? '', id]);
}

export async function bumpStateRev(tx: SqlTx, id: string): Promise<number> {
  await tx.run('UPDATE lists SET state_rev = state_rev + 1 WHERE id=?', [id]);
  const row = await tx.get<{ state_rev: number }>('SELECT state_rev FROM lists WHERE id=?', [id]);
  return row?.state_rev ?? 0;
}

export async function maxPosition(r: SqlReader): Promise<number> {
  const row = await r.get<{ m: number | null }>('SELECT MAX(position) AS m FROM lists');
  return row?.m ?? -1;
}

export async function setListShared(tx: SqlTx, id: string, f: { shared: boolean; listTag: string | null; nostrPubkey: string | null; joinedPending?: boolean }): Promise<void> {
  await tx.run('UPDATE lists SET shared=?, list_tag=?, nostr_pubkey=?, joined_pending=? WHERE id=?', [f.shared ? 1 : 0, f.listTag, f.nostrPubkey, f.joinedPending ? 1 : 0, id]);
}

export async function setJoinedPending(tx: SqlTx, id: string, pending: boolean): Promise<void> {
  await tx.run('UPDATE lists SET joined_pending=? WHERE id=?', [pending ? 1 : 0, id]);
}

export async function setNostrPubkey(tx: SqlTx, id: string, pubkey: string): Promise<void> {
  await tx.run('UPDATE lists SET nostr_pubkey=? WHERE id=?', [pubkey, id]);
}

export async function setShardCount(tx: SqlTx, id: string, n: number): Promise<void> {
  await tx.run('UPDATE lists SET shard_count=? WHERE id=?', [n, id]);
}

export async function setFutureSchema(tx: SqlTx, id: string, v: boolean): Promise<void> {
  await tx.run('UPDATE lists SET future_schema=? WHERE id=?', [v ? 1 : 0, id]);
}

/** Wist alle sync-gegevens van een lijst (verlaten, F-18). Tabellen zonder FK worden expliciet opgeruimd (§7). */
export async function clearSyncData(tx: SqlTx, id: string): Promise<void> {
  for (const t of ['shard_state', 'pending_changes', 'relay_acks', 'members', 'future_events']) await tx.run(`DELETE FROM ${t} WHERE list_id=?`, [id]);
  await tx.run('UPDATE lists SET shared=0, list_tag=NULL, nostr_pubkey=NULL, joined_pending=0, shard_count=1, future_schema=0 WHERE id=?', [id]);
}

/** Verwijdert een lijst volledig (afronden, §7 stap 3.2). */
export async function deleteListCompletely(tx: SqlTx, id: string): Promise<void> {
  for (const t of ['items', 'shard_state', 'pending_changes', 'relay_acks', 'members', 'future_events']) await tx.run(`DELETE FROM ${t} WHERE list_id=?`, [id]);
  await tx.run('DELETE FROM lists WHERE id=?', [id]);
}

// ---- items ----

interface ItemRowDb {
  list_id: string;
  id: string;
  regs: string;
  del_hlc: string | null;
}

export function itemFromDb(r: ItemRowDb): ItemState {
  return { id: r.id, regs: JSON.parse(r.regs) as Regs, del: r.del_hlc };
}

export async function loadItems(r: SqlReader, listId?: string): Promise<Map<string, ItemState[]>> {
  const rows = listId
    ? await r.all<ItemRowDb>('SELECT list_id, id, regs, del_hlc FROM items WHERE list_id=?', [listId])
    : await r.all<ItemRowDb>('SELECT list_id, id, regs, del_hlc FROM items');
  const out = new Map<string, ItemState[]>();
  for (const row of rows) {
    const arr = out.get(row.list_id) ?? [];
    arr.push(itemFromDb(row));
    out.set(row.list_id, arr);
  }
  return out;
}

export async function getItem(r: SqlReader, listId: string, id: string): Promise<ItemState | null> {
  const row = await r.get<ItemRowDb>('SELECT list_id, id, regs, del_hlc FROM items WHERE list_id=? AND id=?', [listId, id]);
  return row ? itemFromDb(row) : null;
}

/** Meerdere items in batches van 400 (één SELECT per batch). */
export async function getItems(r: SqlReader, listId: string, ids: string[]): Promise<Map<string, ItemState>> {
  const out = new Map<string, ItemState>();
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400);
    const rows = await r.all<ItemRowDb>(`SELECT list_id, id, regs, del_hlc FROM items WHERE list_id=? AND id IN (${chunk.map(() => '?').join(',')})`, [listId, ...chunk]);
    for (const row of rows) out.set(row.id, itemFromDb(row));
  }
  return out;
}

export async function putItem(tx: SqlTx, listId: string, it: ItemState): Promise<void> {
  const name = regValue<string>(it, 'n') ?? '';
  await tx.run(
    `INSERT INTO items(list_id, id, regs, del_hlc, max_hlc, deleted, checked, category, name, name_norm, added_hlc)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(list_id, id) DO UPDATE SET regs=excluded.regs, del_hlc=excluded.del_hlc, max_hlc=excluded.max_hlc,
       deleted=excluded.deleted, checked=excluded.checked, category=excluded.category, name=excluded.name,
       name_norm=excluded.name_norm, added_hlc=excluded.added_hlc`,
    [
      listId,
      it.id,
      JSON.stringify(it.regs),
      it.del,
      itemMaxHlc(it) ?? '',
      isItemDeleted(it) ? 1 : 0,
      regValue<boolean>(it, 'x') === true ? 1 : 0,
      regValue<string>(it, 'k') ?? 'overig',
      name,
      normalizeName(name),
      regHlc(it, 'a') ?? regHlc(it, 'n') ?? '',
    ],
  );
}

// ---- pending_changes ----

export async function insertPending(tx: SqlTx, listId: string, itemId: string | null, rev: number): Promise<void> {
  await tx.run('INSERT INTO pending_changes(list_id, item_id, rev) VALUES (?,?,?)', [listId, itemId, rev]);
}

export async function countPending(r: SqlReader, listId: string): Promise<number> {
  const row = await r.get<{ n: number }>('SELECT COUNT(*) AS n FROM pending_changes WHERE list_id=?', [listId]);
  return row?.n ?? 0;
}

export async function pendingRows(r: SqlReader, listId: string): Promise<{ seq: number; item_id: string | null; rev: number }[]> {
  return r.all('SELECT seq, item_id, rev FROM pending_changes WHERE list_id=?', [listId]);
}

// ---- category_prefs (F-09) ----

export async function loadCategoryPrefs(r: SqlReader): Promise<Map<string, string>> {
  const rows = await r.all<{ name_norm: string; category: string }>('SELECT name_norm, category FROM category_prefs');
  return new Map(rows.map((x) => [x.name_norm, x.category]));
}

export async function putCategoryPref(tx: SqlTx, norm: string, category: string, ms: number): Promise<void> {
  await tx.run('INSERT INTO category_prefs(name_norm, category, updated_ms) VALUES (?,?,?) ON CONFLICT(name_norm) DO UPDATE SET category=excluded.category, updated_ms=excluded.updated_ms', [norm, category, ms]);
}

// ---- relays ----

export async function loadRelays(r: SqlReader): Promise<{ url: string; source: string }[]> {
  return r.all('SELECT url, source FROM relays ORDER BY position, url');
}

export async function replaceRelays(tx: SqlTx, rows: { url: string; source: string }[]): Promise<void> {
  await tx.run('DELETE FROM relays');
  let i = 0;
  for (const row of rows) await tx.run('INSERT OR IGNORE INTO relays(url, position, source) VALUES (?,?,?)', [row.url, i++, row.source]);
}

export async function addRelay(tx: SqlTx, url: string, source: string): Promise<void> {
  const row = await tx.get<{ m: number | null }>('SELECT MAX(position) AS m FROM relays');
  await tx.run('INSERT OR IGNORE INTO relays(url, position, source) VALUES (?,?,?)', [url, (row?.m ?? -1) + 1, source]);
}

// ---- members ----

export async function loadMembers(r: SqlReader, listId: string): Promise<string[]> {
  return (await r.all<{ pubkey: string }>('SELECT pubkey FROM members WHERE list_id=? ORDER BY last_seen_ms DESC LIMIT 50', [listId])).map((x) => x.pubkey);
}

export async function upsertMember(tx: SqlTx, listId: string, pubkey: string, ms: number): Promise<void> {
  await tx.run('INSERT INTO members(list_id, pubkey, last_seen_ms) VALUES (?,?,?) ON CONFLICT(list_id, pubkey) DO UPDATE SET last_seen_ms=excluded.last_seen_ms', [listId, pubkey, ms]);
}

// ---- future_events (S-20) ----

export async function putFutureEvent(tx: SqlTx, listId: string, pubkey: string, dTag: string, raw: string, ms: number): Promise<void> {
  await tx.run('INSERT INTO future_events(list_id, pubkey, d_tag, raw, received_ms) VALUES (?,?,?,?,?) ON CONFLICT(list_id, pubkey, d_tag) DO UPDATE SET raw=excluded.raw, received_ms=excluded.received_ms', [listId, pubkey, dTag, raw, ms]);
}

export async function countFutureEvents(r: SqlReader, listId: string): Promise<number> {
  const row = await r.get<{ n: number }>('SELECT COUNT(*) AS n FROM future_events WHERE list_id=?', [listId]);
  return row?.n ?? 0;
}
