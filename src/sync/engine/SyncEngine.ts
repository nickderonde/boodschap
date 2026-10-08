// SyncEngine (§6, §10, §11): verbindt Publisher, Receiver, SelfCheck en JoinTracker met de Transport.
// Importeert geen transport-implementaties en niets Nostr-specifieks (S-19).
import type { Config } from '../../config';
import type { Clock, Logger, Random, Timers } from '../../core/types';
import type { SyncHost } from '../SyncHost';
import type { EndpointId, EndpointState, Transport } from '../Transport';
import type { EngineContext, Faults } from './context';
import { JoinTracker } from './JoinTracker';
import { Publisher } from './Publisher';
import { Receiver } from './Receiver';
import { SelfCheck } from './SelfCheck';
import { deriveSyncStatus, sameStatus, type SyncStatus } from './status';

export type { Faults } from './context';

export interface SyncEngine {
  start(): Promise<void>;
  /** Flush + max backgroundAckWaitMs wachten op acks + sluiten (§11). */
  pause(): Promise<void>;
  resume(): void;
  networkRestored(): void;
  syncNow(listId?: string): Promise<void>;
  notifyLocalChange(listId: string): void;
  notifyRemoteChange(listId: string): void;
  listsChanged(): Promise<void>;
  /** Directe flush (delen, lijst verwijderen). */
  flushNow(listId: string): Promise<void>;
  status(listId: string): SyncStatus;
  onStatus(cb: (listId: string, s: SyncStatus) => void): () => void;
  shutdown(): void;
  /** Voor tests en diagnose. */
  readonly debug: EngineDebug;
}

export interface EngineDebug {
  publisher: Publisher;
  receiver: Receiver;
  selfCheck: SelfCheck;
  generation(): number;
  genListsSize(): number;
  offsetSec(): number;
}

export interface EngineDeps {
  host: SyncHost;
  transport: Transport;
  clock: Clock;
  timers: Timers;
  random: Random;
  log: Logger;
  config: Config;
  faults?: Faults;
}

export function createSyncEngine(deps: EngineDeps): SyncEngine {
  return new SyncEngineImpl(deps);
}

class SyncEngineImpl implements SyncEngine {
  private readonly ctx: EngineContext;
  private readonly publisher: Publisher;
  private readonly receiver: Receiver;
  private readonly selfCheck: SelfCheck;
  private readonly joins: JoinTracker;
  private generation = 0;
  private readonly genLists = new Map<number, string[]>();
  private readonly endpointState = new Map<EndpointId, { state: EndpointState; firstAttempt: boolean }>();
  private readonly fetched = new Set<string>();
  private readonly pending = new Map<string, number>();
  private readonly lastStatus = new Map<string, SyncStatus>();
  private readonly statusListeners = new Set<(listId: string, s: SyncStatus) => void>();
  private readonly dirty = new Set<string>();
  private statusTimer: unknown = null;
  private readonly unsubs: (() => void)[] = [];
  private started = false;
  /** Verhoogd door resume(); een lopende pause() stopt als die intussen veranderde (review N1). */
  private lifeGen = 0;
  private syncNowTimers = new Map<string, unknown>();

  constructor(deps: EngineDeps) {
    this.ctx = {
      host: deps.host,
      transport: deps.transport,
      clock: deps.clock,
      timers: deps.timers,
      random: deps.random,
      log: deps.log,
      config: deps.config,
      faults: deps.faults,
      lists: new Map(),
      tagIndex: new Map(),
      state: { closed: false, paused: false, urgent: false },
      statusDirty: (listId) => this.markDirty(listId),
    };
    this.publisher = new Publisher(this.ctx);
    this.selfCheck = new SelfCheck(this.ctx, this.publisher);
    this.joins = new JoinTracker(this.ctx, (listId, reason) => void this.completeJoin(listId, reason));
    this.receiver = new Receiver(this.ctx, {
      observe: (m) => this.selfCheck.observe(m),
      ownDelivered: (id, ep) => this.publisher.noteDelivered(id, ep),
      shardReceived: (listId, sender, shard, S) => this.joins.shardReceived(listId, sender, shard, S),
      remoteChanged: (listId) => this.notifyRemoteChange(listId),
      futureSchema: (listId) => this.markDirty(listId),
    });
    const t = deps.transport;
    this.unsubs.push(
      t.on('message', (m) => void this.receiver.handle(m).catch((e) => this.ctx.log.warn('recv.error', { reason: e instanceof Error ? e.name : 'unknown' }))),
      t.on('endOfStored', (ep, g) => void this.onEndOfStored(ep, g)),
      t.on('endpoint', (ep, s, first) => this.onEndpoint(ep, s, first)),
      t.on('outcome', (ep, id, o) => void this.publisher.handleOutcome(ep, id, o).catch((e) => this.ctx.log.warn('outcome.error', { reason: e instanceof Error ? e.name : 'unknown' }))),
    );
  }

