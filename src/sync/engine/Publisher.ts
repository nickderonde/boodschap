// Publisher (§6.6, §6.8): vensters, single-flight-lock per lijst (B-2), versies met vloer en CAS, inFlight per
// event-ID (B-1), uitkomsten, retries (E-13), klokcorrectie, terugrollen, wachten op klokantwoorden (I-3) en de
// heruitzendtimer per slot (K-3).
import { canonicalList } from '../../core/canonical';
import { utf8 } from '../../core/bytes';
import { encodeShard } from '../../core/codec/snapshot';
import { splitShards, MAX_SHARDS } from '../../core/codec/shard';
import { buildAad, seal } from '../../core/crypto/aead';
import { sha256Hex } from '../../core/crypto/kdf';
import type { PersistShard, ShardRow } from '../SyncHost';
import type { EndpointId, PreparedMessage, PublishOutcome } from '../Transport';
import { slotKey, type EngineContext } from './context';

const MAX_OFFSET_SEC = 48 * 3600;

export interface InFlight {
  id: string;
  listId: string;
  shard: number;
  rev: number;
  version: number;
  clockDerived: boolean;
  msg: PreparedMessage;
  sentTo: Set<EndpointId>;
  answers: Map<EndpointId, PublishOutcome>;
  deliveredBy: Set<EndpointId>;
  createdMs: number;
  corrected: boolean;
  /** floor_version vóór dit event (voor terugrollen door een keten, zie DEVIATIONS D-03). */
  floorBefore: number;
  /** Het vorige laatste event van dit slot (echte voorganger in de keten, review bevinding 7). */
  prevId: string | null;
  /** Er is een nieuwer event voor dit slot; de regel blijft (TTL) bewaard als bewijs voor terugrollen. */
  superseded: boolean;
}

interface ListPub {
  running: Promise<void> | null;
  again: boolean;
  timer: unknown;
  timerDue: number;
  lastFlushEndMs: number;
  /** Delen die opnieuw gepubliceerd moeten worden, ook als de hash gelijk is (clock-behind). */
  force: Set<number>;
  tooLarge: boolean;
}

export class Publisher {
  readonly inflight = new Map<string, InFlight>();
  /** Huidig laatste event per slot (geheugen; bron is shard_state). */
  private readonly lastEvent = new Map<string, string>();
  private readonly pubs = new Map<string, ListPub>();
  private readonly retries = new Map<string, { count: number; timer: unknown }>();
  private readonly resendTimers = new Map<string, unknown>();
  private readonly answerWaiters = new Set<() => void>();
  offsetSec = 0;
  private k = 0;
  /** Laatste uitkomst per lijst per endpoint (voor failingSince, S-17). */
  readonly lastOutcome = new Map<string, Map<EndpointId, PublishOutcome>>();
  readonly failingSince = new Map<string, number | null>();
  readonly failingReason = new Map<string, 'geweigerd' | 'geen-antwoord'>();
  private readonly failingTimers = new Map<string, unknown>();
  rotations = 0;

  constructor(private readonly ctx: EngineContext) {}

  async loadOffset(): Promise<void> {
    this.offsetSec = await this.ctx.host.getClockOffset();
  }

  private pub(listId: string): ListPub {
    let p = this.pubs.get(listId);
    if (!p) {
      p = { running: null, again: false, timer: null, timerDue: 0, lastFlushEndMs: -Infinity, force: new Set(), tooLarge: false };
      this.pubs.set(listId, p);
    }
    return p;
  }

  isTooLarge(listId: string): boolean {
    return this.pubs.get(listId)?.tooLarge ?? false;
  }

  private now(): number {
    return this.ctx.clock.nowMs();
  }

  private nowAdj(): number {
    return Math.floor(this.now() / 1000) + this.offsetSec;
  }

  // ---------------------------------------------------------------- vensters (S-21)

  /** Plant een flush na `windowMs`, en minstens minFlushGapMs na de vorige flush. */
  schedule(listId: string, windowMs: number): void {
    if (this.ctx.state.closed || this.ctx.state.paused) return;
    const p = this.pub(listId);
    const now = this.now();
    // Een sprong terug van de wandklok mag de volgende flush niet ver vooruit schuiven.
    if (p.lastFlushEndMs > now) p.lastFlushEndMs = now;
    const due = Math.max(now + windowMs, p.lastFlushEndMs + this.ctx.config.minFlushGapMs);
    if (p.timer !== null) {
      if (p.timerDue <= due && p.timerDue >= now - 1) return;
      this.ctx.timers.clearTimeout(p.timer);
    }
    p.timerDue = due;
    p.timer = this.ctx.timers.setTimeout(() => {
      p.timer = null;
      void this.flush(listId).catch((e) => this.ctx.log.warn('flush.error', { reason: errName(e) }));
    }, Math.max(0, due - this.now()));
  }

