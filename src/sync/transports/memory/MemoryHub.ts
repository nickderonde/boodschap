// Niet-Nostr brievenbus voor tests (§13.2): relays met slot-semantiek (channel, slot, sender) — de hoogste versie wint,
// bij gelijkspel het laagste ID — live fan-out, een virtuele relay-klok met toleranties en dezelfde foutknoppen als de
// WS-test-relay. Alles op geïnjecteerde (virtuele) tijd.
import type { Clock, Timers } from '../../../core/types';
import type { PublishOutcome } from '../../Transport';

export interface StoredMessage {
  id: string;
  raw: string;
  channel: string;
  slot: number;
  sender: string;
  version: number;
  envelopeB64: string;
  corrupt?: boolean;
}

export interface RelayFaults {
  down: boolean;
  latencyMs: number;
  silentDrop: boolean;
  maxBytes: number;
  futureToleranceSec: number;
  pastToleranceSec: number;
  clockOffsetMs: number;
  refuse: string | null;
  /** Elke n-de publicatie wordt met rate-limited geweigerd (0 = uit). */
  rateLimitEvery: number;
  duplicate: number;
  reorder: boolean;
  corruptSignature: boolean;
}

export interface HubConnection {
  readonly device: string;
  readonly relay: MemoryRelay;
  channels: Set<string>;
  generation: number;
  deliver(m: StoredMessage, generation: number): void;
  closed(): void;
}

export class MemoryRelay {
  readonly store = new Map<string, StoredMessage>();
  readonly conns = new Set<HubConnection>();
  readonly faults: RelayFaults = {
    down: false, latencyMs: 0, silentDrop: false, maxBytes: Infinity, futureToleranceSec: Infinity, pastToleranceSec: Infinity,
    clockOffsetMs: 0, refuse: null, rateLimitEvery: 0, duplicate: 1, reorder: false, corruptSignature: false,
  };
  published = 0;
  received = 0;

  constructor(
    readonly name: string,
    private readonly hub: MemoryHub,
  ) {}

  private key(m: { channel: string; slot: number; sender: string }): string {
    return `${m.channel}|${m.slot}|${m.sender}`;
  }

  setDown(down: boolean): void {
    this.faults.down = down;
    if (down) this.dropConnections();
  }

  dropConnections(): void {
    for (const c of [...this.conns]) {
      this.conns.delete(c);
      c.closed();
    }
  }

  wipe(): void {
    this.store.clear();
  }

  nowSec(): number {
    return Math.floor((this.hub.clock.nowMs() + this.faults.clockOffsetMs) / 1000);
  }

  /** Beslist synchroon over een publicatie; geeft null bij stil laten vallen. */
  publish(m: StoredMessage): PublishOutcome | null {
    this.received++;
    const f = this.faults;
    if (f.silentDrop) return null;
    if (m.raw.length > f.maxBytes) return { kind: 'rejected', reason: 'too-large' };
    if (f.refuse) return { kind: 'rejected', reason: 'refused' };
    if (f.rateLimitEvery > 0 && this.received % f.rateLimitEvery === 0) return { kind: 'rejected', reason: 'rate-limited' };
    const now = this.nowSec();
    if (m.version > now + f.futureToleranceSec) return { kind: 'rejected', reason: 'clock-ahead' };
    if (m.version < now - f.pastToleranceSec) return { kind: 'rejected', reason: 'clock-behind' };
    const k = this.key(m);
    const cur = this.store.get(k);
    if (cur && cur.id === m.id) return { kind: 'accepted', duplicate: true };
    if (cur && (cur.version > m.version || (cur.version === m.version && cur.id < m.id))) return { kind: 'accepted', duplicate: true };
    this.store.set(k, m);
    this.published++;
    for (const c of this.conns) if (c.channels.has(m.channel)) for (let i = 0; i < f.duplicate; i++) this.hub.later(f.latencyMs, () => c.deliver(m, c.generation));
    return { kind: 'accepted' };
  }

  query(channels: Set<string>): StoredMessage[] {
    const out = [...this.store.values()].filter((m) => channels.has(m.channel));
    if (this.faults.reorder) this.hub.shuffle(out);
    else out.sort((a, b) => b.version - a.version || (a.id < b.id ? -1 : 1));
    const dup: StoredMessage[] = [];
    for (const m of out) for (let i = 0; i < this.faults.duplicate; i++) dup.push(m);
    return dup;
  }

  all(): StoredMessage[] {
    return [...this.store.values()];
  }
}

export class MemoryHub {
  readonly relays = new Map<string, MemoryRelay>();
  private rnd: number;

  constructor(
    readonly clock: Clock,
    readonly timers: Timers,
    seed = 1,
  ) {
    this.rnd = seed >>> 0 || 1;
  }

  relay(name: string): MemoryRelay {
    let r = this.relays.get(name);
    if (!r) {
      r = new MemoryRelay(name, this);
      this.relays.set(name, r);
    }
    return r;
  }

  later(ms: number, fn: () => void): void {
    this.timers.setTimeout(fn, ms);
  }

  shuffle<T>(a: T[]): void {
    for (let i = a.length - 1; i > 0; i--) {
      this.rnd = (Math.imul(this.rnd, 1103515245) + 12345) >>> 0;
      const j = this.rnd % (i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
  }
}
