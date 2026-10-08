// BootschapApp-facade (§9.3, §10): enige API voor de UI, optimistisch via StateCache + WriteQueue.
// Implementeert ook SyncHost voor de engine (opslag van de sync-tabellen en merge via de wachtrij).
import { makeConfig, type Config } from '../config';
import { bytesEqual, fromHex, toHex } from '../core/bytes';
import { categorize } from '../core/categorize/categorize';
import { isCategoryId } from '../core/categorize/categories';
import { normalizeName } from '../core/categorize/normalize';
import { shardOf } from '../core/codec/shard';
import { parseShareText, shareText, toLink, toTextCode, ShareCodeParseError, type SharePayload } from '../core/codec/sharecode';
import { mergeItem, isItemDeleted, regValue } from '../core/crdt/item';
import { emptyList, isListDeleted, listOf, mergeList } from '../core/crdt/list';
import { mergeRegs } from '../core/crdt/register';
import { deriveListKeys } from '../core/crypto/kdf';
import { findDuplicate, increasedQuantity } from '../core/duplicate';
import { HlcClock } from '../core/hlc';
import { newDeviceId, newItemId, newListId } from '../core/ids';
import {
  createItemDelta,
  createListDelta,
  deleteItemDelta,
  deleteListDelta,
  deltaMaxHlc,
  editItemDelta,
  renameListDelta,
  restoreItemDelta,
  type ItemField,
} from '../core/ops';
import { parseInput } from '../core/parseInput';
import type { Suggestion } from '../core/suggest';
import type { Clock, ItemState, ListDelta, ListState, ListView, Logger, Random, Timers } from '../core/types';
import { nullLogger } from '../core/types';
import { cleanItemName, cleanListName, cleanNote, cleanQuantity, cleanUnit, InputError } from '../core/validate';
import { dao, keyNames, migrate, Repository, type KeyStore, type SqlDriver, type SqlTx } from '../storage';
import { createSyncEngine, type Faults, type SyncEngine } from '../sync/engine/SyncEngine';
import type { SyncStatus } from '../sync/engine/status';
import type { FlushSnapshot, PersistShard, ShardRow, SyncHost, SyncListInfo } from '../sync/SyncHost';
import type { Identity, Transport } from '../sync/Transport';
import { StateCache } from './StateCache';
import type { AddInput, AddResult, AppError, ItemPatch, JoinResult, ListSummary, Pending, ShareInfo, UndoToken } from './types';
import { WriteQueue } from './WriteQueue';

export interface AppDeps {
  db: SqlDriver;
  keys: KeyStore;
  clock: Clock;
  timers: Timers;
  random: Random;
  /** Fabriek voor de transport. Ontbreekt die, dan draait de app zonder sync (M2, of "alles uit"). */
  transport?: (relays: string[]) => Transport;
  log?: Logger;
  config?: Partial<Config>;
  /** Test-hooks voor crashpunten (§13.3). */
  faults?: Faults;
  strings?: { defaultListName: string; sharedListPlaceholderName: string; shareWarning: string };
}

export interface BootschapApp {
  init(): Promise<void>;
  lists(): ListSummary[];
  view(listId: string): ListView;
  suggest(prefix: string): Suggestion[];
  createList(name: string): Pending<{ listId: string }>;
  renameList(id: string, name: string): Pending<void>;
  addItem(listId: string, input: AddInput, opts?: { force?: boolean }): Pending<AddResult>;
  increaseQuantity(listId: string, itemId: string, by?: number): Pending<void>;
  updateItem(listId: string, itemId: string, patch: ItemPatch): Pending<void>;
  toggleChecked(listId: string, itemId: string): Pending<void>;
  deleteItem(listId: string, itemId: string): Pending<UndoToken>;
  clearChecked(listId: string): Pending<UndoToken>;
  undo(t: UndoToken): Pending<void>;
  deleteList(id: string): Promise<void>;
  share(listId: string): Promise<ShareInfo>;
  /** Deelinformatie van een al gedeelde lijst (QR, code, "Klaar om te koppelen"). */
  shareInfo(listId: string): Promise<ShareInfo>;
  join(text: string): Promise<JoinResult>;
  leave(listId: string, keepCopy: boolean): Promise<void>;
  setRelays(urls: string[]): Promise<void>;
  relays(): Promise<string[]>;
  syncStatus(listId: string): SyncStatus;
  syncNow(listId?: string): Promise<void>;
  onChange(cb: (listIds: string[]) => void): () => void;
  onSyncStatus(cb: (listId: string, s: SyncStatus) => void): () => void;
  onError(cb: (e: AppError) => void): () => void;
  foreground(): void;
  background(): Promise<void>;
  networkRestored(): void;
  shutdown(): Promise<void>;
  /** Wacht tot de achtergrondstart (sleutels + engine) klaar is. Vooral voor tests. */
  whenSyncStarted(): Promise<void>;
  /** Wacht tot alle schrijftaken gecommit zijn. Vooral voor tests. */
  flushWrites(): Promise<void>;
}

const DEFAULT_STRINGS = {
  defaultListName: 'Boodschappen',
  sharedListPlaceholderName: 'Gedeelde lijst',
  shareWarning: 'Deel deze code alleen met mensen die je vertrouwt. Wie de code heeft, kan altijd meedoen.',
};

interface ListCrypto {
  secret: Uint8Array;
  listTag: string;
  encKey: Uint8Array;
  identity: Identity;
}

type Listener<A extends unknown[]> = (...a: A) => void;

class Emitter<A extends unknown[]> {
  private ls = new Set<Listener<A>>();
  on(cb: Listener<A>): () => void {
    this.ls.add(cb);
    return () => this.ls.delete(cb);
  }
  emit(...a: A): void {
    for (const l of [...this.ls]) {
      try {
        l(...a);
      } catch {
        // luisteraars mogen de app niet breken
      }
    }
  }
}

/** Fout bij een commando dat niet kan (verlopen undo, onbekende lijst of item, ongeldige relay). */
export class CommandError extends Error {
  constructor(readonly code: 'undo-verlopen' | 'lijst-onbekend' | 'item-onbekend' | 'relay-ongeldig' | 'niet-gedeeld') {
    super(code);
  }
}

function handled<T>(p: Promise<T>): Promise<T> {
  p.catch(() => {});
  return p;
}

