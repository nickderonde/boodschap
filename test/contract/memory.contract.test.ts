// S-19: de contractsuite tegen MemoryTransport + MemoryHub (virtuele tijd).
import { defineTransportContract } from './transport.contract';
import { MemoryHub } from '../../src/sync/transports/memory/MemoryHub';
import { createMemoryTransport } from '../../src/sync/transports/memory/MemoryTransport';
import { VirtualScheduler } from '../support/VirtualScheduler';
import { SeededRandom } from '../support/SeededRandom';

defineTransportContract({
  name: 'MemoryTransport',
  async setup() {
    const sched = new VirtualScheduler();
    const hub = new MemoryHub(sched.clock(), sched.timers('hub'));
    const names = ['wss://m1.test', 'wss://m2.test'];
    for (const n of names) hub.relay(n);
    const rnd = new SeededRandom(11);
    const secrets = new Map<number, Uint8Array>();
    return {
      make: (name) => createMemoryTransport(hub, { endpoints: names, clock: sched.clock(), timers: sched.timers(name), device: name }),
      relays: names.map((n) => ({ name: n, setDown: (d: boolean) => hub.relay(n).setDown(d), wipe: () => hub.relay(n).wipe() })),
      tick: (ms) => sched.advance(ms),
      teardown: async () => {},
      secret: (n) => {
        if (!secrets.has(n)) secrets.set(n, rnd.bytes(32));
        return secrets.get(n)!;
      },
    };
  },
});