  // ---------------------------------------------------------------- single-flight (B-2)

  /** Elk pad gaat hierlangs. Nooit twee flushes van dezelfde lijst tegelijk; aanvragen worden samengevoegd. */
  flush(listId: string): Promise<void> {
    const p = this.pub(listId);
    if (p.running) {
      p.again = true;
      return p.running;
    }
    p.running = (async () => {
      try {
        do {
          p.again = false;
          if (this.ctx.state.closed) break;
          await this.flushOnce(listId);
        } while (p.again);
      } finally {
        p.running = null;
        p.lastFlushEndMs = this.now();
      }
    })();
    return p.running;
  }

  /** Wacht tot een lopende flush van deze lijst klaar is. */
  async idle(listId: string): Promise<void> {
    const r = this.pubs.get(listId)?.running;
    if (r) await r.catch(() => {});
  }

  isFlushing(listId: string): boolean {
    return !!this.pubs.get(listId)?.running;
  }

  private async flushOnce(listId: string): Promise<void> {
    const { host, transport, config } = this.ctx;
    for (let attempt = 0; attempt < 8; attempt++) {
      if (this.ctx.state.closed || this.ctx.state.paused) return;
      const info = this.ctx.lists.get(listId);
      if (!info) return;
      // 1. Alleen gecommitte data.
      const snap = await host.readFlush(listId);
      if (!snap || !snap.shared || snap.joinedPending) return;
      // 1b. Wachten op klokantwoorden en de terugrolbeslissing (I-3, B-1), met de lock vastgehouden.
      if (await this.clockDecisions(listId, snap.shards)) continue;

      const S = snap.shardCount;
      const p = this.pub(listId);
      const parts = splitShards(snap.state, S);
      const changed: { shard: number; hash: string; row: ShardRow | undefined; envelope: Uint8Array }[] = [];
      for (let i = 0; i < S; i++) {
        const hash = sha256Hex(utf8(canonicalList(parts[i])));
        const row = snap.shards.get(i);
        if (row?.publishedHash === hash && !p.force.has(i)) continue;
        changed.push({ shard: i, hash, row, envelope: new Uint8Array(0) });
      }
      if (changed.length === 0) return;

      // Rotatie bij een echte wegloper (§6.8 stap 4).
      const nowAdj = this.nowAdj();
      if (changed.some((c) => (c.row?.floorVersion ?? 0) - nowAdj > 3600)) {
        const identity = await host.rotateIdentity(listId);
        this.rotations++;
        this.ctx.lists.set(listId, { ...info, identity });
        for (const key of [...this.lastEvent.keys()]) if (key.startsWith(listId + '#')) this.lastEvent.delete(key);
        continue;
      }

      // Envelop per gewijzigd deel; te groot → S verdubbelen (§6.5).
      let tooBig = false;
      for (const c of changed) {
        const payload = encodeShard(parts[c.shard], { dev: host.deviceId, rev: snap.stateRev, shard: c.shard, shardCount: S });
        c.envelope = seal(info.encKey, buildAad(info.identity.id, info.listTag, c.shard), payload, this.ctx.random);
        if (c.envelope.length > transport.maxPayloadBytes) tooBig = true;
      }
      if (tooBig) {
        if (S >= MAX_SHARDS) {
          p.tooLarge = true;
          this.ctx.log.warn('flush.too-large');
          this.ctx.statusDirty(listId);
          return;
        }
        await host.growShards(listId, Math.min(MAX_SHARDS, S * 2));
        continue;
      }
      p.tooLarge = false;

      // 3. Versies en voorbereiden.
      const prepared: { msg: PreparedMessage; write: PersistShard; clockDerived: boolean }[] = [];
      for (const c of changed) {
        const floor = c.row?.floorVersion ?? 0;
        const v = Math.max(nowAdj, floor + 1);
        const clockDerived = v === nowAdj;
        await this.ctx.faults?.at('in-prepare', { listId });
        const msg = await transport.prepare({ channel: info.listTag, slot: c.shard, identity: info.identity, version: v, envelope: c.envelope });
        prepared.push({
          msg,
          clockDerived,
          write: {
            shard: c.shard,
            floorRead: floor,
            publishedRev: snap.stateRev,
            publishedHash: c.hash,
            lastEventId: msg.id,
            lastEventRaw: msg.raw,
            lastVersion: v,
            lastClockDerived: clockDerived,
          },
        });
      }
      await this.ctx.faults?.at('after-prepare', { listId });
      // 4. Eén transactie met CAS.
      const ok = await host.persistFlush(listId, prepared.map((x) => x.write));
      if (!ok) {
        this.ctx.log.warn('flush.cas-retry');
        continue;
      }
      await this.ctx.faults?.at('after-persist', { listId });
      // Lijst intussen verlaten of verwijderd: niets meer versturen.
      if (!this.ctx.lists.has(listId)) return;
      // 5. Pas nu versturen.
      for (const x of prepared) {
        p.force.delete(x.write.shard);
        this.registerNewEvent(listId, x.write.shard, snap.stateRev, x.write.lastVersion, x.clockDerived, x.msg, x.write.floorRead);
        this.sendTo(x.msg.id, this.openEndpoints());
      }
      this.ctx.statusDirty(listId);
      await this.ctx.faults?.at('after-send', { listId });
      return;
    }
    this.ctx.log.warn('flush.gave-up');
  }