  get debug(): EngineDebug {
    return {
      publisher: this.publisher,
      receiver: this.receiver,
      selfCheck: this.selfCheck,
      generation: () => this.generation,
      genListsSize: () => this.genLists.size,
      offsetSec: () => this.publisher.offsetSec,
    };
  }

  // ---------------------------------------------------------------- levenscyclus

  async start(): Promise<void> {
    if (this.started || this.ctx.state.closed) return;
    this.started = true;
    await this.publisher.loadOffset();
    await this.listsChanged();
    this.ctx.transport.connect();
    for (const listId of this.ctx.lists.keys()) void this.publisher.flush(listId);
  }

  async listsChanged(): Promise<void> {
    if (this.ctx.state.closed) return;
    const lists = this.ctx.host.sharedLists();
    const ids = new Set(lists.map((l) => l.listId));
    const removed = [...this.ctx.lists.keys()].filter((old) => !ids.has(old));
    for (const old of removed) this.ctx.lists.delete(old);
    for (const old of removed) {
      await this.publisher.idle(old);
      this.publisher.forgetList(old);
    }
    this.ctx.lists.clear();
    this.ctx.tagIndex.clear();
    for (const l of lists) {
      this.ctx.lists.set(l.listId, l);
      this.ctx.tagIndex.set(l.listTag, l.listId);
    }
    const subs = [];
    for (const l of lists) subs.push({ channel: l.listTag, knownSenders: await this.ctx.host.members(l.listId) });
    this.selfCheck.reset();
    this.generation = this.ctx.transport.setSubscriptions(subs);
    this.genLists.set(this.generation, lists.map((l) => l.listId));
    // Alleen de laatste generaties bewaren (review bevinding 10); een EOSE van een oude generatie wordt overgeslagen.
    for (const g of [...this.genLists.keys()]) if (g < this.generation - 3) this.genLists.delete(g);
    for (const l of lists) {
      if (l.joinedPending) this.joins.track(l.listId, this.generation);
      void this.refreshPending(l.listId);
    }
    for (const l of lists) this.markDirty(l.listId);
  }

  async pause(): Promise<void> {
    if (this.ctx.state.closed) return;
    const gen = ++this.lifeGen;
    // Flush direct, kort wachten op acks, daarna sluiten (§11, NF-11). Het geheel is begrensd op pauseBudgetMs
    // (review bevinding 15): geen wachten op klokantwoorden (I-3) in de achtergrond.
    const start = this.ctx.clock.nowMs();
    this.ctx.state.urgent = true;
    this.publisher.urge();
    let budgetTimer: unknown = null;
    const budget = new Promise<void>((r) => (budgetTimer = this.ctx.timers.setTimeout(r, this.ctx.config.pauseBudgetMs)));
    await Promise.race([Promise.all([...this.ctx.lists.keys()].map((id) => this.publisher.flush(id))), budget]);
    const left = Math.max(0, this.ctx.config.pauseBudgetMs - (this.ctx.clock.nowMs() - start));
    await this.publisher.waitForAcks(Math.min(this.ctx.config.backgroundAckWaitMs, left));
    if (budgetTimer !== null) this.ctx.timers.clearTimeout(budgetTimer);
    this.ctx.state.urgent = false;
    // Kwam de app intussen terug naar de voorgrond (resume), dan niet alsnog sluiten.
    if (gen !== this.lifeGen || this.ctx.state.closed) return;
    this.ctx.state.paused = true;
    this.publisher.cancelAll();
    this.ctx.transport.pause();
  }

  resume(): void {
    if (this.ctx.state.closed) return;
    this.lifeGen++;
    this.ctx.state.urgent = false;
    this.ctx.state.paused = false;
    this.fetched.clear();
    // Nieuwe REQ per open relay: leveringen opnieuw tellen, zodat de eigen-staatcontrole na EOSE echt controleert
    // (D-ET-01: een relay die data verloor zonder de verbinding te verbreken, wordt opnieuw gevuld).
    this.selfCheck.reset();
    this.ctx.transport.kick();
    for (const id of this.ctx.lists.keys()) {
      void this.publisher.flush(id);
      this.markDirty(id);
    }
  }

  networkRestored(): void {
    this.resume();
  }

  async syncNow(listId?: string): Promise<void> {
    const ids = listId ? [listId] : [...this.ctx.lists.keys()];
    for (const id of ids) {
      this.fetched.delete(id);
      const old = this.syncNowTimers.get(id);
      if (old !== undefined) this.ctx.timers.clearTimeout(old);
      this.syncNowTimers.set(
        id,
        this.ctx.timers.setTimeout(() => {
          this.syncNowTimers.delete(id);
          this.fetched.add(id);
          this.markDirty(id);
        }, this.ctx.config.syncNowTimeoutMs),
      );
      this.markDirty(id);
    }
    this.ctx.state.paused = false;
    this.selfCheck.reset(); // D-ET-01
    this.ctx.transport.kick();
    await Promise.all(ids.map((id) => this.publisher.flush(id)));
  }

