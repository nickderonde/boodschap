// KillSwitch (§13.3, E-7, K-1): verpakt de dependencies van één apparaat-instantie. Na kill():
//  1. bevriest een zombie: een verpakte async-aanroep geeft een promise die nooit afloopt; een synchrone aanroep gooit
//     SimulatedCrash (setup-node negeert die in unhandledRejection);
//  2. worden alle timers van de instantie gewist en nieuwe geblokkeerd;
//  3. wordt de transport ontkoppeld (berichten van en naar de oude instantie vallen weg);
//  4. wordt de database-verbinding hard gesloten (een open transactie gaat verloren).
// Random wordt bewust NIET verpakt (I-2): de stroom loopt door over herstarts.
import type { Logger, Timers } from '../../src/core/types';
import type { KeyStore } from '../../src/storage/KeyStore';
import type { SqlDriver } from '../../src/storage/SqlDriver';
import { SimulatedCrash } from './CrashingSqlDriver';

const NEVER = () => new Promise<never>(() => {});

export class KillSwitch {
  killed = false;
  /** Aantal aanroepen ná de kill (moet 0 I/O opleveren; tellen voor device.test). */
  callsAfterKill = 0;
  private readonly onKill: (() => void)[] = [];
  private readonly timerHandles = new Set<unknown>();

  whenKilled(fn: () => void): void {
    this.onKill.push(fn);
  }

  kill(): void {
    if (this.killed) return;
    this.killed = true;
    for (const fn of this.onKill) {
      try {
        fn();
      } catch {
        // negeren
      }
    }
  }

  /** Kill bij het N-de volgende statement (midden in een transactie), of null. */
  killAfterStatements: number | null = null;

  driver(inner: SqlDriver): SqlDriver {
    const self = this;
    const guard = <T>(f: () => Promise<T>): Promise<T> => {
      if (!self.killed && self.killAfterStatements !== null) {
        self.killAfterStatements--;
        if (self.killAfterStatements <= 0) {
          self.killAfterStatements = null;
          self.kill();
        }
      }
      if (self.killed) {
        self.callsAfterKill++;
        return NEVER();
      }
      return f();
    };
    return {
      exec: (sql) => guard(() => inner.exec(sql)),
      run: (sql, p) => guard(() => inner.run(sql, p)),
      all: <T>(sql: string, p?: Parameters<SqlDriver['all']>[1]) => guard(() => inner.all<T>(sql, p)),
      close: () => guard(() => inner.close()),
    };
  }

  keys(inner: KeyStore): KeyStore {
    const g = <T>(f: () => Promise<T>): Promise<T> => {
      if (this.killed) {
        this.callsAfterKill++;
        return NEVER();
      }
      return f();
    };
    return { get: (k) => g(() => inner.get(k)), set: (k, v, o) => g(() => inner.set(k, v, o)), delete: (k) => g(() => inner.delete(k)) };
  }

  timers(inner: Timers): Timers {
    this.whenKilled(() => {
      for (const h of this.timerHandles) inner.clearTimeout(h);
      this.timerHandles.clear();
    });
    return {
      setTimeout: (fn, ms) => {
        if (this.killed) {
          // Geblokkeerd, maar niet gooien: een zombie bevriest zonder onbehandelde rejection (O-ET-02).
          this.callsAfterKill++;
          return null;
        }
        const h = inner.setTimeout(() => {
          this.timerHandles.delete(h);
          if (!this.killed) fn();
        }, ms);
        this.timerHandles.add(h);
        return h;
      },
      clearTimeout: (h) => {
        this.timerHandles.delete(h);
        inner.clearTimeout(h);
      },
    };
  }

  logger(inner: Logger): Logger {
    const w = (f: () => void) => {
      if (!this.killed) f();
    };
    return {
      info: (c, d) => w(() => inner.info(c, d)),
      warn: (c, d) => w(() => inner.warn(c, d)),
      error: (c, d) => w(() => inner.error(c, d)),
    };
  }
}
