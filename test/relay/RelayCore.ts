// Pure NIP-01-logica voor de test-relay (§13.2): opslag, filters, vervangbare events (30000–39999 op
// (pubkey, kind, d): hogere created_at wint, bij gelijkspel het laagste ID), handtekeningcontrole, kind-5 voor dezelfde pubkey.
import { verifyEvent } from 'nostr-tools/pure';

export interface NEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export interface Filter {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  since?: number;
  until?: number;
  limit?: number;
  [tag: `#${string}`]: string[] | undefined;
}

export interface CoreOptions {
  nowSec(): number;
  maxEventBytes: number;
  futureToleranceSec: number;
  pastToleranceSec: number;
  refuse: string | null;
  rateLimitEvery: number;
  verifySignatures: boolean;
}

export type Verdict = { ok: boolean; message: string; stored?: NEvent } | null;

export class RelayCore {
  readonly events = new Map<string, NEvent>();
  private readonly replaceable = new Map<string, string>();
  private received = 0;

  constructor(readonly opts: CoreOptions) {}

  private dTag(ev: NEvent): string {
    return ev.tags.find((t) => t[0] === 'd')?.[1] ?? '';
  }

  /** Beslist over een binnenkomend event. null = geen antwoord (stil laten vallen gebeurt in de WS-laag). */
  handleEvent(ev: NEvent, rawBytes: number): Verdict {
    this.received++;
    const o = this.opts;
    if (!ev || typeof ev.id !== 'string') return { ok: false, message: 'invalid: malformed event' };
    if (rawBytes > o.maxEventBytes) return { ok: false, message: `invalid: event too large: ${rawBytes}` };
    if (o.verifySignatures && !verifyEvent(ev)) return { ok: false, message: 'invalid: bad signature' };
    if (o.refuse) return { ok: false, message: `${o.refuse} refused by test relay` };
    if (o.rateLimitEvery > 0 && this.received % o.rateLimitEvery === 0) return { ok: false, message: 'rate-limited: slow down' };
    const now = o.nowSec();
    if (ev.created_at > now + o.futureToleranceSec) return { ok: false, message: 'invalid: created_at too late' };
    if (ev.created_at < now - o.pastToleranceSec) return { ok: false, message: 'invalid: created_at too early' };
    if (this.events.has(ev.id)) return { ok: true, message: 'duplicate: already have this event' };
    if (ev.kind === 5) {
      for (const t of ev.tags) {
        if (t[0] !== 'e') continue;
        const target = this.events.get(t[1]);
        if (target && target.pubkey === ev.pubkey) this.remove(target);
      }
      this.events.set(ev.id, ev);
      return { ok: true, message: '', stored: ev };
    }
    if (ev.kind >= 30000 && ev.kind < 40000) {
      const key = `${ev.pubkey}|${ev.kind}|${this.dTag(ev)}`;
      const curId = this.replaceable.get(key);
      const cur = curId ? this.events.get(curId) : undefined;
      if (cur && (cur.created_at > ev.created_at || (cur.created_at === ev.created_at && cur.id < ev.id))) {
        return { ok: true, message: 'duplicate: have a newer event' };
      }
      if (cur) this.events.delete(cur.id);
      this.replaceable.set(key, ev.id);
    }
    this.events.set(ev.id, ev);
    return { ok: true, message: '', stored: ev };
  }

  private remove(ev: NEvent): void {
    this.events.delete(ev.id);
    const key = `${ev.pubkey}|${ev.kind}|${this.dTag(ev)}`;
    if (this.replaceable.get(key) === ev.id) this.replaceable.delete(key);
  }

  /**
   * Zoals strfry (review CR-03 R-1): een filter met een ongeldige hex-waarde in `authors` of `ids` wordt geweigerd.
   * Geeft de foutmelding (voor CLOSED) of null.
   */
  static invalidFilter(f: Filter): string | null {
    const hex64 = /^[0-9a-f]{64}$/;
    for (const key of ['authors', 'ids'] as const) {
      const v = (f as Record<string, unknown>)[key];
      if (v === undefined) continue;
      if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !hex64.test(x))) return `invalid: ${key} must be 64 lowercase hex characters`;
    }
    return null;
  }

  static matches(f: Filter, ev: NEvent): boolean {
    if (f.ids && !f.ids.includes(ev.id)) return false;
    if (f.authors && !f.authors.includes(ev.pubkey)) return false;
    if (f.kinds && !f.kinds.includes(ev.kind)) return false;
    if (f.since !== undefined && ev.created_at < f.since) return false;
    if (f.until !== undefined && ev.created_at > f.until) return false;
    for (const k of Object.keys(f)) {
      if (!k.startsWith('#')) continue;
      const vals = f[k as `#${string}`];
      if (!vals) continue;
      const name = k.slice(1);
      if (!ev.tags.some((t) => t[0] === name && vals.includes(t[1]))) return false;
    }
    return true;
  }

  query(filters: Filter[]): NEvent[] {
    const out = new Map<string, NEvent>();
    for (const f of filters) {
      const hits = [...this.events.values()].filter((e) => RelayCore.matches(f, e)).sort((a, b) => b.created_at - a.created_at || (a.id < b.id ? -1 : 1));
      for (const e of hits.slice(0, Math.min(f.limit ?? 500, 500))) out.set(e.id, e);
    }
    return [...out.values()];
  }

  wipe(): void {
    this.events.clear();
    this.replaceable.clear();
  }
}