  openEndpoints(): EndpointId[] {
    return this.ctx.transport.endpoints.filter((e) => this.ctx.transport.isOpen(e));
  }

  private registerNewEvent(listId: string, shard: number, rev: number, version: number, clockDerived: boolean, msg: PreparedMessage, floorBefore: number): void {
    const key = slotKey(listId, shard);
    const old = this.lastEvent.get(key);
    if (old) this.supersede(old);
    this.cancelResend(key);
    this.lastEvent.set(key, msg.id);
    this.inflight.set(msg.id, {
      id: msg.id, listId, shard, rev, version, clockDerived, msg,
      sentTo: new Set(), answers: new Map(), deliveredBy: new Set(), createdMs: this.now(), corrected: false,
      floorBefore, superseded: false, prevId: old ?? null,
    });
    this.pruneInFlight();
  }

  /** Een nieuwer event voor het slot: retries stoppen; de regel blijft als bewijs (antwoorden, leveringen) tot de TTL. */
  private supersede(id: string): void {
    const f = this.inflight.get(id);
    if (!f) return;
    f.superseded = true;
    for (const key of [...this.retries.keys()]) {
      if (key.startsWith(id + '|')) {
        const r = this.retries.get(key)!;
        if (r.timer !== null) this.ctx.timers.clearTimeout(r.timer);
        this.retries.delete(key);
      }
    }
  }

  private dropInFlight(id: string): void {
    this.inflight.delete(id);
    for (const key of [...this.retries.keys()]) {
      if (key.startsWith(id + '|')) {
        const r = this.retries.get(key)!;
        if (r.timer !== null) this.ctx.timers.clearTimeout(r.timer);
        this.retries.delete(key);
      }
    }
  }

  private pruneInFlight(): void {
    const ttl = this.ctx.config.inFlightTtlMs;
    const now = this.now();
    for (const [id, f] of this.inflight) if (now - f.createdMs > ttl && this.lastEvent.get(slotKey(f.listId, f.shard)) !== id) this.dropInFlight(id);
    // Hooguit 64 vervangen regels bewaren.
    const superseded = [...this.inflight.values()].filter((f) => f.superseded);
    if (superseded.length > 64) for (const f of superseded.sort((a, b) => a.createdMs - b.createdMs).slice(0, superseded.length - 64)) this.dropInFlight(f.id);
  }

  /** Verstuurt een (bestaand of nieuw) event; voegt samen in inFlight (B-1). */
  sendTo(id: string, eps: readonly EndpointId[]): void {
    const f = this.inflight.get(id);
    if (!f || eps.length === 0) return;
    for (const ep of eps) {
      f.sentTo.add(ep);
      f.answers.delete(ep);
    }
    this.ctx.transport.send(f.msg, eps);
  }

