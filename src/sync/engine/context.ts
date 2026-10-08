// Gedeelde context van de engine-onderdelen. Alleen interfaces; geen transport-implementaties (S-19).
import type { Config } from '../../config';
import type { Clock, Logger, Random, Timers } from '../../core/types';
import type { SyncHost, SyncListInfo } from '../SyncHost';
import type { Transport } from '../Transport';

export type FaultPoint = 'after-commit' | 'after-prepare' | 'after-persist' | 'after-send' | 'in-prepare';

/** Test-hooks voor crashpunten (§13.3). In productie afwezig. */
export interface Faults {
  at(point: FaultPoint, info: { listId: string }): void | Promise<void>;
}

export interface EngineContext {
  host: SyncHost;
  transport: Transport;
  clock: Clock;
  timers: Timers;
  random: Random;
  log: Logger;
  config: Config;
  faults?: Faults;
  /** Gedeelde lijsten die de engine kent (listId → info). */
  lists: Map<string, SyncListInfo>;
  /** listTag → listId. */
  tagIndex: Map<string, string>;
  state: { closed: boolean; paused: boolean; urgent: boolean };
  /** Meldt dat de statusinvoer van een lijst veranderde. */
  statusDirty(listId: string): void;
}

export function slotKey(listId: string, shard: number): string {
  return `${listId}#${shard}`;
}
