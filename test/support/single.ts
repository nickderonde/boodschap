// Eén apparaat zonder sync (M2-tests): facade op node:sqlite, MemoryKeyStore, FakeClock en SeededRandom.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BootschapAppImpl, type AppDeps } from '../../src/service/BootschapApp';
import { NodeSqliteDriver } from './NodeSqliteDriver';
import { MemoryKeyStore } from './MemoryKeyStore';
import { FakeClock, realTimers } from './VirtualScheduler';
import { SeededRandom } from './SeededRandom';
import { CapturingLogger } from './CapturingLogger';
import type { SqlDriver } from '../../src/storage/SqlDriver';

export function tmpDbFile(name = 'bs'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bootschap-'));
  return path.join(dir, `${name}.db`);
}

export interface SingleDevice {
  app: BootschapAppImpl;
  clock: FakeClock;
  keys: MemoryKeyStore;
  random: SeededRandom;
  log: CapturingLogger;
  driver: SqlDriver;
  file: string;
  restart(wrap?: (d: SqlDriver) => SqlDriver): Promise<SingleDevice>;
}

export async function singleDevice(opts: { file?: string; seed?: number; wrap?: (d: SqlDriver) => SqlDriver; deps?: Partial<AppDeps> } = {}): Promise<SingleDevice> {
  const file = opts.file ?? ':memory:';
  const clock = new FakeClock();
  const keys = new MemoryKeyStore();
  const random = new SeededRandom(opts.seed ?? 1);
  const log = new CapturingLogger();
  const make = async (wrap?: (d: SqlDriver) => SqlDriver): Promise<SingleDevice> => {
    const raw = new NodeSqliteDriver(file);
    const driver = wrap ? wrap(raw) : raw;
    const app = new BootschapAppImpl({ db: driver, keys, clock, timers: realTimers, random, log, ...(opts.deps ?? {}) });
    await app.init();
    const dev: SingleDevice = {
      app, clock, keys, random, log, driver, file,
      restart: async (w) => {
        raw.hardClose();
        return make(w);
      },
    };
    return dev;
  };
  return make(opts.wrap);
}
