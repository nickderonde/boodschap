// DTO-typen van de facade (§10, E-18). Gedefinieerd door de Engineer in M2; toets door de Architect.
import type { CategoryId, ListView } from '../core/types';
import type { Suggestion } from '../core/suggest';
import type { SyncStatus } from '../sync/engine/status';

export type { ListView, Suggestion, SyncStatus };

/** Resultaat van een commando: `result` is synchroon bekend, `committed` lost op na COMMIT (S-02, UX-05). */
export interface Pending<T> {
  result: T;
  committed: Promise<void>;
}

export interface ListSummary {
  id: string;
  name: string;
  shared: boolean;
  total: number;
  checkedCount: number;
  position: number;
}

/** Invoer voor addItem. `text` wordt ontleed (F-12) tenzij quantity/unit expliciet zijn meegegeven. */
export interface AddInput {
  text: string;
  quantity?: number | null;
  unit?: string | null;
  note?: string | null;
  category?: CategoryId;
}

export type AddResult = { kind: 'added'; itemId: string } | { kind: 'duplicate'; existingItemId: string };

export interface ItemPatch {
  name?: string;
  quantity?: number | null;
  unit?: string | null;
  note?: string | null;
  category?: CategoryId;
  checked?: boolean;
}

export interface UndoToken {
  readonly id: string;
  readonly listId: string;
  readonly itemIds: readonly string[];
  readonly expiresAtMs: number;
}

export interface ShareInfo {
  link: string;
  code: string;
  text: string;
  /** "Klaar om te koppelen": ≥ 1 relay heeft een publicatie bevestigd (F-14). */
  ready: boolean;
}

export type JoinResult =
  | { kind: 'joined' | 'already-present'; listId: string }
  | { kind: 'error'; code: 'geen-code' | 'beschadigd' | 'controlesom' | 'nieuwere-versie' };

/** Alle foutcodes die de facade via onError meldt (UX-01: elke code heeft een tekst in strings.nl.ts). */
export type AppErrorCode = 'opslaan-mislukt' | 'lijst-verwijderd-door-ander';

export interface AppError {
  code: AppErrorCode;
  listId?: string;
}