  /** Eigen-staatcontrole of herstart: verstuurt het persistente laatste event van een slot (§6.8). */
  resendExisting(listId: string, row: ShardRow, eps: readonly EndpointId[]): void {
    const info = this.ctx.lists.get(listId);
    if (!info || !row.lastEventId || !row.lastEventRaw) return;
    const key = slotKey(listId, row.shard);
    let f = this.inflight.get(row.lastEventId);
    if (!f) {
      const msg: PreparedMessage = { id: row.lastEventId, raw: row.lastEventRaw, channel: info.listTag, slot: row.shard, sender: info.identity.id, version: row.lastVersion };
      // Een event van een oude identiteit (na rotatie) niet meer versturen.
      if (!this.lastEvent.has(key)) this.lastEvent.set(key, row.lastEventId);
      if (this.lastEvent.get(key) !== row.lastEventId) return;
      f = {
        id: row.lastEventId, listId, shard: row.shard, rev: row.publishedRev, version: row.lastVersion, clockDerived: row.lastClockDerived, msg,
        sentTo: new Set(), answers: new Map(), deliveredBy: new Set(), createdMs: this.now(), corrected: false,
        floorBefore: row.floorBefore, superseded: false, prevId: null,
      };
      this.inflight.set(row.lastEventId, f);
    }
    this.sendTo(row.lastEventId, eps);
  }

  noteDelivered(eventId: string, ep: EndpointId): void {
    this.inflight.get(eventId)?.deliveredBy.add(ep);
  }

  // ---------------------------------------------------------------- uitkomsten (§6.6)

  async handleOutcome(ep: EndpointId, id: string, o: PublishOutcome): Promise<void> {
    const f = this.inflight.get(id);
    if (!f) return; // onbekend (bv. van vóór een herstart): negeren (E-12)
    f.answers.set(ep, o);
    for (const w of [...this.answerWaiters]) w();
    const lo = this.lastOutcome.get(f.listId) ?? new Map();
    this.lastOutcome.set(f.listId, lo);
    if (o.kind !== 'not-connected') lo.set(ep, o);
    const isCurrent = this.lastEvent.get(slotKey(f.listId, f.shard)) === id;

    switch (o.kind) {
      case 'accepted':
        this.k = 0;
        this.failingSince.set(f.listId, null);
        this.cancelRetry(id, ep);
        await this.ctx.host.recordAck(f.listId, f.shard, f.rev, ep, id, f.version);
        await this.ctx.host.afterAck(f.listId);
        break;
      case 'timeout':
        if (isCurrent) this.scheduleRetry(f, ep);
        break;
      case 'rejected':
        if (o.reason === 'rate-limited') {
          if (isCurrent) this.scheduleRetry(f, ep);
        } else if (o.reason === 'too-large') {
          const snap = await this.ctx.host.readShards(f.listId);
          const S = snap?.shardCount ?? 1;
          if (S < MAX_SHARDS) {
            await this.ctx.host.growShards(f.listId, Math.min(MAX_SHARDS, S * 2));
            void this.flush(f.listId);
          } else {
            this.pub(f.listId).tooLarge = true;
          }
        } else if (o.reason === 'clock-ahead' || o.reason === 'clock-behind') {
          await this.clockCorrection(f, o.reason);
          if (isCurrent) void this.flush(f.listId);
        } else if (isCurrent) {
          // refused/other (D-ET-05): de UI belooft "de app blijft het opnieuw proberen" — langzaam en begrensd.
          this.scheduleRefusedRetry(f, ep);
        }
        break;
      case 'not-connected':
        break; // de eigen-staatcontrole na de volgende EOSE verstuurt het
    }
    this.updateFailing(f.listId);
    this.ctx.statusDirty(f.listId);
  }

  private scheduleRetry(f: InFlight, ep: EndpointId): void {
    const key = `${f.id}|${ep}`;
    const r = this.retries.get(key) ?? { count: 0, timer: null };
    if (r.timer !== null) return;
    const delays = this.ctx.config.retryDelaysMs;
    if (r.count >= delays.length) return; // max 5 retries (E-13); daarna eigen-staatcontrole of kick
    const delay = delays[r.count];
    r.count++;
    r.timer = this.ctx.timers.setTimeout(() => {
      r.timer = null;
      if (this.ctx.state.paused || this.ctx.state.closed) return;
      if (this.lastEvent.get(slotKey(f.listId, f.shard)) !== f.id) return;
      if (this.ctx.transport.isOpen(ep)) this.sendTo(f.id, [ep]);
    }, delay);
    this.retries.set(key, r);
  }

