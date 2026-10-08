// Sync-status als pure functie (§6.9, S-17, UX-02).

export type SyncStatusKind = 'lokaal' | 'gesynchroniseerd' | 'bezig' | 'offline' | 'beperkt' | 'fout';

export interface SyncStatus {
  kind: SyncStatusKind;
  pending: number;
  relaysOpen: number;
  relaysTotal: number;
  /** "Ophalen…" na koppelen (F-14). */
  fetching: boolean;
  reason?: 'nieuwere-versie' | 'te-groot' | 'geweigerd' | 'geen-antwoord';
}

export interface StatusInput {
  shared: boolean;
  joinedPending: boolean;
  relaysTotal: number;
  relaysOpen: number;
  relaysConnectingFirstAttempt: boolean;
  pendingCount: number;
  initialFetchDone: boolean;
  inFlight: boolean;
  failingSinceMs: number | null;
  /** Soort falen: expliciete weigering of alleen time-outs (review bevinding 13). */
  failingReason?: 'geweigerd' | 'geen-antwoord';
  futureSchema: boolean;
  tooLarge: boolean;
  nowMs: number;
  failingAfterMs?: number;
}

export function deriveSyncStatus(i: StatusInput): SyncStatus {
  const base = { pending: i.pendingCount, relaysOpen: i.relaysOpen, relaysTotal: i.relaysTotal, fetching: i.joinedPending };
  if (!i.shared) return { kind: 'lokaal', ...base, fetching: false };
  if (i.relaysOpen === 0 && !i.relaysConnectingFirstAttempt) return { kind: 'offline', ...base };
  const failAfter = i.failingAfterMs ?? 30_000;
  if (i.futureSchema) return { kind: 'fout', ...base, reason: 'nieuwere-versie' };
  if (i.tooLarge) return { kind: 'fout', ...base, reason: 'te-groot' };
  if (i.pendingCount > 0 && i.relaysOpen >= 1 && i.failingSinceMs !== null && i.nowMs - i.failingSinceMs >= failAfter) {
    return { kind: 'fout', ...base, reason: i.failingReason ?? 'geweigerd' };
  }
  if (i.joinedPending || i.relaysOpen === 0 || !i.initialFetchDone || i.inFlight || i.pendingCount > 0) return { kind: 'bezig', ...base };
  if (i.relaysOpen < i.relaysTotal) return { kind: 'beperkt', ...base };
  return { kind: 'gesynchroniseerd', ...base };
}

export function sameStatus(a: SyncStatus | undefined, b: SyncStatus): boolean {
  return !!a && a.kind === b.kind && a.pending === b.pending && a.relaysOpen === b.relaysOpen && a.relaysTotal === b.relaysTotal && a.fetching === b.fetching && a.reason === b.reason;
}
