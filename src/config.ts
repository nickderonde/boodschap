// Constanten (vensters, limieten, standaardrelays). Alles is per app-instantie te overschrijven (tests).

export interface Config {
  /** Venster voor lokale wijzigingen (S-21). */
  localWindowMs: number;
  /** Venster voor herpublicatie na ontvangst (S-21). */
  remoteWindowMs: number;
  /** Minimale tijd tussen twee flushes van dezelfde lijst (S-21). */
  minFlushGapMs: number;
  /** Time-out voor een OK op een publicatie (§6.10). */
  publishTimeoutMs: number;
  /** Retryschema na time-out/rate-limit, maximaal 5 retries (E-13). */
  retryDelaysMs: number[];
  /** Na een expliciete weigering (blocked:/restricted:/…) zelf opnieuw proberen (D-ET-05); laatste waarde herhaalt. */
  refusedRetryDelaysMs: number[];
  /** Maximaal aantal pogingen na een weigering per event per endpoint (D-ET-05). */
  refusedRetryMax: number;
  /** Time-out voor verbinden (§6.10). */
  connectTimeoutMs: number;
  /** Maximale backoff (S-09). */
  backoffMaxMs: number;
  /** Levensduur van een inFlight-regel (§6.6). */
  inFlightTtlMs: number;
  /** Maximaal wachten op open klokantwoorden (I-3). */
  clockWaitMaxMs: number;
  /** Na zoveel ms alleen weigeringen/time-outs → status `fout` (S-17). */
  failingAfterMs: number;
  /** Time-outs tellen mee voor `fout` (besluit PL, standaard aan). */
  timeoutsCountAsFailure: boolean;
  /** Koppelen: na zoveel ms het "Ophalen…" afsluiten (F-14 c). */
  joinTimeoutMs: number;
  /** Throttle van statusgebeurtenissen (§6.9). */
  statusThrottleMs: number;
  /** Ontwerpdoel per geserialiseerd event (S-15). */
  targetEventBytes: number;
  /** Ontvanger negeert events boven dit aantal tekens (S-14). */
  maxEventChars: number;
  /** Undo-venster (F-07). */
  undoWindowMs: number;
  /** Standaardrelays (A-01). */
  defaultRelays: string[];
  /** Pull-to-refresh: status `bezig` tot EOSE of deze time-out (UX-13). */
  syncNowTimeoutMs: number;
  /** Achtergrond: zo lang wachten op acks voordat sockets dichtgaan (§11). */
  backgroundAckWaitMs: number;
  /** Maximale duur van pause() bij naar de achtergrond gaan (review bevinding 15; iOS geeft ±5 s). */
  pauseBudgetMs: number;
  /** ws:// toestaan (alleen tests met een lokale relay; productie: alleen wss://, review bevinding 8). */
  allowInsecureRelays: boolean;
}

export const DEFAULT_CONFIG: Config = {
  localWindowMs: 1000,
  remoteWindowMs: 3000,
  minFlushGapMs: 1000,
  publishTimeoutMs: 8000,
  retryDelaysMs: [2000, 4000, 8000, 16000, 32000],
  refusedRetryDelaysMs: [30_000, 60_000, 120_000, 300_000],
  refusedRetryMax: 12,
  connectTimeoutMs: 10_000,
  backoffMaxMs: 60_000,
  inFlightTtlMs: 15 * 60_000,
  clockWaitMaxMs: 8000,
  failingAfterMs: 30_000,
  timeoutsCountAsFailure: true,
  joinTimeoutMs: 10_000,
  statusThrottleMs: 250,
  targetEventBytes: 49_152,
  maxEventChars: 100_000,
  undoWindowMs: 10_000,
  defaultRelays: ['wss://relay.damus.io', 'wss://relay.primal.net', 'wss://offchain.pub', 'wss://nostr.mom'],
  syncNowTimeoutMs: 5000,
  backgroundAckWaitMs: 2000,
  pauseBudgetMs: 3000,
  allowInsecureRelays: false,
};

export function makeConfig(over?: Partial<Config>): Config {
  return { ...DEFAULT_CONFIG, ...(over ?? {}) };
}