function deltaOf(items: ItemState[], regs: ListState['regs'] = {}): ListDelta {
  return { regs, items: new Map(items.map((i) => [i.id, i])) };
}

export function createBootschapApp(deps: AppDeps): BootschapApp {
  return new BootschapAppImpl(deps);
}

export class BootschapAppImpl implements BootschapApp, SyncHost {
  readonly config: Config;
  private readonly log: Logger;
  private readonly strings: typeof DEFAULT_STRINGS;
  readonly repo: Repository;
  private readonly cache: StateCache;
  private readonly queue: WriteQueue;
  private hlc!: HlcClock;
  deviceId = '';
  private readonly crypto = new Map<string, ListCrypto>();
  private engine: SyncEngine | null = null;
  private transportInstance: Transport | null = null;
  private readonly undoTokens = new Map<string, { token: UndoToken }>();
  private readonly changes = new Emitter<[string[]]>();
  private readonly statusEvents = new Emitter<[string, SyncStatus]>();
  private readonly errors = new Emitter<[AppError]>();
  private syncStart: Promise<void> = Promise.resolve();
  private closed = false;

  constructor(private readonly deps: AppDeps) {
    this.config = makeConfig(deps.config);
    this.log = deps.log ?? nullLogger;
    this.strings = deps.strings ?? DEFAULT_STRINGS;
    this.repo = new Repository(deps.db);
    this.cache = new StateCache(this.strings.sharedListPlaceholderName);
    this.queue = new WriteQueue(this.repo, (listId, err, pending) => this.onWriteFailure(listId, err, pending));
  }

  // ------------------------------------------------------------------ levenscyclus (§11)

  async init(): Promise<void> {
    await migrate(this.repo);
    const now = this.deps.clock.nowMs();
    let deviceId = await this.repo.read((r) => dao.getMeta(r, 'device_id'));
    const firstRunDone = (await this.repo.read((r) => dao.getMeta(r, 'first_run_done'))) === '1';
    const savedHlc = await this.repo.read((r) => dao.getMeta(r, 'hlc'));
    // §19 (review CR-03 C-2): hersteld uit een back-up of gemigreerd naar een ander toestel? Dan een nieuwe identiteit.
    if (firstRunDone && deviceId) deviceId = (await this.checkInstallation(deviceId)) ?? deviceId;
    if (!deviceId) deviceId = newDeviceId(this.deps.random);
    this.deviceId = deviceId;
    const parsed = savedHlc ? savedHlc.split(':').map(Number) : null;
    this.hlc = HlcClock.restore(deviceId, parsed ? { l: parsed[0], c: parsed[1] } : null, now);

    if (!firstRunDone) {
      const listId = newListId(this.deps.random);
      const d = createListDelta(this.strings.defaultListName, this.hlc, now);
      await this.repo.tx(async (tx) => {
        await dao.setMeta(tx, 'device_id', deviceId!);
        await dao.replaceRelays(tx, this.config.defaultRelays.map((url) => ({ url, source: 'default' })));
        await dao.insertList(tx, { id: listId, regs: d.regs, position: 0 });
        await dao.setMeta(tx, 'first_run_done', '1');
        await this.writeHlc(tx);
      });
      await this.newInstallId();
    }

    // Lijsten met D afronden (§7, E-14).
    const rows = await this.repo.read((r) => dao.loadLists(r));
    for (const row of rows) if (isListDeleted(row)) await this.maybeFinalizeDeletion(row.id, row);

    await this.reloadAll();
    this.syncStart = handled(this.startSync());
  }

  /**
   * §19: vergelijkt de `install_id` in de database met die in de KeyStore (deviceOnly, gaat niet mee met een back-up of
   * migratie). Gelijk: niets aan de hand. Database heeft er nog geen (installatie van vóór §19): alleen vastleggen.
   * Ontbreekt of wijkt af in de KeyStore: dit is een kopie van een ander toestel. Dan: nieuwe Nostr-identiteit per
   * gedeelde lijst (versies per slot terug naar 0), daarna een nieuwe device-ID (HLC-node) en een nieuwe install_id.
   * Lijsten, items en lijstgeheimen blijven; er is nog niets gepubliceerd (dit draait vóór de sync start).
   * Volgorde maakt het herhaalbaar: valt de app halverwege uit, dan herkent de volgende start het opnieuw.
   * Geeft de nieuwe device-ID terug bij herstel, anders null.
   */
  private async checkInstallation(deviceId: string): Promise<string | null> {
    const inDb = await this.repo.read((r) => dao.getMeta(r, 'install_id'));
    let inStore: string | null;
    try {
      inStore = await this.deps.keys.get(keyNames.installId);
    } catch {
      this.log.warn('install.check-skipped'); // KeyStore niet leesbaar (bijv. toestel vergrendeld): niets doen
      return null;
    }
    if (!inDb) {
      await this.newInstallId();
      return null;
    }
    if (inStore === inDb) return null;
    // K-6: de KeyStore kon de vorige keer niet worden geschreven (structurele fout). Niet opnieuw roteren; alleen
    // opnieuw proberen de KeyStore te schrijven.
    if ((await this.repo.read((r) => dao.getMeta(r, 'install_id_unsaved'))) === inDb) {
      if (await this.writeInstallIdToStore(inDb)) await this.repo.tx((tx) => tx.run("DELETE FROM meta WHERE key='install_id_unsaved'", []));
      return null;
    }
    this.log.warn('install.restored');
    const rows = await this.repo.read((r) => dao.loadLists(r));
    // R-1: eerst de transport (zonder te verbinden), zodat de nieuwe identiteiten meteen een geldige pubkey hebben.
    if (rows.some((row) => row.shared)) await this.ensureTransport();
    for (const row of rows) if (row.shared) await this.rotateIdentity(row.id);
    await this.queue.idle();
    const fresh = newDeviceId(this.deps.random);
    const installId = newDeviceId(this.deps.random);
    // K-6: eerst de KeyStore, dan de database. Faalt de KeyStore, dan markeren we dat in de database zodat een volgende
    // start niet opnieuw roteert.
    const saved = await this.writeInstallIdToStore(installId);
    await this.repo.tx(async (tx) => {
      await dao.setMeta(tx, 'device_id', fresh);
      await dao.setMeta(tx, 'install_id', installId);
      if (!saved) await dao.setMeta(tx, 'install_id_unsaved', installId);
    });
    return fresh;
  }

