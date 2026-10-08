// Hybrid Logical Clock (§5.2). Vergelijking = stringvergelijking.
import type { Hlc } from './types';

export const HLC_RE = /^[0-9a-f]{32}$/;
const MAX_MS = 2 ** 48;
const MAX_C = 0xffff;
export const DRIFT_LIMIT_MS = 24 * 60 * 60 * 1000;

export interface HlcParts {
  ms: number;
  c: number;
  node: string;
}

export function isHlc(s: unknown): s is Hlc {
  if (typeof s !== 'string' || !HLC_RE.test(s)) return false;
  return parseInt(s.slice(0, 12), 16) < MAX_MS;
}

export function parseHlc(h: Hlc): HlcParts {
  return { ms: parseInt(h.slice(0, 12), 16), c: parseInt(h.slice(12, 16), 16), node: h.slice(16) };
}

export function formatHlc(ms: number, c: number, node: string): Hlc {
  if (!Number.isInteger(ms) || ms < 0 || ms >= MAX_MS) throw new Error('hlc.ms');
  if (!Number.isInteger(c) || c < 0 || c > MAX_C) throw new Error('hlc.c');
  if (!/^[0-9a-f]{16}$/.test(node)) throw new Error('hlc.node');
  return ms.toString(16).padStart(12, '0') + c.toString(16).padStart(4, '0') + node;
}

export function maxHlc(a: Hlc | null | undefined, b: Hlc | null | undefined): Hlc | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a > b ? a : b;
}

/** succ(h) = (h.ms, h.c+1, eigen node), met overloop naar (h.ms+1, 0). */
export function succ(h: Hlc, node: string): Hlc {
  const p = parseHlc(h);
  if (p.c >= MAX_C) return formatHlc(p.ms + 1, 0, node);
  return formatHlc(p.ms, p.c + 1, node);
}

/** De HLC-klokstaat van één apparaat. Bevat geen I/O; de wandklok wordt meegegeven. */
export class HlcClock {
  private l: number;
  private c: number;

  constructor(
    readonly node: string,
    state?: { l: number; c: number },
  ) {
    if (!/^[0-9a-f]{16}$/.test(node)) throw new Error('hlc.node');
    this.l = state?.l ?? 0;
    this.c = state?.c ?? 0;
  }

  /** Bij opstarten: max(opgeslagen, nu). */
  static restore(node: string, saved: { l: number; c: number } | null, pt: number): HlcClock {
    const clk = new HlcClock(node, saved ?? { l: 0, c: 0 });
    if (pt > clk.l) {
      clk.l = pt;
      clk.c = 0;
    }
    return clk;
  }

  state(): { l: number; c: number } {
    return { l: this.l, c: this.c };
  }

  now(pt: number): Hlc {
    if (pt > this.l) {
      this.l = pt;
      this.c = 0;
    } else if (this.c >= MAX_C) {
      this.l += 1;
      this.c = 0;
    } else {
      this.c += 1;
    }
    return formatHlc(this.l, this.c, this.node);
  }

  /** Neemt een remote HLC waar. Een HLC > nu + 24 u beweegt de klok niet (drift-bescherming, S-16). */
  observe(remote: Hlc, pt: number): boolean {
    const r = parseHlc(remote);
    if (r.ms > pt + DRIFT_LIMIT_MS) return false;
    if (r.ms > this.l || (r.ms === this.l && r.c > this.c)) {
      this.l = r.ms;
      this.c = r.c;
    }
    return true;
  }

  /** Schrijfregel: stamp = max(now(), succ(maxHlc(item))). Causaliteit per item, ongeacht de klok. */
  stamp(pt: number, seen: Hlc | null): Hlc {
    const n = this.now(pt);
    if (!seen) return n;
    const s = succ(seen, this.node);
    return s > n ? s : n;
  }
}
