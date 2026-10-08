// Transport-interface (§10, S-19). Geen Nostr-types; Nostr- en geheugentransport voldoen allebei.

export type EndpointId = string;

export type RejectReason = 'too-large' | 'clock-ahead' | 'clock-behind' | 'rate-limited' | 'refused' | 'other';

export type PublishOutcome =
  | { kind: 'accepted'; duplicate?: boolean }
  | { kind: 'timeout' }
  | { kind: 'not-connected' }
  | { kind: 'rejected'; reason: RejectReason };

export interface Identity {
  readonly id: string; // publiek
  readonly secret: Uint8Array;
}

export interface PreparedMessage {
  readonly id: string;
  readonly raw: string;
  readonly channel: string;
  readonly slot: number;
  readonly sender: string;
  readonly version: number;
}

export interface InboundMessage {
  endpoint: EndpointId;
  generation: number;
  id: string;
  channel: string;
  slot: number;
  sender: string;
  version: number;
  envelope: Uint8Array;
  /** Ruw bericht (voor future_events, S-20). */
  raw: string;
  verify(): boolean;
}

export type EndpointState = 'connecting' | 'open' | 'closed';

export interface Subscription {
  channel: string;
  knownSenders: string[];
}

export interface Transport {
  readonly endpoints: readonly EndpointId[];
  /** Max envelopgrootte in bytes. */
  readonly maxPayloadBytes: number;
  connect(): void;
  pause(): void;
  /** Backoff afbreken, nu (her)verbinden + opnieuw REQ. */
  kick(): void;
  /** Geeft een nieuwe generatie terug; altijd slots 0..15. */
  setSubscriptions(subs: Subscription[]): number;
  identityFromSecret(secret: Uint8Array): Identity | null;
  prepare(p: { channel: string; slot: number; identity: Identity; version: number; envelope: Uint8Array }): Promise<PreparedMessage>;
  /** Niet-open endpoint → uitkomst 'not-connected'. Geen wachtrij, geen retry. */
  send(m: PreparedMessage, to: readonly EndpointId[]): void;
  isOpen(ep: EndpointId): boolean;
  on(e: 'message', cb: (m: InboundMessage) => void): () => void;
  on(e: 'endOfStored', cb: (ep: EndpointId, generation: number) => void): () => void;
  on(e: 'endpoint', cb: (ep: EndpointId, s: EndpointState, firstAttempt: boolean) => void): () => void;
  on(e: 'outcome', cb: (ep: EndpointId, messageId: string, o: PublishOutcome) => void): () => void;
  /** Sluit alles definitief (shutdown). */
  close(): void;
}

export const SLOTS = 16;
