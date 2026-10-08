// Nostr-transport (§6.3, §6.7, §6.10): één abonnement per relay met generaties, kind 30078, geen wachtrij en geen
// retry (dat doet de engine, E-5). Implementeert dezelfde Transport-interface als de geheugentransport (S-19).
import type { Clock, Logger, Timers } from '../../../core/types';
import { nullLogger } from '../../../core/types';
import type {
  EndpointId,
  EndpointState,
  Identity,
  InboundMessage,
  PreparedMessage,
  PublishOutcome,
  Subscription,
  Transport,
} from '../../Transport';
import { SLOTS } from '../../Transport';
import { buildEvent, parseEvent, publicKeyOf, verify, KIND } from './event';
import { RelayConnection, type ConnState, type WebSocketFactory } from './RelayConnection';

export interface NostrTransportOptions {
  relays: string[];
  wsFactory: WebSocketFactory;
  clock: Clock;
  timers: Timers;
  log?: Logger;
  publishTimeoutMs?: number;
  connectTimeoutMs?: number;
  backoffMaxMs?: number;
  /** Max envelopgrootte; standaard afgeleid van 48 KiB per event (§6.5). */
  maxPayloadBytes?: number;
}

export const NOSTR_MAX_PAYLOAD_BYTES = Math.floor(((49152 - 450) * 3) / 4) - 41;

type Handler = (...a: never[]) => void;

export interface NostrTransport extends Transport {
  /** KillSwitch-alias voor close(). */
  kill(): void;
  connection(url: string): RelayConnection | undefined;
}

