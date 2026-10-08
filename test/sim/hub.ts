// Helpers voor hub-scenario's: een gedeelde wereld (scheduler + hub + relays) en apparaten die een lijst delen.
import type { MemoryKeyStore } from '../support/MemoryKeyStore';
import { MemoryHub } from '../../src/sync/transports/memory/MemoryHub';
import { VirtualScheduler } from '../support/VirtualScheduler';
import { createTestDevice, type TestDevice } from './device';
import type { Config } from '../../src/config';

export const RELAYS = ['wss://r1.test', 'wss://r2.test', 'wss://r3.test'];

export interface World {
  sched: VirtualScheduler;
  hub: MemoryHub;
  devices: TestDevice[];
  settle(maxMs?: number): Promise<void>;
}

export async function makeWorld(opts: { relays?: string[]; seed?: number } = {}): Promise<World> {
  const sched = new VirtualScheduler();
  const hub = new MemoryHub(sched.clock(0), sched.timers('hub'), opts.seed ?? 1);
  for (const r of opts.relays ?? RELAYS) hub.relay(r);
  const w: World = {
    sched,
    hub,
    devices: [],
    settle: (maxMs = 120_000) => sched.advance(maxMs),
  };
  return w;
}

export async function addDevice(
  w: World,
  name: string,
  o: { clockOffsetMs?: number; config?: Partial<Config>; endpoints?: string[]; seed?: number; dbFile?: string; keys?: MemoryKeyStore } = {},
): Promise<TestDevice> {
  const d = await createTestDevice({
    name,
    hub: w.hub,
    scheduler: w.sched,
    endpoints: o.endpoints ?? [...w.hub.relays.keys()],
    clockOffsetMs: o.clockOffsetMs,
    seed: o.seed,
    dbFile: o.dbFile,
    keys: o.keys,
    config: { localWindowMs: 1000, ...(o.config ?? {}) },
  });
  w.devices.push(d);
  return d;
}

/** A deelt zijn eerste lijst; de anderen koppelen. Geeft de lokale lijst-ID per apparaat terug. */
export async function shareAndJoin(w: World, a: TestDevice, others: TestDevice[]): Promise<Map<TestDevice, string>> {
  const ids = new Map<TestDevice, string>();
  const listId = a.app.lists()[0].id;
  ids.set(a, listId);
  const info = await a.app.share(listId);
  await w.settle(5_000);
  for (const o of others) {
    const r = await o.app.join(info.text);
    if (r.kind === 'error') throw new Error('join faalde: ' + r.code);
    ids.set(o, r.listId);
  }
  await w.settle(30_000);
  return ids;
}

export function names(d: TestDevice, listId: string): string[] {
  return d.app
    .view(listId)
    .sections.flatMap((s) => s.items.map((i) => i.name))
    .sort();
}