  /** Nieuwe installatie (of installatie van vóór §19): KeyStore eerst, dan de database (K-6). */
  private async newInstallId(): Promise<void> {
    const installId = newDeviceId(this.deps.random);
    const saved = await this.writeInstallIdToStore(installId);
    await this.repo.tx(async (tx) => {
      await dao.setMeta(tx, 'install_id', installId);
      if (!saved) await dao.setMeta(tx, 'install_id_unsaved', installId);
    });
  }

  /** Schrijft de install_id (deviceOnly). Een fout van de KeyStore is geen startfout: loggen en `false`. */
  private async writeInstallIdToStore(installId: string): Promise<boolean> {
    try {
      await this.deps.keys.set(keyNames.installId, installId, { deviceOnly: true });
      return true;
    } catch {
      this.log.warn('install.keystore-failed');
      return false;
    }
  }

  whenSyncStarted(): Promise<void> {
    return this.syncStart;
  }

  flushWrites(): Promise<void> {
    return this.queue.idle();
  }

  private async reloadAll(): Promise<void> {
    const { rows, items, prefs } = await this.repo.read(async (r) => ({
      rows: await dao.loadLists(r),
      items: await dao.loadItems(r),
      prefs: await dao.loadCategoryPrefs(r),
    }));
    this.cache.prefs = prefs;
    for (const row of rows) this.cache.set(row, listOf(row.regs, items.get(row.id) ?? []));
  }

  private async reloadList(listId: string, extra: ListDelta[] = []): Promise<void> {
    const { row, items } = await this.repo.read(async (r) => ({ row: await dao.getList(r, listId), items: await dao.loadItems(r, listId) }));
    if (!row) {
      this.cache.remove(listId);
      return;
    }
    let state = listOf(row.regs, items.get(listId) ?? []);
    for (const d of extra) state = mergeList(state, d);
    this.cache.set(row, state);
  }

  private async onWriteFailure(listId: string | null, err: unknown, pending: ListDelta[]): Promise<void> {
    if (this.closed) return;
    this.log.error('write.failed', { reason: err instanceof Error ? err.name : 'unknown' });
    if (listId) {
      await this.reloadList(listId, pending);
      this.changes.emit([listId]);
    }
    this.errors.emit({ code: 'opslaan-mislukt', listId: listId ?? undefined });
  }

  private async startSync(): Promise<void> {
    const shared = [...this.cache.lists.values()].filter((c) => c.row.shared);
    if (shared.length > 0) await this.ensureTransport();
    for (const c of shared) {
      const ok = await this.loadCrypto(c.row.id);
      if (!ok) {
        // Sleutels ontbreken: lijst als verlaten afronden (§7).
        this.log.warn('keys.missing');
        await this.repo.tx((tx) => dao.clearSyncData(tx, c.row.id));
        await this.reloadList(c.row.id);
      }
    }
    if ([...this.cache.lists.values()].some((c) => c.row.shared)) {
      const eng = await this.ensureEngine();
      await eng?.start();
    }
  }

  private async loadCrypto(listId: string): Promise<boolean> {
    if (this.crypto.has(listId)) return true;
    const [sHex, nHex] = await Promise.all([this.deps.keys.get(keyNames.secret(listId)), this.deps.keys.get(keyNames.nostr(listId))]);
    if (!sHex || !nHex) return false;
    const t = this.transportInstance;
    if (!t) return true; // geen sync mogelijk (geen transport); de sleutels zijn er wel
    const secret = fromHex(sHex);
    const keys = deriveListKeys(secret);
    const identity = t.identityFromSecret(fromHex(nHex));
    if (!identity) return false;
    this.crypto.set(listId, { secret, listTag: keys.listTag, encKey: keys.encKey, identity });
    // Gedeeld zonder transport (D-05): publieke sleutel en eigen lid alsnog vastleggen (review bevinding 14).
    const row = this.cache.get(listId)?.row;
    if (row && row.nostrPubkey !== identity.id) {
      await this.queue.enqueue(null, null, async (tx) => {
        await dao.setNostrPubkey(tx, listId, identity.id);
        await dao.upsertMember(tx, listId, identity.id, this.now());
      });
      const c = this.cache.get(listId);
      if (c) c.row = { ...c.row, nostrPubkey: identity.id };
    }
    return true;
  }

