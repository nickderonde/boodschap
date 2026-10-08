// Afsluitregel van het koppelen (§7 stap 3, F-14, L-2): joined_pending := 0 bij de eerste van
// (a) van ≥ 1 afzender zijn alle delen 0..S−1 ontvangen; (b) alle open relays gaven EOSE voor de huidige generatie;
// (c) joinTimeoutMs verstreken.
import type { EndpointId } from '../Transport';
import type { EngineContext } from './context';

interface JoinState {
  senders: Map<string, { S: number; got: Set<number> }>;
  eose: Set<EndpointId>;
  generation: number;
  timer: unknown;
  done: boolean;
}

export class JoinTracker {
  private readonly joins = new Map<string, JoinState>();

  constructor(
    private readonly ctx: EngineContext,
    private readonly onComplete: (listId: string, reason: 'compleet' | 'eose' | 'timeout') => void,
  ) {}

  track(listId: string, generation: number): void {
    const existing = this.joins.get(listId);
    if (existing) {
      if (existing.generation !== generation) {
        existing.generation = generation;
        existing.eose.clear();
      }
      return;
    }
    const st: JoinState = { senders: new Map(), eose: new Set(), generation, timer: null, done: false };
    st.timer = this.ctx.timers.setTimeout(() => this.finish(listId, 'timeout'), this.ctx.config.joinTimeoutMs);
    this.joins.set(listId, st);
  }

  isTracking(listId: string): boolean {
    const j = this.joins.get(listId);
    return !!j && !j.done;
  }

  shardReceived(listId: string, sender: string, shard: number, S: number): void {
    const st = this.joins.get(listId);
    if (!st || st.done) return;
    let s = st.senders.get(sender);
    if (!s || s.S !== S) {
      s = { S, got: new Set() };
      st.senders.set(sender, s);
    }
    s.got.add(shard);
    if (s.got.size >= S) this.finish(listId, 'compleet');
  }

  endOfStored(listId: string, ep: EndpointId, generation: number): void {
    const st = this.joins.get(listId);
    if (!st || st.done || generation !== st.generation) return;
    st.eose.add(ep);
    const open = this.ctx.transport.endpoints.filter((e) => this.ctx.transport.isOpen(e));
    if (open.length > 0 && open.every((e) => st.eose.has(e))) this.finish(listId, 'eose');
  }

  private finish(listId: string, reason: 'compleet' | 'eose' | 'timeout'): void {
    const st = this.joins.get(listId);
    if (!st || st.done) return;
    st.done = true;
    if (st.timer !== null) this.ctx.timers.clearTimeout(st.timer);
    this.joins.delete(listId);
    this.onComplete(listId, reason);
  }

  cancelAll(): void {
    for (const st of this.joins.values()) if (st.timer !== null) this.ctx.timers.clearTimeout(st.timer);
    this.joins.clear();
  }
}
