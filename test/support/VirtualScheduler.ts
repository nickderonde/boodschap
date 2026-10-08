// Virtuele tijd: Clock + Timers voor de hub-tests (§13.3). runUntilQuiet() laat de tijd lopen tot er geen timers
// meer zijn, en maakt tussen twee timerstappen de microtasks leeg (E-21).
import type { Clock, Timers } from '../../src/core/types';

interface Entry {
  id: number;
  due: number;
  fn: () => void;
  owner: string;
}

export async function drainMicrotasks(rounds = 3): Promise<void> {
  for (let i = 0; i < rounds; i++) await new Promise<void>((r) => setImmediate(r));
}

export class VirtualScheduler {
  private t: number;
  private seq = 0;
  private readonly queue = new Map<number, Entry>();
  steps = 0;

  constructor(startMs = 1_759_740_000_000) {
    this.t = startMs;
  }

  now(): number {
    return this.t;
  }

  clock(offsetMs = 0): Clock & { offsetMs: number } {
    const self = this;
    return {
      offsetMs,
      nowMs() {
        return self.t + this.offsetMs;
      },
    };
  }

  /** Timers van één eigenaar (apparaat); `clearOwner` wist ze allemaal (kill). */
  timers(owner = 'default'): Timers {
    return {
      setTimeout: (fn, ms) => {
        const id = ++this.seq;
        this.queue.set(id, { id, due: this.t + Math.max(0, ms), fn, owner });
        return id;
      },
      clearTimeout: (h) => {
        this.queue.delete(h as number);
      },
    };
  }

  clearOwner(owner: string): void {
    for (const [id, e] of this.queue) if (e.owner === owner) this.queue.delete(id);
  }

  pending(owner?: string): number {
    let n = 0;
    for (const e of this.queue.values()) if (!owner || e.owner === owner) n++;
    return n;
  }

  private next(): Entry | undefined {
    let best: Entry | undefined;
    for (const e of this.queue.values()) if (!best || e.due < best.due || (e.due === best.due && e.id < best.id)) best = e;
    return best;
  }

  /** Laat de virtuele tijd `ms` lopen en voert alle timers in dat venster uit. */
  async advance(ms: number): Promise<void> {
    const end = this.t + ms;
    await drainMicrotasks();
    for (;;) {
      const e = this.next();
      if (!e || e.due > end) break;
      this.queue.delete(e.id);
      this.t = Math.max(this.t, e.due);
      this.steps++;
      try {
        e.fn();
      } catch {
        // een timer van een gedood apparaat mag gooien
      }
      await drainMicrotasks();
    }
    this.t = end;
    await drainMicrotasks();
  }

  /** Loopt tot er geen timers meer zijn (of maxMs virtuele tijd verstreken is). */
  async runUntilQuiet(maxMs = 10 * 60_000): Promise<void> {
    const end = this.t + maxMs;
    await drainMicrotasks();
    for (;;) {
      const e = this.next();
      if (!e || e.due > end) break;
      this.queue.delete(e.id);
      this.t = Math.max(this.t, e.due);
      this.steps++;
      try {
        e.fn();
      } catch {
        // negeren
      }
      await drainMicrotasks();
    }
    await drainMicrotasks();
  }
}

/** Eenvoudige klok voor tests zonder scheduler. */
export class FakeClock implements Clock {
  constructor(public ms = 1_759_740_000_000) {}
  nowMs(): number {
    return this.ms;
  }
  advance(ms: number): void {
    this.ms += ms;
  }
}

/** Echte timers (WS-tests met productiewaarden). Alleen in test/. */
export const realTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};