  private scheduleRefusedRetry(f: InFlight, ep: EndpointId): void {
    const key = `${f.id}|${ep}|refused`;
    const r = this.retries.get(key) ?? { count: 0, timer: null };
    if (r.timer !== null) return;
    const delays = this.ctx.config.refusedRetryDelaysMs;
    if (r.count >= this.ctx.config.refusedRetryMax || delays.length === 0) return;
    const delay = delays[Math.min(r.count, delays.length - 1)];
    r.count++;
    r.timer = this.ctx.timers.setTimeout(() => {
      r.timer = null;
      if (this.ctx.state.paused || this.ctx.state.closed) return;
      if (this.lastEvent.get(slotKey(f.listId, f.shard)) !== f.id) return;
      if (this.ctx.transport.isOpen(ep)) this.sendTo(f.id, [ep]);
    }, delay);
    this.retries.set(key, r);
  }

  private cancelRetry(id: string, ep: EndpointId): void {
    for (const key of [`${id}|${ep}`, `${id}|${ep}|refused`]) {
      const r = this.retries.get(key);
      if (r?.timer) this.ctx.timers.clearTimeout(r.timer);
      if (r) r.timer = null;
    }
  }

  retryCount(id: string, ep: EndpointId): number {
    return this.retries.get(`${id}|${ep}`)?.count ?? 0;
  }

  // ---------------------------------------------------------------- klokcorrectie en terugrollen (§6.8)

  private async clockCorrection(f: InFlight, reason: 'clock-ahead' | 'clock-behind'): Promise<void> {
    if (f.corrected) return; // maximaal één correctie per event
    f.corrected = true;
    if (reason === 'clock-ahead') {
      if (!f.clockDerived) return;
      this.offsetSec = Math.max(-MAX_OFFSET_SEC, this.offsetSec - 300 * 2 ** this.k);
    } else {
      this.offsetSec = Math.min(MAX_OFFSET_SEC, this.offsetSec + 300 * 2 ** this.k);
      this.pub(f.listId).force.add(f.shard);
    }
    this.k = Math.min(this.k + 1, 12);
    await this.ctx.host.setClockOffset(this.offsetSec);
    this.ctx.log.info('clock.corrected', { offsetSec: this.offsetSec });
  }

  private hasClockRejection(f: InFlight): boolean {
    for (const o of f.answers.values()) if (o.kind === 'rejected' && (o.reason === 'clock-ahead' || o.reason === 'clock-behind')) return true;
    return false;
  }

  private outstanding(f: InFlight): EndpointId[] {
    return [...f.sentTo].filter((ep) => !f.answers.has(ep) && this.ctx.transport.isOpen(ep));
  }

