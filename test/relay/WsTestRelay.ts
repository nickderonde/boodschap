// In-process WebSocket-test-relay rond RelayCore (§13.2, NF-12) met foutinjectie:
// down, dropConnections(), flap(ms), latencyMs (per richting), duplicate(n), reorder, wipe(), maxEventBytes,
// clockOffsetMs + futureToleranceSec + pastToleranceSec, silentDrop, refuse(prefix), rateLimitEvery, dumpEvents().
import { WebSocketServer, type WebSocket } from 'ws';
import { RelayCore, type Filter, type NEvent } from './RelayCore';

export interface WsRelayFaults {
  down: boolean;
  latencyMs: number;
  duplicate: number;
  reorder: boolean;
  silentDrop: boolean;
}

interface Client {
  ws: WebSocket;
  subs: Map<string, Filter[]>;
}

export class WsTestRelay {
  readonly core: RelayCore;
  readonly faults: WsRelayFaults = { down: false, latencyMs: 0, duplicate: 1, reorder: false, silentDrop: false };
  clockOffsetMs = 0;
  private readonly clients = new Set<Client>();
  private flapTimer: ReturnType<typeof setInterval> | null = null;
  /** Latentie-timers; stop() wist ze (review bevinding 6: geen open handles na de suite). */
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private stopped = false;
  received = 0;
  /** Alle ontvangen EVENT-frames (pubkey, id), ook stil gevallen. */
  readonly receivedLog: { pubkey: string; id: string }[] = [];
  connectionsAccepted = 0;

  private constructor(
    private readonly wss: WebSocketServer,
    readonly url: string,
  ) {
    this.core = new RelayCore({
      nowSec: () => Math.floor((Date.now() + this.clockOffsetMs) / 1000),
      maxEventBytes: 65_536,
      futureToleranceSec: 900,
      pastToleranceSec: Infinity,
      refuse: null,
      rateLimitEvery: 0,
      verifySignatures: true,
    });
    wss.on('connection', (ws) => this.onConnection(ws));
  }

  static async start(): Promise<WsTestRelay> {
    const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    await new Promise<void>((r) => wss.once('listening', () => r()));
    const port = (wss.address() as { port: number }).port;
    return new WsTestRelay(wss, `ws://127.0.0.1:${port}`);
  }

  // ---- foutknoppen
  setDown(down: boolean): void {
    this.faults.down = down;
    if (down) this.dropConnections();
  }
  dropConnections(): void {
    for (const c of [...this.clients]) c.ws.terminate();
    this.clients.clear();
  }
  flap(ms: number | null): void {
    if (this.flapTimer) clearInterval(this.flapTimer);
    this.flapTimer = null;
    if (ms) this.flapTimer = setInterval(() => this.setDown(!this.faults.down), ms);
    else this.setDown(false);
  }
  wipe(): void {
    this.core.wipe();
  }
  set maxEventBytes(n: number) {
    this.core.opts.maxEventBytes = n;
  }
  set futureToleranceSec(n: number) {
    this.core.opts.futureToleranceSec = n;
  }
  set pastToleranceSec(n: number) {
    this.core.opts.pastToleranceSec = n;
  }
  refuse(prefix: string | null): void {
    this.core.opts.refuse = prefix;
  }
  set rateLimitEvery(n: number) {
    this.core.opts.rateLimitEvery = n;
  }
  dumpEvents(): NEvent[] {
    return [...this.core.events.values()];
  }

  async stop(): Promise<void> {
    this.stopped = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    if (this.flapTimer) clearInterval(this.flapTimer);
    this.flapTimer = null;
    for (const c of this.clients) c.ws.terminate();
    await new Promise<void>((r) => this.wss.close(() => r()));
  }

  // ---- protocol
  private later(fn: () => void): void {
    if (this.stopped) return;
    if (this.faults.latencyMs > 0) {
      const t = setTimeout(() => {
        this.timers.delete(t);
        if (!this.stopped) fn();
      }, this.faults.latencyMs);
      this.timers.add(t);
    } else fn();
  }

  /** Aantal openstaande latentie-timers (voor de controle op open handles). */
  get pendingTimers(): number {
    return this.timers.size;
  }

  private send(c: Client, frame: unknown): void {
    this.later(() => {
      if (c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(frame));
    });
  }

  private onConnection(ws: WebSocket): void {
    if (this.faults.down) {
      ws.terminate();
      return;
    }
    this.connectionsAccepted++;
    const c: Client = { ws, subs: new Map() };
    this.clients.add(c);
    ws.on('message', (data) => {
      const text = data.toString();
      this.later(() => this.onFrame(c, text));
    });
    ws.on('close', () => this.clients.delete(c));
    ws.on('error', () => this.clients.delete(c));
  }

  private onFrame(c: Client, text: string): void {
    if (this.faults.down) return;
    let msg: unknown;
    try {
      msg = JSON.parse(text);
    } catch {
      this.send(c, ['NOTICE', 'error: bad json']);
      return;
    }
    if (!Array.isArray(msg)) return;
    if (msg[0] === 'EVENT') {
      this.received++;
      const ev = msg[1] as NEvent;
      this.receivedLog.push({ pubkey: ev?.pubkey, id: ev?.id });
      if (this.faults.silentDrop) return; // geen OK, geen opslag (zoals nos.lol)
      const rawBytes = Buffer.byteLength(JSON.stringify(ev));
      const verdict = this.core.handleEvent(ev, rawBytes);
      if (!verdict) return;
      this.send(c, ['OK', ev?.id ?? '', verdict.ok, verdict.message]);
      if (verdict.stored) this.fanOut(verdict.stored);
    } else if (msg[0] === 'REQ') {
      const subId = String(msg[1]);
      const filters = msg.slice(2) as Filter[];
      // Zoals strfry: een ongeldig filter → CLOSED, geen abonnement (review CR-03 R-1).
      const bad = filters.map((f) => RelayCore.invalidFilter(f)).find((e) => e !== null);
      if (bad) {
        this.send(c, ['CLOSED', subId, bad]);
        return;
      }
      c.subs.set(subId, filters);
      let evs = this.core.query(filters);
      if (this.faults.reorder) evs = evs.sort(() => (Math.random() < 0.5 ? -1 : 1));
      for (const e of evs) for (let i = 0; i < this.faults.duplicate; i++) this.send(c, ['EVENT', subId, e]);
      this.send(c, ['EOSE', subId]);
    } else if (msg[0] === 'CLOSE') {
      c.subs.delete(String(msg[1]));
    }
  }

  private fanOut(ev: NEvent): void {
    for (const c of this.clients) {
      for (const [subId, filters] of c.subs) {
        if (filters.some((f) => RelayCore.matches(f, ev))) for (let i = 0; i < this.faults.duplicate; i++) this.send(c, ['EVENT', subId, ev]);
      }
    }
  }
}
