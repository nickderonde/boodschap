// Wat de sync-engine van de service nodig heeft (opslag van sync-tabellen, merge via de schrijfwachtrij, sleutels).
// Puur een interface: de engine kent geen SQL en geen facade (S-19, §2).
import type { ListDelta, ListState } from '../core/types';
import type { Identity } from './Transport';

export interface SyncListInfo {
  listId: string;
  listTag: string;
  encKey: Uint8Array;
  identity: Identity;
  joinedPending: boolean;
}

export interface ShardRow {
  shard: number;
  publishedRev: number;
  publishedHash: string | null;
  ackedRev: number;
  lastEventId: string | null;
  lastEventRaw: string | null;
  lastVersion: number;
  lastClockDerived: boolean;
  floorVersion: number;
  floorBefore: number;
}

export interface FlushSnapshot {
  state: ListState;
  stateRev: number;
  shardCount: number;
  shards: Map<number, ShardRow>;
  shared: boolean;
  joinedPending: boolean;
}

export interface PersistShard {
  shard: number;
  floorRead: number;
  publishedRev: number;
  publishedHash: string;
  lastEventId: string;
  lastEventRaw: string;
  lastVersion: number;
  lastClockDerived: boolean;
}

export interface SyncHost {
  readonly deviceId: string;
  sharedLists(): SyncListInfo[];
  readFlush(listId: string): Promise<FlushSnapshot | null>;
  /** Alleen shard_count en de shard_state-rijen (voor de eigen-staatcontrole; goedkoper dan readFlush). */
  readShards(listId: string): Promise<{ shardCount: number; shards: Map<number, ShardRow> } | null>;
  /** Eén transactie met CAS op floor_version per slot (B-2). false = afwijking → flush opnieuw. */
  persistFlush(listId: string, writes: PersistShard[]): Promise<boolean>;
  recordAck(listId: string, shard: number, rev: number, endpoint: string, eventId: string, version: number): Promise<void>;
  /**
   * floor_version := newFloor (standaard floor_before) en published_hash := NULL, als floor_version nog `expectFloor`
   * is (B-1, CAS). `newFloor` < floor_before alleen bij terugrollen door een keten (DEVIATIONS D-03).
   */
  rollbackFloor(listId: string, shard: number, expectFloor: number, newFloor?: number): Promise<boolean>;
  growShards(listId: string, newCount: number): Promise<void>;
  getClockOffset(): Promise<number>;
  setClockOffset(sec: number): Promise<void>;
  pendingCount(listId: string): Promise<number>;
  members(listId: string): Promise<string[]>;
  addMember(listId: string, pubkey: string): Promise<void>;
  /** Merge via de schrijfwachtrij (§6.7 stap 7). Geeft true als de staat veranderde. */
  mergeRemote(listId: string, delta: ListDelta): Promise<boolean>;
  storeFuture(listId: string, sender: string, dTag: string, raw: string): Promise<void>;
  /** Nieuwe Nostr-identiteit (§6.8 stap 4): sleutel opslaan, shard_state-versies op 0, eigen pubkey in members. */
  rotateIdentity(listId: string): Promise<Identity>;
  /** Koppelen afgerond (F-14): joined_pending := 0. */
  completeJoin(listId: string): Promise<void>;
  /** Na een ack: lijst met D afronden (§7). */
  afterAck(listId: string): Promise<void>;
  futureSchema(listId: string): boolean;
}