  /**
   * Stap 1b + §6.8 stap 2/3, binnen de lock. Wacht (max clockWaitMaxMs) op open antwoorden voor slots waarvan het
   * laatste event een klokweigering heeft, en neemt dan de terugrolbeslissing. Geeft true als er teruggerold is.
   */
  private async clockDecisions(listId: string, shards: Map<number, ShardRow>): Promise<boolean> {
    const candidates: { f: InFlight; row: ShardRow }[] = [];
    for (const row of shards.values()) {
      if (!row.lastEventId) continue;
      const f = this.inflight.get(row.lastEventId);
      if (f && this.hasClockRejection(f)) candidates.push({ f, row });
    }
    if (candidates.length === 0) return false;
    // Bij naar de achtergrond gaan niet wachten (review bevinding 15).
    const deadline = this.now() + (this.ctx.state.urgent ? 0 : this.ctx.config.clockWaitMaxMs);
    while (candidates.some((c) => this.outstanding(c.f).length > 0) && this.now() < deadline && !this.ctx.state.closed && !this.ctx.state.urgent) {
      await new Promise<void>((resolve) => {
        const done = () => {
          this.answerWaiters.delete(done);
          this.ctx.timers.clearTimeout(t);
          resolve();
        };
        const t = this.ctx.timers.setTimeout(done, Math.max(1, deadline - this.now()));
        this.answerWaiters.add(done);
      });
    }
    let rolled = false;
    for (const { f, row } of candidates) {
      const eps = this.ctx.transport.endpoints;
      const allClockAhead = eps.length > 0 && eps.every((ep) => {
        const a = f.answers.get(ep);
        return a?.kind === 'rejected' && a.reason === 'clock-ahead';
      });
      const anyAccepted = [...f.answers.values()].some((a) => a.kind === 'accepted');
      // Terugrollen door de keten (D-03): zolang het event dat de nieuwe vloer bepaalt in deze run ook aantoonbaar
      // nergens staat (elke relay clock-ahead, niemand accepteerde of leverde), mag de vloer verder terug. Tegen een lus:
      // de keten moet minstens één klok-afgeleid event bevatten (dat leverde een klokcorrectie op, dus vooruitgang).
      let newFloor = f.floorBefore;
      let chainOk = this.provenAbsent(f) && allClockAhead && !anyAccepted && f.version === row.floorVersion && row.lastEventId === f.id;
      if (chainOk) {
        const t = rollbackTarget(f, (id) => this.inflight.get(id), (x) => this.provenAbsent(x));
        newFloor = t.newFloor;
        chainOk = t.sawClockDerived;
      }
      if (chainOk) {
        const ok = await this.ctx.host.rollbackFloor(listId, row.shard, row.floorVersion, newFloor);
        if (ok) {
          this.ctx.log.info('floor.rollback');
          this.lastEvent.delete(slotKey(listId, row.shard));
          this.dropInFlight(f.id);
          rolled = true;
        }
      } else {
        // Stap 3: wachten in plaats van roteren; heruitzendtimer per slot.
        const rejecting = [...f.answers.entries()].filter(([, a]) => a.kind === 'rejected' && a.reason === 'clock-ahead').map(([ep]) => ep);
        if (rejecting.length > 0) this.scheduleResend(f, rejecting);
      }
    }
    return rolled;
  }

  /** B-1 (a)(b)(c): elke relay uit de set gaf clock-ahead, niemand accepteerde, niemand leverde. */
  private provenAbsent(f: InFlight): boolean {
    const eps = this.ctx.transport.endpoints;
    if (eps.length === 0 || f.deliveredBy.size > 0) return false;
    for (const a of f.answers.values()) if (a.kind === 'accepted') return false;
    return eps.every((ep) => {
      const a = f.answers.get(ep);
      return a?.kind === 'rejected' && a.reason === 'clock-ahead';
    });
  }

  private scheduleResend(f: InFlight, eps: EndpointId[]): void {
    const key = slotKey(f.listId, f.shard);
    if (this.resendTimers.has(key)) return;
    const waitSec = f.version - 240 - this.nowAdj();
    const delay = Math.max(30_000, waitSec * 1000);
    const t = this.ctx.timers.setTimeout(() => {
      this.resendTimers.delete(key);
      if (this.ctx.state.paused || this.ctx.state.closed) return;
      if (this.lastEvent.get(key) !== f.id) return;
      this.sendTo(f.id, eps.filter((ep) => this.ctx.transport.isOpen(ep)));
    }, delay);
    this.resendTimers.set(key, t);
  }

  private cancelResend(key: string): void {
    const t = this.resendTimers.get(key);
    if (t !== undefined) {
      this.ctx.timers.clearTimeout(t);
      this.resendTimers.delete(key);
    }
  }

  // ---------------------------------------------------------------- status (S-17)

  private updateFailing(listId: string): void {
    const lo = this.lastOutcome.get(listId);
    const open = this.openEndpoints();
    if (!lo || open.length === 0) return;
    const failing = open.every((ep) => {
      const o = lo.get(ep);
      if (!o) return false;
      if (o.kind === 'rejected') return true;
      if (o.kind === 'timeout') return this.ctx.config.timeoutsCountAsFailure;
      return false;
    });
    if (!failing) {
      if ([...lo.values()].some((o) => o.kind === 'accepted')) this.failingSince.set(listId, null);
      return;
    }
    const explicit = open.some((ep) => lo.get(ep)?.kind === 'rejected');
    this.failingReason.set(listId, explicit ? 'geweigerd' : 'geen-antwoord');
    if ((this.failingSince.get(listId) ?? null) === null) {
      this.failingSince.set(listId, this.now());
      // Na failingAfterMs opnieuw de status bepalen (overgang naar `fout`). Bijgehouden, zodat cancelAll hem wist.
      const old = this.failingTimers.get(listId);
      if (old !== undefined) this.ctx.timers.clearTimeout(old);
      this.failingTimers.set(
        listId,
        this.ctx.timers.setTimeout(() => {
          this.failingTimers.delete(listId);
          this.ctx.statusDirty(listId);
        }, this.ctx.config.failingAfterMs + 5),
      );
    }
  }

