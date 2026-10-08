// Eén relayverbinding (§6.10) op een geïnjecteerde WebSocketFactory. Geen nostr-tools/relay of SimplePool:
// volledige controle over backoff, OK-redenen en status. Toestanden: idle → connecting → open → backoff → … en paused.
import type { Logger, Timers } from '../../../core/types';
import type { PublishOutcome } from '../../Transport';
import { classifyOk } from './okReason';

export interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

export type ConnState = 'idle' | 'connecting' | 'open' | 'backoff' | 'paused' | 'closed';

export interface RelayConnectionEvents {
  state(s: ConnState, firstAttempt: boolean): void;
  message(subId: string, event: unknown, rawLength: number): void;
  eose(subId: string): void;
  outcome(eventId: string, o: PublishOutcome): void;
  closedSub(subId: string): void;
}

export interface RelayConnectionOptions {
  url: string;
  wsFactory: WebSocketFactory;
  timers: Timers;
  log: Logger;
  events: RelayConnectionEvents;
  connectTimeoutMs: number;
  publishTimeoutMs: number;
  backoffMaxMs: number;
  /** Getal in [0,1) voor jitter; deterministisch in tests. */
  jitter: () => number;
}

export class RelayConnection {
  state: ConnState = 'idle';
  private ws: WebSocketLike | null = null;
  private attempt = 0;
  private timer: unknown = null;
  private connectTimer: unknown = null;
  private readonly pending = new Map<string, unknown>(); // eventId → time-out-timer
  private firstAttempt = true;
  /** Laatst verzonden REQ-frame (opnieuw na open). */
  private reqFrame: string | null = null;
  private reqId: string | null = null;

  constructor(private readonly o: RelayConnectionOptions) {}

  get url(): string {
    return this.o.url;
  }

  isOpen(): boolean {
    return this.state === 'open';
  }

  private setState(s: ConnState): void {
    this.state = s;
    this.o.events.state(s, this.firstAttempt);
  }

