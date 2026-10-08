// S-19: de contractsuite tegen NostrTransport + WsTestRelay (echte WebSockets, echte timers).
import WebSocket from 'ws';
import { defineTransportContract } from './transport.contract';
import { createNostrTransport } from '../../src/sync/transports/nostr/NostrTransport';
import type { WebSocketLike } from '../../src/sync/transports/nostr/RelayConnection';
import { WsTestRelay } from '../relay/WsTestRelay';
import { realTimers } from '../support/VirtualScheduler';
import { SeededRandom } from '../support/SeededRandom';
import type { Transport } from '../../src/sync/Transport';

defineTransportContract({
  name: 'NostrTransport + WsTestRelay',
  async setup() {
    const relays = [await WsTestRelay.start(), await WsTestRelay.start()];
    for (const r of relays) r.futureToleranceSec = Infinity; // de contracttests gebruiken vaste versies
    const made: Transport[] = [];
    const rnd = new SeededRandom(12);
    const secrets = new Map<number, Uint8Array>();
    return {
      make: () => {
        const t = createNostrTransport({
          relays: relays.map((r) => r.url),
          wsFactory: (url) => new WebSocket(url) as unknown as WebSocketLike,
          clock: { nowMs: () => Date.now() },
          timers: realTimers,
          backoffMaxMs: 2_000,
        });
        made.push(t);
        return t;
      },
      relays: relays.map((r) => ({ name: r.url, setDown: (d: boolean) => r.setDown(d), wipe: () => r.wipe() })),
      tick: (ms) => new Promise((r) => setTimeout(r, ms)),
      teardown: async () => {
        for (const t of made) t.close();
        for (const r of relays) await r.stop();
      },
      secret: (n) => {
        if (!secrets.has(n)) secrets.set(n, rnd.bytes(32));
        return secrets.get(n)!;
      },
    };
  },
});