  /**
   * Single-flight voor alles wat de engine of transport maakt of vervangt (review N2): er bestaat altijd hooguit
   * één engine en één transport. Niet re-entrant; binnen een sectie de *Unlocked-varianten gebruiken.
   */
  private lifecycleTail: Promise<unknown> = Promise.resolve();
  private serialLifecycle<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lifecycleTail.then(fn, fn);
    this.lifecycleTail = run.catch(() => undefined);
    return run;
  }

  private ensureEngine(): Promise<SyncEngine | null> {
    return this.serialLifecycle(() => this.ensureEngineUnlocked());
  }

  private async ensureEngineUnlocked(): Promise<SyncEngine | null> {
    if (this.engine) return this.engine;
    if (!this.deps.transport || this.closed) return null;
    await this.ensureTransportUnlocked();
    if (!this.transportInstance) return null;
    // Sleutels laden die nog niet geladen waren (transport was er nog niet).
    for (const c of this.cache.lists.values()) if (c.row.shared && !this.crypto.has(c.row.id)) await this.loadCrypto(c.row.id);
    this.engine = createSyncEngine({
      host: this,
      transport: this.transportInstance,
      clock: this.deps.clock,
      timers: this.deps.timers,
      random: this.deps.random,
      log: this.log,
      config: this.config,
      faults: this.deps.faults,
    });
    this.engine.onStatus((id, s) => this.statusEvents.emit(id, s));
    return this.engine;
  }

  /** Voor tests: de engine (of null). */
  get syncEngine(): SyncEngine | null {
    return this.engine;
  }

  foreground(): void {
    this.engine?.resume();
  }

  async background(): Promise<void> {
    await this.queue.idle();
    await this.engine?.pause();
  }

  networkRestored(): void {
    this.engine?.networkRestored();
  }

  async syncNow(listId?: string): Promise<void> {
    await this.engine?.syncNow(listId);
  }

  async shutdown(): Promise<void> {
    await this.queue.idle();
    this.closed = true;
    this.engine?.shutdown();
    await this.repo.close();
  }

  // ------------------------------------------------------------------ queries (synchroon uit de cache)

  lists(): ListSummary[] {
    const out: ListSummary[] = [];
    for (const c of this.cache.lists.values()) {
      if (isListDeleted(c.state)) continue;
      const v = this.cache.view(c.row.id);
      out.push({ id: c.row.id, name: v.name, shared: c.row.shared, total: v.total, checkedCount: v.checkedCount, position: c.row.position });
    }
    return out.sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1));
  }

  view(listId: string): ListView {
    const c = this.cache.require(listId);
    const v = this.cache.view(listId);
    // "Geen halve lijst" (F-14): zolang het koppelen loopt, geen items tonen.
    if (c.row.joinedPending) return { ...v, sections: [], total: 0, checkedCount: 0 };
    return v;
  }

  suggest(prefix: string): Suggestion[] {
    return this.cache.suggest.suggest(prefix, this.deps.clock.nowMs());
  }

  syncStatus(listId: string): SyncStatus {
    const c = this.cache.get(listId);
    if (this.engine) return this.engine.status(listId);
    return { kind: c?.row.shared ? 'offline' : 'lokaal', pending: 0, relaysOpen: 0, relaysTotal: 0, fetching: !!c?.row.joinedPending };
  }

  async relays(): Promise<string[]> {
    return (await this.repo.read((r) => dao.loadRelays(r))).map((x) => x.url);
  }

  onChange(cb: (listIds: string[]) => void): () => void {
    return this.changes.on(cb);
  }

  onSyncStatus(cb: (listId: string, s: SyncStatus) => void): () => void {
    return this.statusEvents.on(cb);
  }

  onError(cb: (e: AppError) => void): () => void {
    return this.errors.on(cb);
  }

  // ------------------------------------------------------------------ schrijfpad (§9.3)

  private writeHlc(tx: SqlTx): Promise<void> {
    const s = this.hlc.state();
    return dao.setMeta(tx, 'hlc', `${s.l}:${s.c}`);
  }

  /** Merget een delta in de DB-rijen (read-merge-write, I-1). Geeft true als er iets veranderde. */
  private async mergeIntoDb(tx: SqlTx, listId: string, delta: ListDelta): Promise<boolean> {
    let changed = false;
    if (Object.keys(delta.regs).length > 0) {
      const row = await dao.getList(tx, listId);
      if (!row) throw new Error('lijst-onbekend');
      const merged = mergeRegs(row.regs, delta.regs);
      if (merged !== row.regs) {
        await dao.writeListRegs(tx, listId, merged);
        changed = true;
      }
    }
    // Eén SELECT per batch in plaats van per item (review bevinding 11); alleen gewijzigde rijen schrijven.
    const incoming = [...delta.items.values()];
    const current = await dao.getItems(tx, listId, incoming.map((i) => i.id));
    for (const it of incoming) {
      const cur = current.get(it.id);
      const m = mergeItem(cur, it)!;
      if (m !== cur) {
        await dao.putItem(tx, listId, m);
        changed = true;
      }
    }
    return changed;
  }

  /** Lokaal commando: synchroon in de cache, daarna de delta via de wachtrij (§9.3). */
  private local(listId: string, delta: ListDelta, extra?: (tx: SqlTx) => Promise<void>): Promise<void> {
    this.cache.apply(listId, delta);
    this.changes.emit([listId]);
    const committed = this.queue.enqueue(listId, delta, async (tx) => {
      await this.mergeIntoDb(tx, listId, delta);
      const rev = await dao.bumpStateRev(tx, listId);
      const row = await dao.getList(tx, listId);
      if (row?.shared) {
        if (Object.keys(delta.regs).length > 0) await dao.insertPending(tx, listId, null, rev);
        for (const id of delta.items.keys()) await dao.insertPending(tx, listId, id, rev);
      }
      if (extra) await extra(tx);
      await this.writeHlc(tx);
      if (row) {
        const c = this.cache.get(listId);
        if (c) c.row = { ...c.row, stateRev: rev };
      }
    });
    return handled(
      committed.then(async () => {
        await this.deps.faults?.at('after-commit', { listId });
        this.engine?.notifyLocalChange(listId);
      }),
    );
  }

  private item(listId: string, itemId: string): ItemState {
    const it = this.cache.require(listId).state.items.get(itemId);
    if (!it || isItemDeleted(it) || it.regs.n === undefined) throw new CommandError('item-onbekend');
    return it;
  }

  private now(): number {
    return this.deps.clock.nowMs();
  }

  createList(name: string): Pending<{ listId: string }> {
    const clean = cleanListName(name);
    const listId = newListId(this.deps.random);
    const delta = createListDelta(clean, this.hlc, this.now());
    const position = Math.max(-1, ...[...this.cache.lists.values()].map((c) => c.row.position)) + 1;
    const row: dao.ListRow = { id: listId, regs: delta.regs, name: clean, position, shared: false, listTag: null, nostrPubkey: null, shardCount: 1, stateRev: 0, joinedPending: false, futureSchema: false };
    this.cache.set(row, listOf(delta.regs, []));
    this.changes.emit([listId]);
    const committed = this.queue.enqueue(listId, delta, async (tx) => {
      await dao.insertList(tx, { id: listId, regs: delta.regs, position });
      await this.writeHlc(tx);
    });
    return { result: { listId }, committed: handled(committed) };
  }

  renameList(id: string, name: string): Pending<void> {
    const clean = cleanListName(name);
    const c = this.cache.require(id);
    return { result: undefined, committed: this.local(id, renameListDelta(c.state, clean, this.hlc, this.now())) };
  }

  addItem(listId: string, input: AddInput, opts?: { force?: boolean }): Pending<AddResult> {
    const c = this.cache.require(listId);
    const explicit = input.quantity !== undefined || input.unit !== undefined;
    const parsed = explicit ? { name: input.text, quantity: input.quantity ?? null, unit: input.unit ?? null } : parseInput(input.text);
    const name = cleanItemName(parsed.name);
    const quantity = cleanQuantity(parsed.quantity);
    const unit = cleanUnit(parsed.unit);
    const note = cleanNote(input.note);
    if (input.category !== undefined && (typeof input.category !== 'string' || input.category.length > 32)) throw new InputError('categorie-ongeldig');
    if (!opts?.force) {
      const dup = findDuplicate(c.state, name);
      if (dup) return { result: { kind: 'duplicate', existingItemId: dup }, committed: Promise.resolve() };
    }
    const now = this.now();
    const id = newItemId(this.deps.random);
    const category = input.category ?? categorize(name, this.cache.prefs);
    const delta = createItemDelta(id, { name, quantity, unit, note, category, addedMs: now }, this.hlc.now(now));
    return { result: { kind: 'added', itemId: id }, committed: this.local(listId, delta) };
  }

  increaseQuantity(listId: string, itemId: string, by?: number): Pending<void> {
    const it = this.item(listId, itemId);
    const q = cleanQuantity(increasedQuantity(regValue<number | null>(it, 'q') ?? null, by));
    return { result: undefined, committed: this.local(listId, editItemDelta(it, { q }, this.hlc, this.now())) };
  }

  updateItem(listId: string, itemId: string, patch: ItemPatch): Pending<void> {
    const it = this.item(listId, itemId);
    const p: Partial<Record<ItemField, unknown>> = {};
    if (patch.name !== undefined) p.n = cleanItemName(patch.name);
    if (patch.quantity !== undefined) p.q = cleanQuantity(patch.quantity);
    if (patch.unit !== undefined) p.u = cleanUnit(patch.unit);
    if (patch.note !== undefined) p.o = cleanNote(patch.note);
    if (patch.checked !== undefined) p.x = !!patch.checked;
    let extra: ((tx: SqlTx) => Promise<void>) | undefined;
    if (patch.category !== undefined) {
      if (!isCategoryId(patch.category)) throw new InputError('categorie-ongeldig');
      p.k = patch.category;
      // F-09: de keuze wordt onthouden voor dit product op dit apparaat.
      const norm = normalizeName((p.n as string | undefined) ?? regValue<string>(it, 'n') ?? '');
      const cat = patch.category;
      const ms = this.now();
      this.cache.prefs.set(norm, cat);
      extra = (tx) => dao.putCategoryPref(tx, norm, cat, ms);
    }
    if (Object.keys(p).length === 0) return { result: undefined, committed: Promise.resolve() };
    return { result: undefined, committed: this.local(listId, editItemDelta(it, p, this.hlc, this.now()), extra) };
  }

  toggleChecked(listId: string, itemId: string): Pending<void> {
    const it = this.item(listId, itemId);
    return { result: undefined, committed: this.local(listId, editItemDelta(it, { x: regValue<boolean>(it, 'x') !== true }, this.hlc, this.now())) };
  }

  private newUndoToken(listId: string, itemIds: string[]): UndoToken {
    const token: UndoToken = { id: toHex(this.deps.random.bytes(8)), listId, itemIds, expiresAtMs: this.now() + this.config.undoWindowMs };
    this.undoTokens.set(token.id, { token });
    return token;
  }

  deleteItem(listId: string, itemId: string): Pending<UndoToken> {
    const it = this.item(listId, itemId);
    const token = this.newUndoToken(listId, [itemId]);
    return { result: token, committed: this.local(listId, deleteItemDelta(it, this.hlc, this.now())) };
  }

  clearChecked(listId: string): Pending<UndoToken> {
    const c = this.cache.require(listId);
    const now = this.now();
    const dels: ItemState[] = [];
    for (const it of c.state.items.values()) {
      if (isItemDeleted(it) || it.regs.n === undefined || regValue<boolean>(it, 'x') !== true) continue;
      const d = deleteItemDelta(it, this.hlc, now).items.get(it.id)!;
      dels.push(d);
    }
    const token = this.newUndoToken(listId, dels.map((d) => d.id));
    if (dels.length === 0) return { result: token, committed: Promise.resolve() };
    return { result: token, committed: this.local(listId, deltaOf(dels)) };
  }

  undo(t: UndoToken): Pending<void> {
    const known = this.undoTokens.get(t.id);
    if (!known || this.now() > known.token.expiresAtMs) throw new CommandError('undo-verlopen');
    this.undoTokens.delete(t.id);
    const c = this.cache.require(t.listId);
    const now = this.now();
    const restores: ItemState[] = [];
    for (const id of t.itemIds) {
      const it = c.state.items.get(id);
      if (it) restores.push(restoreItemDelta(it, this.hlc, now).items.get(id)!);
    }
    if (restores.length === 0) return { result: undefined, committed: Promise.resolve() };
    return { result: undefined, committed: this.local(t.listId, deltaOf(restores)) };
  }

  async deleteList(id: string): Promise<void> {
    const c = this.cache.require(id);
    await this.local(id, deleteListDelta(c.state, this.hlc, this.now()));
    const row = this.cache.get(id)?.row;
    if (!row?.shared) await this.maybeFinalizeDeletion(id);
    else await this.engine?.flushNow(id);
  }

  // ------------------------------------------------------------------ delen, koppelen, verlaten (§7)

  async share(listId: string): Promise<ShareInfo> {
    const c = this.cache.require(listId);
    if (!c.row.shared) {
      const secret = this.deps.random.bytes(32);
      const keys = deriveListKeys(secret);
      await this.ensureTransport();
      const identity = this.newIdentity();
      await this.deps.keys.set(keyNames.secret(listId), toHex(secret));
      await this.deps.keys.set(keyNames.nostr(listId), toHex(identity.secret));
      await this.queue.enqueue(listId, null, async (tx) => {
        await dao.setListShared(tx, listId, { shared: true, listTag: keys.listTag, nostrPubkey: identity.id || null });
        if (identity.id) await dao.upsertMember(tx, listId, identity.id, this.now());
      });
      if (identity.id) this.crypto.set(listId, { secret, listTag: keys.listTag, encKey: keys.encKey, identity });
      await this.reloadList(listId);
      this.changes.emit([listId]);
      const eng = await this.ensureEngine();
      if (eng) {
        await eng.start();
        await eng.listsChanged();
        await eng.flushNow(listId);
      }
    }
    return this.shareInfo(listId);
  }

  async shareInfo(listId: string): Promise<ShareInfo> {
    const cr = this.crypto.get(listId);
    let secret = cr?.secret;
    if (!secret) {
      const hex = await this.deps.keys.get(keyNames.secret(listId));
      if (!hex) throw new CommandError('niet-gedeeld');
      secret = fromHex(hex);
    }
    const relays = await this.repo.read((r) => dao.loadRelays(r));
    const defaults = new Set(this.config.defaultRelays);
    const custom = relays.map((x) => x.url);
    const differs = custom.length !== defaults.size || custom.some((u) => !defaults.has(u));
    const payload: SharePayload = { secret, relayHints: differs ? custom.slice(0, 8) : [] };
    const acks = await this.repo.read((r) => r.get<{ n: number }>('SELECT COUNT(*) AS n FROM relay_acks WHERE list_id=?', [listId]));
    return { link: toLink(payload), code: toTextCode(payload), text: shareText(payload, this.strings.shareWarning), ready: (acks?.n ?? 0) > 0 };
  }

  private ensureTransport(): Promise<Transport | null> {
    return this.serialLifecycle(() => this.ensureTransportUnlocked());
  }

  private async ensureTransportUnlocked(): Promise<Transport | null> {
    if (this.transportInstance || !this.deps.transport) return this.transportInstance;
    const relays = (await this.repo.read((r) => dao.loadRelays(r))).map((x) => x.url);
    this.transportInstance = this.deps.transport(relays);
    return this.transportInstance;
  }

  /**
   * Nieuwe Nostr-identiteit uit `Random` (E-11), gecontroleerd met identityFromSecret. Zonder transport (geen sync)
   * is de publieke sleutel nog onbekend: dan alleen het geheim bewaren; `id` blijft leeg tot de transport er is.
   * Nooit het geheim als publieke sleutel gebruiken (NF-04).
   */
  private newIdentity(): Identity {
    const t = this.transportInstance;
    for (let i = 0; i < 100; i++) {
      const secret = this.deps.random.bytes(32);
      if (!t) return { id: '', secret };
      const id = t.identityFromSecret(secret);
      if (id) return id;
    }
    throw new Error('identiteit');
  }

  async join(text: string): Promise<JoinResult> {
    let payload: SharePayload;
    try {
      payload = parseShareText(text);
    } catch (e) {
      if (e instanceof ShareCodeParseError) return { kind: 'error', code: e.code };
      return { kind: 'error', code: 'beschadigd' };
    }
    const keys = deriveListKeys(payload.secret);
    const existing = await this.repo.read((r) => dao.getListByTag(r, keys.listTag));
    if (existing) return { kind: 'already-present', listId: existing.id };
    await this.ensureTransport();
    const listId = newListId(this.deps.random);
    const identity = this.newIdentity();
    await this.deps.keys.set(keyNames.secret(listId), toHex(payload.secret));
    await this.deps.keys.set(keyNames.nostr(listId), toHex(identity.secret));
    const position = Math.max(-1, ...[...this.cache.lists.values()].map((c) => c.row.position)) + 1;
    // Relay-hints: alleen wss:// (review bevinding 8); nieuwe hints bereiken de transport meteen (bevinding 4).
    const known = new Set((await this.repo.read((r) => dao.loadRelays(r))).map((x) => x.url));
    const hints = payload.relayHints.filter((u) => this.relayAllowed(u) && !known.has(u));
    await this.queue.enqueue(listId, null, async (tx) => {
      await dao.insertList(tx, { id: listId, regs: {}, position, shared: true, listTag: keys.listTag, nostrPubkey: identity.id || null, joinedPending: true });
      if (identity.id) await dao.upsertMember(tx, listId, identity.id, this.now());
      for (const url of hints) await dao.addRelay(tx, url, 'hint');
    });
    if (identity.id) this.crypto.set(listId, { secret: payload.secret, listTag: keys.listTag, encKey: keys.encKey, identity });
    await this.reloadList(listId);
    this.changes.emit([listId]);
    if (hints.length > 0) await this.rebuildTransport();
    const eng = await this.ensureEngine();
    if (eng) {
      await eng.start();
      await eng.listsChanged();
    }
    return { kind: 'joined', listId };
  }

  async leave(listId: string, keepCopy: boolean): Promise<void> {
    this.cache.require(listId);
    // Eerst de sleutels, dan de database (§7): nooit verweesde sleutels.
    await this.deps.keys.delete(keyNames.secret(listId));
    await this.deps.keys.delete(keyNames.nostr(listId));
    this.crypto.delete(listId);
    // Eerst de engine laten stoppen voor deze lijst (lopende flush afwachten), dan de database opruimen.
    await this.engine?.listsChanged();
    await this.queue.enqueue(listId, null, async (tx) => {
      if (keepCopy) await dao.clearSyncData(tx, listId);
      else await dao.deleteListCompletely(tx, listId);
    });
    if (keepCopy) await this.reloadList(listId);
    else this.cache.remove(listId);
    await this.engine?.listsChanged();
    this.changes.emit([listId]);
  }

  /** wss:// altijd; ws:// alleen met allowInsecureRelays (tests met een lokale relay; review bevinding 8). */
  private relayAllowed(url: string): boolean {
    // Verankerd aan begin én einde (review K-6): geen spaties of rommel achter de host.
    if (/^wss:\/\/[^\s/]+(\/\S*)?$/.test(url)) return true;
    return this.config.allowInsecureRelays && /^ws:\/\/[^\s/]+(\/\S*)?$/.test(url);
  }

  async setRelays(urls: string[]): Promise<void> {
    const clean = [...new Set(urls.map((u) => u.trim()).filter(Boolean))];
    if (clean.length === 0 || clean.some((u) => !this.relayAllowed(u))) throw new CommandError('relay-ongeldig');
    const before = (await this.repo.read((r) => dao.loadRelays(r))).map((x) => x.url);
    await this.queue.enqueue(null, null, (tx) => dao.replaceRelays(tx, clean.map((url) => ({ url, source: 'user' }))));
    if (before.join('\n') !== clean.join('\n')) await this.rebuildTransport();
  }

  /**
   * Bouwt de transport opnieuw op met de huidige relayset (review bevinding 4): de oude engine en transport sluiten,
   * daarna een nieuwe engine starten. Sleutels en identiteiten blijven geldig; de eigen-staatcontrole na EOSE vult
   * de nieuwe relays.
   */
  private rebuildTransport(): Promise<void> {
    return this.serialLifecycle(async () => {
      if (!this.transportInstance && !this.engine) return;
      const old = this.engine;
      this.engine = null;
      old?.shutdown();
      this.transportInstance?.close();
      this.transportInstance = null;
      if (this.closed) return;
      const eng = await this.ensureEngineUnlocked();
      await eng?.start();
    });
  }


  /** Afronden van een lijst met D (§7 stap 3): eerst sleutels, dan één transactie, dan engine.listsChanged. */
  private async maybeFinalizeDeletion(listId: string, rowIn?: dao.ListRow): Promise<void> {
    const row = rowIn ?? (await this.repo.read((r) => dao.getList(r, listId)));
    if (!row || !isListDeleted(row)) return;
    if (row.shared) {
      const listLevelPending = await this.repo.read((r) =>
        r.get<{ n: number }>('SELECT COUNT(*) AS n FROM pending_changes WHERE list_id=? AND item_id IS NULL', [listId]),
      );
      const acked = await this.repo.read((r) => r.get<{ n: number }>('SELECT COUNT(*) AS n FROM relay_acks WHERE list_id=?', [listId]));
      if ((listLevelPending?.n ?? 0) > 0 || (acked?.n ?? 0) === 0) return;
    }
    await this.deps.keys.delete(keyNames.secret(listId));
    await this.deps.keys.delete(keyNames.nostr(listId));
    this.crypto.delete(listId);
    await this.queue.enqueue(null, null, (tx) => dao.deleteListCompletely(tx, listId));
    this.cache.remove(listId);
    await this.engine?.listsChanged();
    this.changes.emit([listId]);
  }

  // ------------------------------------------------------------------ SyncHost (§6)

  sharedLists(): SyncListInfo[] {
    const out: SyncListInfo[] = [];
    for (const c of this.cache.lists.values()) {
      if (!c.row.shared) continue;
      const cr = this.crypto.get(c.row.id);
      if (!cr) continue;
      out.push({ listId: c.row.id, listTag: cr.listTag, encKey: cr.encKey, identity: cr.identity, joinedPending: c.row.joinedPending });
    }
    return out;
  }

  futureSchema(listId: string): boolean {
    return !!this.cache.get(listId)?.row.futureSchema;
  }

  async readFlush(listId: string): Promise<FlushSnapshot | null> {
    return this.repo.read(async (r) => {
      const row = await dao.getList(r, listId);
      if (!row) return null;
      const items = (await dao.loadItems(r, listId)).get(listId) ?? [];
      const rows = await r.all<Record<string, unknown>>('SELECT * FROM shard_state WHERE list_id=?', [listId]);
      const shards = new Map<number, ShardRow>();
      for (const s of rows) shards.set(Number(s.shard), shardRowFromDb(s));
      return { state: listOf(row.regs, items), stateRev: row.stateRev, shardCount: row.shardCount, shards, shared: row.shared, joinedPending: row.joinedPending };
    });
  }

  async readShards(listId: string): Promise<{ shardCount: number; shards: Map<number, ShardRow> } | null> {
    return this.repo.read(async (r) => {
      const row = await dao.getList(r, listId);
      if (!row) return null;
      const rows = await r.all<Record<string, unknown>>('SELECT * FROM shard_state WHERE list_id=?', [listId]);
      const shards = new Map<number, ShardRow>();
      for (const s of rows) shards.set(Number(s.shard), shardRowFromDb(s));
      return { shardCount: row.shardCount, shards };
    });
  }

  async persistFlush(listId: string, writes: PersistShard[]): Promise<boolean> {
    return this.queue.enqueue(null, null, async (tx) => {
      // Lijst intussen verlaten (niet meer gedeeld): niets schrijven.
      const row = await dao.getList(tx, listId);
      if (!row?.shared) return true;
      // Eerst alle CAS-controles (B-2), pas daarna schrijven: bij een afwijking wordt er niets geschreven.
      const floors = new Map<number, number>();
      for (const w of writes) {
        const cur = await tx.get<{ floor_version: number }>('SELECT floor_version FROM shard_state WHERE list_id=? AND shard=?', [listId, w.shard]);
        const floor = cur?.floor_version ?? 0;
        if (floor !== w.floorRead) return false;
        floors.set(w.shard, floor);
      }
      for (const w of writes) {
        const floor = floors.get(w.shard)!;
        await tx.run(
          `INSERT INTO shard_state(list_id, shard, published_rev, published_hash, last_event_id, last_event_raw, last_version, last_clock_derived, floor_before, floor_version)
           VALUES (?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(list_id, shard) DO UPDATE SET published_rev=excluded.published_rev, published_hash=excluded.published_hash,
             last_event_id=excluded.last_event_id, last_event_raw=excluded.last_event_raw, last_version=excluded.last_version,
             last_clock_derived=excluded.last_clock_derived, floor_before=excluded.floor_before, floor_version=excluded.floor_version`,
          [listId, w.shard, w.publishedRev, w.publishedHash, w.lastEventId, w.lastEventRaw, w.lastVersion, w.lastClockDerived ? 1 : 0, floor, Math.max(floor, w.lastVersion)],
        );
      }
      return true;
    });
  }

  async recordAck(listId: string, shard: number, rev: number, endpoint: string, eventId: string, version: number): Promise<void> {
    const shardCount = this.cache.get(listId)?.row.shardCount ?? 1;
    await this.queue.enqueue(null, null, async (tx) => {
      const exists = await dao.getList(tx, listId);
      if (!exists) return;
      await tx.run('UPDATE shard_state SET acked_rev = MAX(acked_rev, ?) WHERE list_id=? AND shard=?', [rev, listId, shard]);
      await tx.run(
        'INSERT INTO relay_acks(list_id, shard, relay_url, event_id, version, acked_ms) VALUES (?,?,?,?,?,?) ON CONFLICT(list_id, shard, relay_url) DO UPDATE SET event_id=excluded.event_id, version=excluded.version, acked_ms=excluded.acked_ms',
        [listId, shard, endpoint, eventId, version, this.now()],
      );
      const rows = await dao.pendingRows(tx, listId);
      const sc = exists.shardCount || shardCount;
      for (const p of rows) {
        if (p.rev > rev) continue;
        if (p.item_id === null || shardOf(p.item_id, sc) === shard) await tx.run('DELETE FROM pending_changes WHERE seq=?', [p.seq]);
      }
    });
  }

  async rollbackFloor(listId: string, shard: number, expectFloor: number, newFloor?: number): Promise<boolean> {
    return this.queue.enqueue(null, null, async (tx) => {
      const cur = await tx.get<{ floor_version: number; floor_before: number }>('SELECT floor_version, floor_before FROM shard_state WHERE list_id=? AND shard=?', [listId, shard]);
      if (!cur || cur.floor_version !== expectFloor) return false;
      const target = Math.min(cur.floor_before, newFloor ?? cur.floor_before);
      // Het teruggerolde event is ingetrokken: nooit meer verzenden (review bevinding 1).
      await tx.run(
        'UPDATE shard_state SET floor_version=?, floor_before=?, published_hash=NULL, last_event_id=NULL, last_event_raw=NULL, last_version=0, last_clock_derived=0 WHERE list_id=? AND shard=?',
        [target, target, listId, shard],
      );
      return true;
    });
  }

  async growShards(listId: string, newCount: number): Promise<void> {
    await this.queue.enqueue(null, null, async (tx) => {
      await dao.setShardCount(tx, listId, newCount);
      await tx.run('UPDATE shard_state SET published_hash=NULL WHERE list_id=?', [listId]);
    });
    const c = this.cache.get(listId);
    if (c) c.row = { ...c.row, shardCount: newCount };
  }

  async getClockOffset(): Promise<number> {
    const v = await this.repo.read((r) => dao.getMeta(r, 'clock_offset_sec'));
    return v ? Number(v) : 0;
  }

  async setClockOffset(sec: number): Promise<void> {
    await this.queue.enqueue(null, null, (tx) => dao.setMeta(tx, 'clock_offset_sec', String(sec)));
  }

  async pendingCount(listId: string): Promise<number> {
    return this.repo.read((r) => dao.countPending(r, listId));
  }

  async members(listId: string): Promise<string[]> {
    return this.repo.read((r) => dao.loadMembers(r, listId));
  }

  async addMember(listId: string, pubkey: string): Promise<void> {
    await this.queue.enqueue(null, null, async (tx) => {
      if (await dao.getList(tx, listId)) await dao.upsertMember(tx, listId, pubkey, this.now());
    });
  }

  async mergeRemote(listId: string, delta: ListDelta): Promise<boolean> {
    if (!this.cache.get(listId)) return false;
    const changed = await this.queue.enqueue(listId, null, async (tx) => {
      if (!(await dao.getList(tx, listId))) return false;
      const ch = await this.mergeIntoDb(tx, listId, delta);
      if (ch) await dao.bumpStateRev(tx, listId);
      return ch;
    });
    if (changed) {
      this.cache.apply(listId, delta);
      const m = deltaMaxHlc(delta);
      if (m) this.hlc.observe(m, this.now());
      this.changes.emit([listId]);
      const c = this.cache.get(listId);
      if (c && isListDeleted(c.state)) {
        // Ontvanger van D: meteen afronden, zonder te herpubliceren (§7 stap 4).
        this.errors.emit({ code: 'lijst-verwijderd-door-ander', listId });
        await this.finalizeNow(listId);
      }
    }
    return changed;
  }

  private async finalizeNow(listId: string): Promise<void> {
    await this.deps.keys.delete(keyNames.secret(listId));
    await this.deps.keys.delete(keyNames.nostr(listId));
    this.crypto.delete(listId);
    await this.queue.enqueue(null, null, (tx) => dao.deleteListCompletely(tx, listId));
    this.cache.remove(listId);
    await this.engine?.listsChanged();
    this.changes.emit([listId]);
  }

  async storeFuture(listId: string, sender: string, dTag: string, raw: string): Promise<void> {
    await this.queue.enqueue(null, null, async (tx) => {
      if (!(await dao.getList(tx, listId))) return;
      await dao.putFutureEvent(tx, listId, sender, dTag, raw, this.now());
      await dao.setFutureSchema(tx, listId, true);
    });
    const c = this.cache.get(listId);
    if (c) c.row = { ...c.row, futureSchema: true };
  }

  async rotateIdentity(listId: string): Promise<Identity> {
    const identity = this.newIdentity();
    await this.deps.keys.set(keyNames.nostr(listId), toHex(identity.secret));
    await this.queue.enqueue(null, null, async (tx) => {
      // R-1: zonder transport is de pubkey nog onbekend (id leeg). Dan geen pubkey- of ledenrij schrijven; loadCrypto
      // legt ze vast zodra de transport er is. Wel de slotversies terugzetten.
      if (identity.id) {
        await dao.setNostrPubkey(tx, listId, identity.id);
        await dao.upsertMember(tx, listId, identity.id, this.now());
      }
      await tx.run(
        'UPDATE shard_state SET last_version=0, floor_version=0, floor_before=0, last_clock_derived=0, published_hash=NULL, last_event_id=NULL, last_event_raw=NULL WHERE list_id=?',
        [listId],
      );
    });
    const cr = this.crypto.get(listId);
    if (cr) this.crypto.set(listId, { ...cr, identity });
    this.log.warn('identity.rotated');
    return identity;
  }

  async completeJoin(listId: string): Promise<void> {
    await this.queue.enqueue(null, null, (tx) => dao.setJoinedPending(tx, listId, false));
    const c = this.cache.get(listId);
    if (c) {
      c.row = { ...c.row, joinedPending: false };
      c.view = null;
    }
    this.changes.emit([listId]);
  }

  async afterAck(listId: string): Promise<void> {
    const c = this.cache.get(listId);
    if (c && isListDeleted(c.state)) await this.maybeFinalizeDeletion(listId);
  }

  /** Voor tests: is het geheim van deze lijst bekend en gelijk? */
  hasSecret(listId: string, secret: Uint8Array): boolean {
    const cr = this.crypto.get(listId);
    return !!cr && bytesEqual(cr.secret, secret);
  }

  /** Voor tests: de lijststaat uit de cache. */
  stateOf(listId: string): ListState {
    return this.cache.get(listId)?.state ?? emptyList();
  }

  listTagOf(listId: string): string | null {
    return this.crypto.get(listId)?.listTag ?? this.cache.get(listId)?.row.listTag ?? null;
  }
}

function shardRowFromDb(s: Record<string, unknown>): ShardRow {
  return {
    shard: Number(s.shard),
    publishedRev: Number(s.published_rev),
    publishedHash: (s.published_hash as string | null) ?? null,
    ackedRev: Number(s.acked_rev),
    lastEventId: (s.last_event_id as string | null) ?? null,
    lastEventRaw: (s.last_event_raw as string | null) ?? null,
    lastVersion: Number(s.last_version),
    lastClockDerived: Number(s.last_clock_derived) === 1,
    floorVersion: Number(s.floor_version),
    floorBefore: Number(s.floor_before),
  };
}