  connect(first = false): void {
    if (this.state === 'open' || this.state === 'connecting') return;
    if (this.timer !== null) {
      this.o.timers.clearTimeout(this.timer);
      this.timer = null;
    }
    if (first) this.firstAttempt = true;
    this.setState('connecting');
    let ws: WebSocketLike;
    try {
      ws = this.o.wsFactory(this.o.url);
    } catch {
      this.failed();
      return;
    }
    this.ws = ws;
    const connectTimer = (this.connectTimer = this.o.timers.setTimeout(() => {
      if (this.ws === ws && this.state === 'connecting') {
        this.o.log.warn('relay.connect-timeout');
        this.drop(ws);
      }
    }, this.o.connectTimeoutMs));
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.o.timers.clearTimeout(connectTimer);
      this.attempt = 0;
      this.firstAttempt = false;
      this.setState('open');
      if (this.reqFrame) this.raw(this.reqFrame);
    };
    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      const text = typeof ev.data === 'string' ? ev.data : String(ev.data);
      this.onFrame(text);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.o.timers.clearTimeout(connectTimer);
      this.drop(ws);
    };
    ws.onerror = () => {
      if (this.ws !== ws) return;
      this.o.timers.clearTimeout(connectTimer);
      this.drop(ws);
    };
  }

  private drop(ws: WebSocketLike): void {
    if (this.ws !== ws) return;
    this.ws = null;
    try {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      ws.close();
    } catch {
      // negeren
    }
    this.failed();
  }

  private failed(): void {
    if (this.state === 'paused' || this.state === 'closed') return;
    this.setState('backoff');
    const base = Math.min(this.o.backoffMaxMs, 1000 * 2 ** this.attempt);
    const delay = Math.round(Math.min(this.o.backoffMaxMs * 1.2, base * (0.8 + 0.4 * this.o.jitter())));
    this.attempt++;
    this.timer = this.o.timers.setTimeout(() => {
      this.timer = null;
      this.connect(false);
    }, delay);
  }

  /** Volgende backoff-vertraging (voor tests van S-09). */
  get backoffAttempt(): number {
    return this.attempt;
  }

  /** Backoff afbreken en direct verbinden; als open: REQ opnieuw. */
  kick(): void {
    if (this.state === 'closed') return;
    // Al aan het verbinden: geen tweede socket openen (review bevinding 3).
    if (this.state === 'connecting') return;
    if (this.state === 'open') {
      if (this.reqFrame) this.raw(this.reqFrame);
      return;
    }
    this.attempt = 0;
    this.state = 'idle';
    this.connect(true);
  }

  pause(): void {
    if (this.timer !== null) this.o.timers.clearTimeout(this.timer);
    this.timer = null;
    if (this.connectTimer !== null) this.o.timers.clearTimeout(this.connectTimer);
    this.connectTimer = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      try {
        ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
        ws.close();
      } catch {
        // negeren
      }
    }
    for (const t of this.pending.values()) this.o.timers.clearTimeout(t);
    this.pending.clear();
    this.firstAttempt = true;
    this.setState('paused');
  }

  close(): void {
    this.pause();
    this.state = 'closed';
  }

  /** Stuurt een nieuw abonnement (CLOSE oud, REQ nieuw). Leeg filter → alleen CLOSE. */
  subscribe(subId: string, filters: unknown[] | null): void {
    if (this.reqId && this.state === 'open') this.raw(JSON.stringify(['CLOSE', this.reqId]));
    this.reqId = filters ? subId : null;
    this.reqFrame = filters ? JSON.stringify(['REQ', subId, ...filters]) : null;
    if (this.reqFrame && this.state === 'open') this.raw(this.reqFrame);
  }

  resubscribe(): void {
    if (this.reqFrame && this.state === 'open') this.raw(this.reqFrame);
  }

  publish(eventId: string, rawEvent: string): boolean {
    if (this.state !== 'open') return false;
    const prev = this.pending.get(eventId);
    if (prev !== undefined) this.o.timers.clearTimeout(prev);
    this.pending.set(
      eventId,
      this.o.timers.setTimeout(() => {
        if (this.pending.delete(eventId)) this.o.events.outcome(eventId, { kind: 'timeout' });
      }, this.o.publishTimeoutMs),
    );
    this.raw(`["EVENT",${rawEvent}]`);
    return true;
  }

  private raw(frame: string): void {
    try {
      this.ws?.send(frame);
    } catch {
      // de onclose volgt
    }
  }

  private onFrame(text: string): void {
    // S-14: een te groot frame wordt vóór het parsen genegeerd (event > 100.000 tekens + omhulsel).
    if (text.length > 100_200) {
      this.o.log.warn('recv.too-large');
      return;
    }
    let msg: unknown;
    try {
      msg = JSON.parse(text);
    } catch {
      this.o.log.warn('relay.bad-frame');
      return;
    }
    if (!Array.isArray(msg) || typeof msg[0] !== 'string') return;
    switch (msg[0]) {
      case 'EVENT':
        if (typeof msg[1] === 'string') this.o.events.message(msg[1], msg[2], text.length);
        break;
      case 'EOSE':
        if (typeof msg[1] === 'string') this.o.events.eose(msg[1]);
        break;
      case 'OK': {
        const id = msg[1];
        if (typeof id !== 'string') return;
        const t = this.pending.get(id);
        if (t === undefined) return;
        this.o.timers.clearTimeout(t);
        this.pending.delete(id);
        this.o.events.outcome(id, classifyOk(msg[2] === true, typeof msg[3] === 'string' ? msg[3] : ''));
        break;
      }
      case 'CLOSED':
        if (typeof msg[1] === 'string') this.o.events.closedSub(msg[1]);
        break;
      case 'NOTICE':
        this.o.log.info('relay.notice');
        break;
      default:
        // AUTH en onbekende berichten: negeren
        break;
    }
  }
}
