// Gesimuleerde apparaten (§13.3): eigen opslag (node:sqlite), eigen klok (offset), eigen KeyStore, SeededRandom die
// over herstarts doorloopt (I-2), KillSwitch per instantie, en een transport naar de MemoryHub (of een WS-fabriek).
import type { DatabaseSync } from 'node:sqlite';
import { BootschapAppImpl } from '../../src/service/BootschapApp';
import type { Config } from '../../src/config';
import type { Clock, Timers } from '../../src/core/types';
import type { Transport } from '../../src/sync/Transport';
import type { FaultPoint, Faults } from '../../src/sync/engine/context';
import { createMemoryTransport, type MemoryTransport } from '../../src/sync/transports/memory/MemoryTransport';
import type { MemoryHub } from '../../src/sync/transports/memory/MemoryHub';
import { NodeSqliteDriver } from '../support/NodeSqliteDriver';
import { MemoryKeyStore } from '../support/MemoryKeyStore';
import { MemoryDeviceMarker } from '../support/MemoryDeviceMarker';
import { SeededRandom } from '../support/SeededRandom';
import { KillSwitch } from '../support/KillSwitch';
import { CapturingLogger } from '../support/CapturingLogger';
import { drainMicrotasks, type VirtualScheduler } from '../support/VirtualScheduler';

export interface DeviceOptions {
  name: string;
  /** Hub-modus: virtuele tijd. */
  hub?: MemoryHub;
  scheduler?: VirtualScheduler;
  endpoints?: string[];
  /** WS-modus: een transportfabriek (NostrTransport) met echte timers. */
  transportFactory?: (deps: { clock: Clock; timers: Timers; relays: string[]; config: Partial<Config> }) => Transport & { kill?(): void; setOnline?(b: boolean): void };
  clock?: Clock & { offsetMs?: number };
  timers?: Timers;
  clockOffsetMs?: number;
  seed?: number;
  dbFile?: string;
  config?: Partial<Config>;
  /** De transport volgt de relays uit de database (hints, setRelays) i.p.v. de vaste `endpoints`. */
  dynamicRelays?: boolean;
  /** Een bestaande KeyStore (bijv. `restoredCopy()` voor een herstel uit een back-up, §19). */
  keys?: MemoryKeyStore;
  /** Device-only merkteken (D-50); standaard een nieuw, leeg merkteken per toestel. */
  deviceMarker?: MemoryDeviceMarker;
}

export interface TestDevice {
  name: string;
  app: BootschapAppImpl;
  clock: Clock & { offsetMs: number };
  keys: MemoryKeyStore;
  random: SeededRandom;
  log: CapturingLogger;
  incarnation: number;
  killSwitch: KillSwitch;
  transport(): (Transport & { kill?(): void; setOnline?(b: boolean): void }) | null;
  net: { online(b: boolean): void; isOnline(): boolean };
  /** Laat een crash optreden bij een faultpunt (eenmalig). */
  crashAt(point: FaultPoint | null): void;
  kill(): void;
  restart(): Promise<void>;
  shutdown(): Promise<void>;
}

export async function createTestDevice(o: DeviceOptions): Promise<TestDevice> {
  const keys = o.keys ?? new MemoryKeyStore();
  const deviceMarker = o.deviceMarker ?? new MemoryDeviceMarker();
  const random = new SeededRandom(o.seed ?? hashName(o.name));
  const log = new CapturingLogger();
  const offsetClock = o.clock ?? (o.scheduler ? o.scheduler.clock(o.clockOffsetMs ?? 0) : realClock(o.clockOffsetMs ?? 0));
  const clock = offsetClock as Clock & { offsetMs: number };
  if (clock.offsetMs === undefined) clock.offsetMs = o.clockOffsetMs ?? 0;
  const file = o.dbFile ?? ':memory:';
  let handle: DatabaseSync | null = null;
  let online = true;
  let pendingCrash: FaultPoint | null = null;

  const dev = {
    name: o.name,
    clock,
    keys,
    random,
    log,
    incarnation: 0,
  } as TestDevice;

  let current: { app: BootschapAppImpl; ks: KillSwitch; driver: NodeSqliteDriver; transport: (Transport & { kill?(): void; setOnline?(b: boolean): void }) | null } | null = null;

  const boot = async () => {
    const ks = new KillSwitch();
    const driver = new NodeSqliteDriver(file, file === ':memory:' && handle ? handle : undefined);
    if (file === ':memory:') handle = driver.rawHandle;
    const baseTimers: Timers = o.timers ?? (o.scheduler ? o.scheduler.timers(`${o.name}#${dev.incarnation}`) : (undefined as never));
    const timers = ks.timers(baseTimers);
    let transport: (Transport & { kill?(): void; setOnline?(b: boolean): void }) | null = null;
    const faults: Faults = {
      at: async (point) => {
        if (pendingCrash === point) {
          pendingCrash = null;
          dev.kill();
          await new Promise<never>(() => {}); // de zombie bevriest hier
        }
      },
    };
    const app = new BootschapAppImpl({
      db: ks.driver(driver),
      keys: ks.keys(keys),
      deviceMarker,
      clock,
      timers,
      random,
      log: ks.logger(log),
      config: { ...(o.config ?? {}) },
      faults,
      transport: (relays) => {
        if (o.hub) {
          transport = createMemoryTransport(o.hub, { endpoints: o.dynamicRelays ? relays : (o.endpoints ?? relays), clock, timers, device: o.name, publishTimeoutMs: o.config?.publishTimeoutMs ?? 8000 }) as MemoryTransport;
        } else if (o.transportFactory) {
          transport = o.transportFactory({ clock, timers, relays: o.dynamicRelays ? relays : (o.endpoints ?? relays), config: o.config ?? {} });
        } else {
          throw new Error('geen transport');
        }
        if (!online) transport.setOnline?.(false);
        current!.transport = transport;
        return transport;
      },
    });
    ks.whenKilled(() => {
      current?.transport?.kill?.();
      driver.hardClose();
    });
    current = { app, ks, driver, transport: null };
    await app.init();
    if (o.endpoints) {
      // Relays van dit apparaat vastzetten (vervangt de standaardrelays).
      const have = await app.relays();
      if (have.join() !== o.endpoints.join()) await app.setRelays(o.endpoints);
    }
    await app.whenSyncStarted();
  };

  Object.defineProperty(dev, 'app', { get: () => current!.app });
  Object.defineProperty(dev, 'killSwitch', { get: () => current!.ks });
  dev.transport = () => current?.transport ?? null;
  dev.net = {
    online(b: boolean) {
      online = b;
      current?.transport?.setOnline?.(b);
      if (b) current?.app.networkRestored();
    },
    isOnline: () => online,
  };
  dev.crashAt = (p) => {
    pendingCrash = p;
  };
  dev.kill = () => {
    current?.ks.kill();
  };
  dev.restart = async () => {
    if (current && !current.ks.killed) current.ks.kill();
    await drainMicrotasks(2);
    dev.incarnation++;
    await boot();
  };
  dev.shutdown = async () => {
    if (current && !current.ks.killed) {
      await current.app.shutdown().catch(() => {});
      current.ks.kill();
    }
  };
  await boot();
  return dev;
}

function realClock(offsetMs: number): Clock & { offsetMs: number } {
  return {
    offsetMs,
    nowMs() {
      return Date.now() + this.offsetMs;
    },
  };
}

function hashName(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