  hasInFlight(listId: string): boolean {
    for (const f of this.inflight.values()) {
      if (f.listId !== listId) continue;
      if (this.lastEvent.get(slotKey(listId, f.shard)) !== f.id) continue;
      if ([...f.answers.values()].some((a) => a.kind === 'accepted')) continue;
      if (this.outstanding(f).length > 0) return true;
    }
    return false;
  }

  /** Wacht (max ms) tot er geen events meer onderweg zijn (achtergrond, §11). */
  async waitForAcks(ms: number): Promise<void> {
    const deadline = this.now() + ms;
    const pending = () => [...this.inflight.values()].some((f) => !f.superseded && this.outstanding(f).length > 0);
    while (pending() && this.now() < deadline && !this.ctx.state.closed) {
      await new Promise<void>((resolve) => {
        const done = () => {
          this.answerWaiters.delete(done);
          this.ctx.timers.clearTimeout(t);
          resolve();
        };
        const t = this.ctx.timers.setTimeout(done, Math.max(1, deadline - this.now()));
        this.answerWaiters.add(done);
      });
    }
  }

  /** Haast (achtergrond): wachtende klokbeslissingen en ack-wachters direct wekken. */
  urge(): void {
    for (const w of [...this.answerWaiters]) w();
  }

  /** Alle timers stoppen (achtergrond/shutdown). Wachtende retries vervallen (§11). */
  cancelAll(): void {
    for (const p of this.pubs.values()) {
      if (p.timer !== null) this.ctx.timers.clearTimeout(p.timer);
      p.timer = null;
    }
    for (const r of this.retries.values()) if (r.timer) this.ctx.timers.clearTimeout(r.timer);
    this.retries.clear();
    for (const t of this.resendTimers.values()) this.ctx.timers.clearTimeout(t);
    this.resendTimers.clear();
    for (const t of this.failingTimers.values()) this.ctx.timers.clearTimeout(t);
    this.failingTimers.clear();
    for (const w of [...this.answerWaiters]) w();
  }

  forgetList(listId: string): void {
    const p = this.pubs.get(listId);
    if (p?.timer) this.ctx.timers.clearTimeout(p.timer);
    this.pubs.delete(listId);
    for (const [id, f] of this.inflight) if (f.listId === listId) this.dropInFlight(id);
    for (const key of [...this.lastEvent.keys()]) if (key.startsWith(listId + '#')) this.lastEvent.delete(key);
    for (const key of [...this.resendTimers.keys()]) if (key.startsWith(listId + '#')) this.cancelResend(key);
    this.lastOutcome.delete(listId);
    this.failingSince.delete(listId);
    const ft = this.failingTimers.get(listId);
    if (ft !== undefined) this.ctx.timers.clearTimeout(ft);
    this.failingTimers.delete(listId);
  }

  currentEvent(listId: string, shard: number): string | undefined {
    return this.lastEvent.get(slotKey(listId, shard));
  }
}

/**
 * Doel van een keten-terugrol (D-03, review bevinding 7): volg de echte voorgangers (`prevId`) zolang elke voorganger
 * precies de vloer bepaalde (`version === newFloor`) en aantoonbaar nergens staat. Geeft de nieuwe vloer en of de keten
 * een klok-afgeleid event bevat (voorwaarde tegen een lus).
 */
export function rollbackTarget(
  f: Pick<InFlight, 'floorBefore' | 'clockDerived' | 'prevId'>,
  get: (id: string) => Pick<InFlight, 'version' | 'floorBefore' | 'clockDerived' | 'prevId'> | undefined,
  provenAbsent: (x: never) => boolean,
): { newFloor: number; sawClockDerived: boolean } {
  let newFloor = f.floorBefore;
  let saw = f.clockDerived;
  let cur = f;
  for (let guard = 0; guard < 64 && cur.prevId; guard++) {
    const prev = get(cur.prevId);
    if (!prev || prev.version !== newFloor || !provenAbsent(prev as never)) break;
    saw = saw || prev.clockDerived;
    newFloor = prev.floorBefore;
    cur = prev;
  }
  return { newFloor, sawClockDerived: saw };
}

function errName(e: unknown): string {
  return e instanceof Error ? e.name : 'unknown';
}
