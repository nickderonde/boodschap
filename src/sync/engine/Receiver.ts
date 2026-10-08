// Ontvangstpijplijn (§6.7): goedkoopste controles eerst; elke fout → negeren, teller, één logregel per code per minuut.
import { decodeShard } from '../../core/codec/snapshot';
import { buildAad, open } from '../../core/crypto/aead';
import type { InboundMessage } from '../Transport';
import type { EngineContext } from './context';

const DEDUP_MAX = 10_000;

export interface ReceiverHooks {
  observe(m: InboundMessage): void;
  ownDelivered(eventId: string, ep: string): void;
  shardReceived(listId: string, sender: string, shard: number, S: number): void;
  remoteChanged(listId: string): void;
  futureSchema(listId: string): void;
}

export class Receiver {
  private readonly seen = new Set<string>();
  private readonly seenOrder: string[] = [];
  private readonly knownMembers = new Set<string>();
  readonly counters = new Map<string, number>();
  private readonly lastLog = new Map<string, number>();

  constructor(
    private readonly ctx: EngineContext,
    private readonly hooks: ReceiverHooks,
  ) {}

  private reject(code: string): void {
    this.counters.set(code, (this.counters.get(code) ?? 0) + 1);
    const now = this.ctx.clock.nowMs();
    if ((this.lastLog.get(code) ?? -Infinity) + 60_000 <= now) {
      this.lastLog.set(code, now);
      this.ctx.log.warn(code, { count: this.counters.get(code)! });
    }
  }

  private remember(id: string): void {
    this.seen.add(id);
    this.seenOrder.push(id);
    if (this.seenOrder.length > DEDUP_MAX) this.seen.delete(this.seenOrder.shift()!);
  }

  async handle(m: InboundMessage): Promise<void> {
    if (this.ctx.state.closed) return;
    // 1. Vorm en bekende d-tag.
    if (m.raw.length > this.ctx.config.maxEventChars) return this.reject('recv.too-large');
    const listId = this.ctx.tagIndex.get(m.channel);
    if (!listId) return this.reject('recv.unknown-list');
    if (!Number.isInteger(m.slot) || m.slot < 0 || m.slot > 15) return this.reject('recv.bad-slot');
    const info = this.ctx.lists.get(listId);
    if (!info) return this.reject('recv.unknown-list');
    // 2. Elke levering telt voor de eigen-staatcontrole, ook duplicaten.
    this.hooks.observe(m);
    // 3. Eigen sleutel: nooit mergen; wel deliveredBy bijwerken (B-1).
    if (m.sender === info.identity.id) {
      this.hooks.ownDelivered(m.id, m.endpoint);
      return;
    }
    // Dedup op event-ID, maar pas onthouden na een geslaagde handtekening- én AEAD-controle (review bevinding 2):
    // anders kan één relay met een vervalste kopie het echte event van andere relays onderdrukken.
    if (this.seen.has(m.id)) return;
    // 4. Handtekening.
    let valid = false;
    try {
      valid = m.verify();
    } catch {
      valid = false;
    }
    if (!valid) return this.reject('recv.signature');
    // 5. Ontsleutelen (AAD door de engine gebouwd, E-17).
    let plain: Uint8Array;
    try {
      plain = open(info.encKey, buildAad(m.sender, m.channel, m.slot), m.envelope);
    } catch {
      return this.reject('recv.aead');
    }
    this.remember(m.id);
    // 6. Inflate met limiet, parse en valideren.
    let decoded;
    try {
      decoded = decodeShard(plain);
    } catch {
      return this.reject('recv.payload');
    }
    if (decoded.kind === 'future') {
      await this.ctx.host.storeFuture(listId, m.sender, `${m.channel}:${m.slot}`, m.raw);
      this.hooks.futureSchema(listId);
      return this.reject('recv.future-schema');
    }
    if (decoded.invalidRecords > 0) this.reject('payload.record-invalid');
    this.hooks.shardReceived(listId, m.sender, decoded.meta.shard, decoded.meta.shardCount);
    const mk = `${listId}|${m.sender}`;
    if (!this.knownMembers.has(mk)) {
      this.knownMembers.add(mk);
      await this.ctx.host.addMember(listId, m.sender);
    }
    // 7. Merge via de schrijfwachtrij van de facade.
    const changed = await this.ctx.host.mergeRemote(listId, decoded.state);
    if (changed) this.hooks.remoteChanged(listId);
  }
}
