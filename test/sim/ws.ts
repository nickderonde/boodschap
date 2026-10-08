// WS-wereld: echte WsTestRelays op localhost, NostrTransport met een schakelbare WebSocketFactory (vliegtuigmodus) en
// echte timers. Voor de M3b-tests (S-03, S-08, S-09, S-10, S-12…).
import WebSocket from 'ws';
import { createNostrTransport } from '../../src/sync/transports/nostr/NostrTransport';
import type { WebSocketFactory, WebSocketLike } from '../../src/sync/transports/nostr/RelayConnection';
import { WsTestRelay } from '../relay/WsTestRelay';
import { realTimers } from '../support/VirtualScheduler';
import { createTestDevice, type TestDevice } from './device';
import type { Config } from '../../src/config';

/** Snellere vensters voor tests die niet over latentie/debounce gaan (§13.3: "andere tests mogen 50 ms gebruiken"). */
export const FAST: Partial<Config> = { localWindowMs: 50, remoteWindowMs: 100, minFlushGapMs: 50, statusThrottleMs: 20, joinTimeoutMs: 10_000, allowInsecureRelays: true };

export class SwitchableWsFactory {
  online = true;
  readonly urls: string[] = [];
  private readonly sockets = new Set<WebSocket>();

  readonly factory: WebSocketFactory = (url) => {
    this.urls.push(url);
    if (!this.online) return offlineSocket();
    const ws = new WebSocket(url);
    this.sockets.add(ws);
    ws.on('close', () => this.sockets.delete(ws));
    ws.on('error', () => {});
    return ws as unknown as WebSocketLike;
  };

  setOnline(b: boolean): void {
    this.online = b;
    if (!b) for (const s of [...this.sockets]) s.terminate();
  }

  get openSockets(): number {
    return [...this.sockets].filter((s) => s.readyState === WebSocket.OPEN || s.readyState === WebSocket.CONNECTING).length;
  }
}

function offlineSocket(): WebSocketLike {
  const s: WebSocketLike = {
    readyState: 3,
    send() {},
    close() {},
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
  };
  setTimeout(() => s.onerror?.({}), 5);
  return s;
}

export interface WsWorld {
  relays: WsTestRelay[];
  urls: string[];
  devices: TestDevice[];
  factories: Map<TestDevice, SwitchableWsFactory>;
  stop(): Promise<void>;
}

export async function makeWsWorld(nRelays = 3): Promise<WsWorld> {
  const relays: WsTestRelay[] = [];
  for (let i = 0; i < nRelays; i++) relays.push(await WsTestRelay.start());
  const w: WsWorld = {
    relays,
    urls: relays.map((r) => r.url),
    devices: [],
    factories: new Map(),
    stop: async () => {
      for (const d of w.devices) await d.shutdown().catch(() => {});
      for (const r of relays) await r.stop();
    },
  };
  return w;
}

export async function addWsDevice(w: WsWorld, name: string, o: { clockOffsetMs?: number; config?: Partial<Config>; dbFile?: string; endpoints?: string[]; dynamicRelays?: boolean } = {}): Promise<TestDevice> {
  const net = new SwitchableWsFactory();
  const d = await createTestDevice({
    name,
    endpoints: o.endpoints ?? w.urls,
    dynamicRelays: o.dynamicRelays,
    timers: realTimers,
    clockOffsetMs: o.clockOffsetMs,
    dbFile: o.dbFile,
    config: { ...FAST, ...(o.config ?? {}) },
    transportFactory: ({ clock, timers, relays, config }) => {
      const t = createNostrTransport({
        relays, wsFactory: net.factory, clock, timers,
        publishTimeoutMs: config.publishTimeoutMs, connectTimeoutMs: config.connectTimeoutMs, backoffMaxMs: config.backoffMaxMs,
      });
      return Object.assign(t, { setOnline: (b: boolean) => net.setOnline(b) });
    },
  });
  w.devices.push(d);
  w.factories.set(d, net);
  return d;
}

export async function waitFor(cond: () => boolean | Promise<boolean>, timeoutMs = 10_000, stepMs = 25): Promise<number> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await cond()) return Date.now() - t0;
    await new Promise((r) => setTimeout(r, stepMs));
  }
  throw new Error(`waitFor: time-out na ${timeoutMs} ms`);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function names(d: TestDevice, listId: string): string[] {
  return d.app
    .view(listId)
    .sections.flatMap((s) => s.items.map((i) => i.name))
    .sort();
}

/** A deelt zijn eerste lijst; de anderen koppelen en wachten tot het koppelen klaar is. */
export async function wsShareAndJoin(a: TestDevice, others: TestDevice[]): Promise<Map<TestDevice, string>> {
  const ids = new Map<TestDevice, string>();
  const listId = a.app.lists()[0].id;
  ids.set(a, listId);
  const info = await a.app.share(listId);
  await waitFor(async () => (await a.app.shareInfo(listId)).ready);
  for (const o of others) {
    const r = await o.app.join(info.text);
    if (r.kind === 'error') throw new Error('join: ' + r.code);
    ids.set(o, r.listId);
    await waitFor(() => !o.app.syncStatus(r.listId).fetching);
  }
  return ids;
}
