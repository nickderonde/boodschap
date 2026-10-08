// Geheugentransport (§13.2): voldoet aan dezelfde Transport-interface en contracttests als de Nostr-transport (S-19).
// Geen Schnorr (E-21): id = hex(sha256(raw)), verify() is waar, behalve met de foutknop corruptSignature.
import { sha256 } from '@noble/hashes/sha2.js';
import { fromBase64, toBase64, toHex, utf8 } from '../../../core/bytes';
import type { Clock, Timers } from '../../../core/types';
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
import type { HubConnection, MemoryHub, MemoryRelay, StoredMessage } from './MemoryHub';

const hex = toHex;
const b64 = toBase64;
const unb64 = fromBase64;
const enc = { encode: (s: string) => utf8(s) };

export interface MemoryTransportOptions {
  endpoints: string[];
  clock: Clock;
  timers: Timers;
  device?: string;
  publishTimeoutMs?: number;
  connectLatencyMs?: number;
  backoffMaxMs?: number;
  maxPayloadBytes?: number;
}

type Handler = (...a: never[]) => void;

interface Conn extends HubConnection {
  state: EndpointState;
  attempt: number;
  backoffTimer: unknown;
}

export interface MemoryTransport extends Transport {
  setOnline(online: boolean): void;
  /** KillSwitch: ontkoppelt zonder callbacks; daarna doet de instantie niets meer. */
  kill(): void;
  readonly sent: PreparedMessage[];
}

