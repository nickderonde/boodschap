// Eigen-staatcontrole (§6.8): na elke EOSE van endpoint R controleert de engine per gedeelde lijst van generatie g en
// elk deel i < S of R het eigen laatste event heeft geleverd. Zo niet: last_event_raw opnieuw naar R.
// Dekt: relay komt terug (S-09), wipe (S-10a), oud eigen event (S-10c), stil laten vallen (S-10d), kill (S-02), E-13.
import type { EndpointId, InboundMessage } from '../Transport';
import type { EngineContext } from './context';
import type { Publisher } from './Publisher';

export class SelfCheck {
  /** Per endpoint: event-ID's die in de huidige REQ geleverd zijn. */
  private readonly delivered = new Map<EndpointId, Set<string>>();
  checks = 0;
  resends = 0;

  constructor(
    private readonly ctx: EngineContext,
    private readonly publisher: Publisher,
  ) {}

  /** Nieuwe REQ (open of nieuwe generatie): leveringen opnieuw tellen. */
  reset(ep?: EndpointId): void {
    if (ep) this.delivered.delete(ep);
    else this.delivered.clear();
  }

  observe(m: InboundMessage): void {
    let s = this.delivered.get(m.endpoint);
    if (!s) {
      s = new Set();
      this.delivered.set(m.endpoint, s);
    }
    s.add(m.id);
  }

  async afterEndOfStored(ep: EndpointId, listIds: readonly string[]): Promise<void> {
    if (this.ctx.state.closed || this.ctx.state.paused) return;
    const got = this.delivered.get(ep) ?? new Set<string>();
    for (const listId of listIds) {
      const info = this.ctx.lists.get(listId);
      if (!info || info.joinedPending) continue;
      const snap = await this.ctx.host.readShards(listId);
      if (!snap) continue;
      for (let i = 0; i < snap.shardCount; i++) {
        const row = snap.shards.get(i);
        if (!row?.lastEventId) continue;
        this.checks++;
        if (got.has(row.lastEventId)) continue;
        this.resends++;
        this.publisher.resendExisting(listId, row, [ep]);
      }
    }
  }
}