  notifyLocalChange(listId: string): void {
    void this.refreshPending(listId);
    if (!this.ctx.lists.has(listId)) return;
    this.publisher.schedule(listId, this.ctx.config.localWindowMs);
  }

  notifyRemoteChange(listId: string): void {
    if (!this.ctx.lists.has(listId)) return;
    this.publisher.schedule(listId, this.ctx.config.remoteWindowMs);
  }

  flushNow(listId: string): Promise<void> {
    return this.publisher.flush(listId);
  }

  shutdown(): void {
    this.ctx.state.closed = true;
    this.publisher.cancelAll();
    this.joins.cancelAll();
    if (this.statusTimer !== null) this.ctx.timers.clearTimeout(this.statusTimer);
    for (const t of this.syncNowTimers.values()) this.ctx.timers.clearTimeout(t);
    for (const u of this.unsubs) u();
    this.ctx.transport.close();
  }

  // ---------------------------------------------------------------- transportgebeurtenissen

  private onEndpoint(ep: EndpointId, s: EndpointState, firstAttempt: boolean): void {
    this.endpointState.set(ep, { state: s, firstAttempt });
    if (s === 'open') this.selfCheck.reset(ep);
    for (const id of this.ctx.lists.keys()) this.markDirty(id);
  }

  private async onEndOfStored(ep: EndpointId, g: number): Promise<void> {
    const listIds = this.genLists.get(g) ?? [];
    for (const id of listIds) {
      this.fetched.add(id);
      this.joins.endOfStored(id, ep, g);
      this.markDirty(id);
    }
    await this.selfCheck.afterEndOfStored(ep, listIds);
  }

  private async completeJoin(listId: string, reason: string): Promise<void> {
    this.ctx.log.info('join.complete', { reason });
    await this.ctx.host.completeJoin(listId);
    const info = this.ctx.lists.get(listId);
    if (info) this.ctx.lists.set(listId, { ...info, joinedPending: false });
    this.markDirty(listId);
    // Nu pas de eigen (gemergede) staat publiceren (E-15).
    this.publisher.schedule(listId, this.ctx.config.remoteWindowMs);
  }

  private async refreshPending(listId: string): Promise<void> {
    try {
      this.pending.set(listId, await this.ctx.host.pendingCount(listId));
    } catch {
      // database dicht (kill/shutdown)
    }
    this.markDirty(listId);
  }

  // ---------------------------------------------------------------- status (§6.9)

  status(listId: string): SyncStatus {
    const info = this.ctx.lists.get(listId);
    const t = this.ctx.transport;
    let open = 0;
    let firstAttempt = false;
    for (const ep of t.endpoints) {
      if (t.isOpen(ep)) open++;
      const st = this.endpointState.get(ep);
      if (st?.state === 'connecting' && st.firstAttempt) firstAttempt = true;
    }
    return deriveSyncStatus({
      shared: !!info,
      joinedPending: !!info?.joinedPending,
      relaysTotal: t.endpoints.length,
      relaysOpen: this.ctx.state.paused ? 0 : open,
      relaysConnectingFirstAttempt: firstAttempt && !this.ctx.state.paused,
      pendingCount: this.pending.get(listId) ?? 0,
      initialFetchDone: this.fetched.has(listId),
      inFlight: this.publisher.hasInFlight(listId),
      failingSinceMs: this.publisher.failingSince.get(listId) ?? null,
      failingReason: this.publisher.failingReason.get(listId),
      futureSchema: this.ctx.host.futureSchema(listId),
      tooLarge: this.publisher.isTooLarge(listId),
      nowMs: this.ctx.clock.nowMs(),
      failingAfterMs: this.ctx.config.failingAfterMs,
    });
  }

  onStatus(cb: (listId: string, s: SyncStatus) => void): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  private markDirty(listId: string): void {
    if (this.ctx.state.closed) return;
    this.dirty.add(listId);
    if (this.statusTimer !== null) return;
    this.statusTimer = this.ctx.timers.setTimeout(() => {
      this.statusTimer = null;
      const ids = [...this.dirty];
      this.dirty.clear();
      for (const id of ids) {
        if (!this.ctx.lists.has(id)) continue;
        void this.refreshPendingQuiet(id).then(() => {
          const s = this.status(id);
          if (sameStatus(this.lastStatus.get(id), s)) return;
          this.lastStatus.set(id, s);
          for (const l of [...this.statusListeners]) l(id, s);
        });
      }
    }, this.ctx.config.statusThrottleMs);
  }

  private async refreshPendingQuiet(listId: string): Promise<void> {
    try {
      this.pending.set(listId, await this.ctx.host.pendingCount(listId));
    } catch {
      // negeren
    }
  }
}