export function createNostrTransport(o: NostrTransportOptions): NostrTransport {
  const log = o.log ?? nullLogger;
  const handlers = new Map<string, Set<Handler>>();
  let dead = false;
  // Alle eigen timers bijhouden, zodat close() ze wist (review bevinding 6).
  const ownTimers = new Set<unknown>();
  const later = (fn: () => void, ms: number) => {
    const h = o.timers.setTimeout(() => {
      ownTimers.delete(h);
      if (!dead) fn();
    }, ms);
    ownTimers.add(h);
  };
  const emit = (e: string, ...a: unknown[]) => {
    if (dead) return;
    for (const h of [...(handlers.get(e) ?? [])]) (h as (...x: unknown[]) => void)(...a);
  };
  let generation = 0;
  let subs: Subscription[] = [];
  let lcg = 0x2545f491;
  const jitter = () => {
    lcg = (Math.imul(lcg, 1103515245) + 12345) >>> 0;
    return lcg / 2 ** 32;
  };
  const toEndpointState = (s: ConnState): EndpointState => (s === 'open' ? 'open' : s === 'connecting' ? 'connecting' : 'closed');

  const conns = new Map<string, RelayConnection>();
  for (const url of [...new Set(o.relays)]) {
    const conn: RelayConnection = new RelayConnection({
      url,
      wsFactory: o.wsFactory,
      timers: o.timers,
      log,
      connectTimeoutMs: o.connectTimeoutMs ?? 10_000,
      publishTimeoutMs: o.publishTimeoutMs ?? 8000,
      backoffMaxMs: o.backoffMaxMs ?? 60_000,
      jitter,
      events: {
        state: (s, first) => emit('endpoint', url, toEndpointState(s), s === 'connecting' && first),
        message: (subId, raw, rawLength) => {
          const g = genOf(subId);
          if (g === null) return;
          const parsed = parseEvent(raw);
          if (!parsed) {
            log.warn('recv.shape');
            return;
          }
          const { ev, channel, slot, envelope } = parsed;
          void rawLength;
          const rawText = JSON.stringify(ev);
          const m: InboundMessage = {
            endpoint: url,
            generation: g,
            id: ev.id,
            channel,
            slot,
            sender: ev.pubkey,
            version: ev.created_at,
            envelope,
            raw: rawText,
            verify: () => verify(ev),
          };
          emit('message', m);
        },
        eose: (subId) => {
          const g = genOf(subId);
          if (g !== null) emit('endOfStored', url, g);
        },
        outcome: (id, oc) => emit('outcome', url, id, oc),
        closedSub: (subId) => {
          // CLOSED: REQ opnieuw na een korte backoff (§6.10).
          const g = genOf(subId);
          if (g === null || g !== generation) return;
          later(() => {
            if (g === generation) conn.resubscribe();
          }, 5_000);
        },
      },
    });
    conns.set(url, conn);
  }

  function genOf(subId: string): number | null {
    const m = /^bs(\d+)$/.exec(subId);
    return m ? Number(m[1]) : null;
  }

  function filters(): unknown[] | null {
    return buildFilters(subs);
  }

  const t: NostrTransport = {
    endpoints: [...conns.keys()],
    maxPayloadBytes: o.maxPayloadBytes ?? NOSTR_MAX_PAYLOAD_BYTES,
    connect() {
      if (dead) return;
      for (const c of conns.values()) if (c.state === 'idle' || c.state === 'paused') c.connect(true);
    },
    pause() {
      for (const c of conns.values()) c.pause();
    },
    kick() {
      if (dead) return;
      for (const c of conns.values()) c.kick();
    },
    setSubscriptions(s) {
      subs = s;
      generation++;
      const f = filters();
      for (const c of conns.values()) c.subscribe(`bs${generation}`, f);
      return generation;
    },
    identityFromSecret(secret): Identity | null {
      const id = publicKeyOf(secret);
      return id ? { id, secret } : null;
    },
    async prepare(p) {
      const ev = buildEvent({ channel: p.channel, slot: p.slot, version: p.version, envelope: p.envelope, secret: p.identity.secret });
      const prepared: PreparedMessage = { id: ev.id, raw: JSON.stringify(ev), channel: p.channel, slot: p.slot, sender: ev.pubkey, version: ev.created_at };
      return prepared;
    },
    send(m, to) {
      if (dead) return;
      for (const ep of to) {
        const c = conns.get(ep);
        if (!c || !c.publish(m.id, m.raw)) {
          later(() => emit('outcome', ep, m.id, { kind: 'not-connected' } satisfies PublishOutcome), 0);
        }
      }
    },
    isOpen(ep) {
      return conns.get(ep)?.isOpen() ?? false;
    },
    on(e: string, cb: Handler) {
      let s = handlers.get(e);
      if (!s) {
        s = new Set();
        handlers.set(e, s);
      }
      s.add(cb);
      return () => s!.delete(cb);
    },
    close() {
      dead = true;
      for (const h of ownTimers) o.timers.clearTimeout(h);
      ownTimers.clear();
      for (const c of conns.values()) c.close();
    },
    kill() {
      t.close();
      handlers.clear();
    },
    connection: (url) => conns.get(url),
  } as NostrTransport;
  return t;
}

export type { EndpointId };

/** Een geldige Nostr-pubkey: 64 kleine hex-tekens (NIP-01). */
export const VALID_PUBKEY = /^[0-9a-f]{64}$/;

/**
 * REQ-filters voor de abonnementen (§6.4). Review CR-03 R-1: alleen geldige pubkeys in `authors`; strfry (alle vier de
 * standaardrelays) weigert een filter met een lege of ongeldige hex-waarde, en dan komt er niets binnen.
 */
export function buildFilters(subs: ReadonlyArray<{ channel: string; knownSenders: readonly string[] }>): unknown[] | null {
  if (subs.length === 0) return null;
  const dTags: string[] = [];
  const authors = new Set<string>();
  for (const s of subs) {
    for (let i = 0; i < SLOTS; i++) dTags.push(`${s.channel}:${i}`);
    for (const a of s.knownSenders) if (authors.size < 50 && VALID_PUBKEY.test(a)) authors.add(a);
  }
  const f: unknown[] = [{ kinds: [KIND], '#d': dTags }];
  if (authors.size > 0) f.push({ kinds: [KIND], '#d': dTags, authors: [...authors] });
  return f;
}