export function createMemoryTransport(hub: MemoryHub, opts: MemoryTransportOptions): MemoryTransport {
  const handlers = new Map<string, Set<Handler>>();
  const emit = (e: string, ...a: unknown[]) => {
    if (dead) return;
    for (const h of [...(handlers.get(e) ?? [])]) (h as (...x: unknown[]) => void)(...a);
  };
  const timers = opts.timers;
  const publishTimeout = opts.publishTimeoutMs ?? 8000;
  const latency = opts.connectLatencyMs ?? 1;
  const backoffMax = opts.backoffMaxMs ?? 60_000;
  const conns = new Map<EndpointId, Conn>();
  let subs: Subscription[] = [];
  let generation = 0;
  let online = true;
  let paused = true;
  let dead = false;
  let firstAttempt = true;
  const sent: PreparedMessage[] = [];

  const channelSet = () => new Set(subs.map((s) => s.channel));

  const toInbound = (ep: EndpointId, m: StoredMessage, g: number): InboundMessage => ({
    endpoint: ep,
    generation: g,
    id: m.id,
    channel: m.channel,
    slot: m.slot,
    sender: m.sender,
    version: m.version,
    envelope: unb64(m.envelopeB64),
    raw: m.raw,
    verify: () => !m.corrupt && !hub.relay(ep).faults.corruptSignature,
  });

  function req(c: Conn): void {
    if (c.state !== 'open' || dead) return;
    const g = generation;
    c.channels = channelSet();
    c.generation = g;
    const r: MemoryRelay = c.relay;
    const msgs = r.query(c.channels);
    const lat = r.faults.latencyMs;
    timers.setTimeout(() => {
      if (dead || c.state !== 'open' || c.generation !== g) return;
      for (const m of msgs) emit('message', toInbound(c.relay.name, m, g));
      emit('endOfStored', c.relay.name, g);
    }, lat + latency);
  }

  function makeConn(ep: EndpointId): Conn {
    const relay = hub.relay(ep);
    const c: Conn = {
      device: opts.device ?? 'device',
      relay,
      channels: new Set(),
      generation: 0,
      state: 'closed',
      attempt: 0,
      backoffTimer: null,
      deliver: (m, g) => {
        if (dead || c.state !== 'open' || !c.channels.has(m.channel)) return;
        emit('message', toInbound(ep, m, g));
      },
      closed: () => {
        if (c.state === 'closed') return;
        c.state = 'closed';
        emit('endpoint', ep, 'closed', false);
        scheduleReconnect(c);
      },
    };
    return c;
  }

  function open(c: Conn, first: boolean): void {
    if (dead || paused) return;
    if (c.backoffTimer !== null) {
      timers.clearTimeout(c.backoffTimer);
      c.backoffTimer = null;
    }
    c.state = 'connecting';
    emit('endpoint', c.relay.name, 'connecting', first);
    timers.setTimeout(() => {
      if (dead || paused || c.state !== 'connecting') return;
      if (!online || c.relay.faults.down) {
        c.state = 'closed';
        emit('endpoint', c.relay.name, 'closed', false);
        scheduleReconnect(c);
        return;
      }
      c.state = 'open';
      c.attempt = 0;
      c.relay.conns.add(c);
      emit('endpoint', c.relay.name, 'open', false);
      req(c);
    }, latency);
  }

  function scheduleReconnect(c: Conn): void {
    c.relay.conns.delete(c);
    if (dead || paused || c.backoffTimer !== null) return;
    const delay = Math.min(backoffMax, 1000 * 2 ** c.attempt);
    c.attempt++;
    c.backoffTimer = timers.setTimeout(() => {
      c.backoffTimer = null;
      open(c, false);
    }, delay);
  }

  for (const ep of opts.endpoints) conns.set(ep, makeConn(ep));

  const t: MemoryTransport = {
    endpoints: [...opts.endpoints],
    maxPayloadBytes: opts.maxPayloadBytes ?? Math.floor(((49152 - 450) * 3) / 4) - 41,
    sent,
    connect() {
      if (dead) return;
      paused = false;
      for (const c of conns.values()) if (c.state === 'closed' && c.backoffTimer === null) open(c, firstAttempt);
      firstAttempt = false;
    },
    pause() {
      paused = true;
      firstAttempt = true;
      for (const c of conns.values()) {
        if (c.backoffTimer !== null) timers.clearTimeout(c.backoffTimer);
        c.backoffTimer = null;
        c.relay.conns.delete(c);
        if (c.state !== 'closed') {
          c.state = 'closed';
          emit('endpoint', c.relay.name, 'closed', false);
        }
      }
    },
    kick() {
      if (dead) return;
      paused = false;
      for (const c of conns.values()) {
        if (c.state === 'open') req(c);
        else if (c.state === 'closed') {
          c.attempt = 0;
          open(c, true);
        }
      }
    },
    setSubscriptions(s) {
      subs = s;
      generation++;
      for (const c of conns.values()) req(c);
      return generation;
    },
    identityFromSecret(secret): Identity | null {
      if (secret.length !== 32 || secret.every((b) => b === 0)) return null;
      return { id: hex(sha256(secret)), secret };
    },
    async prepare(p) {
      const body = JSON.stringify({ c: p.channel, s: p.slot, f: p.identity.id, v: p.version, e: b64(p.envelope) });
      const id = hex(sha256(enc.encode(body)));
      return { id, raw: body, channel: p.channel, slot: p.slot, sender: p.identity.id, version: p.version };
    },
    send(m, to) {
      if (dead) return;
      sent.push(m);
      for (const ep of to) {
        const c = conns.get(ep);
        if (!c || c.state !== 'open') {
          timers.setTimeout(() => emit('outcome', ep, m.id, { kind: 'not-connected' } satisfies PublishOutcome), 0);
          continue;
        }
        const r = c.relay;
        let answered = false;
        const timeout = timers.setTimeout(() => {
          if (!answered) {
            answered = true;
            emit('outcome', ep, m.id, { kind: 'timeout' } satisfies PublishOutcome);
          }
        }, publishTimeout);
        timers.setTimeout(() => {
          if (dead) return;
          if (c.state !== 'open') return; // verbinding weg: time-out volgt
          const parsed = JSON.parse(m.raw) as { e: string };
          const outcome = r.publish({ id: m.id, raw: m.raw, channel: m.channel, slot: m.slot, sender: m.sender, version: m.version, envelopeB64: parsed.e });
          if (!outcome) return;
          timers.setTimeout(() => {
            if (answered || dead) return;
            answered = true;
            timers.clearTimeout(timeout);
            emit('outcome', ep, m.id, outcome);
          }, r.faults.latencyMs);
        }, r.faults.latencyMs + latency);
      }
    },
    isOpen(ep) {
      return conns.get(ep)?.state === 'open';
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
      t.pause();
      dead = true;
    },
    setOnline(b) {
      online = b;
      if (!b) {
        for (const c of conns.values()) {
          c.relay.conns.delete(c);
          if (c.state !== 'closed') {
            c.state = 'closed';
            emit('endpoint', c.relay.name, 'closed', false);
            scheduleReconnect(c);
          }
        }
      }
    },
    kill() {
      dead = true;
      for (const c of conns.values()) {
        c.relay.conns.delete(c);
        if (c.backoffTimer !== null) timers.clearTimeout(c.backoffTimer);
      }
      handlers.clear();
    },
  } as MemoryTransport;
  return t;
}
