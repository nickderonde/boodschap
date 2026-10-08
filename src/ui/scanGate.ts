// Poort voor de QR-scanner (review K-4): één scan tegelijk, en na een mislukte koppeling eerst een pauze, zodat
// dezelfde QR niet direct opnieuw wordt verwerkt en de foutmelding niet knippert.
import type { Clock } from '../core/types';

export interface ScanGate {
  /** true als deze scan verwerkt mag worden (en blokkeert verdere scans). */
  tryAcquire(): boolean;
  /** Na een fout: pas na `cooldownMs` weer scannen. */
  failed(): void;
  /** Na succes of annuleren: meteen weer vrij. */
  release(): void;
}

export function createScanGate(clock: Clock, cooldownMs = 2000): ScanGate {
  let busy = false;
  let blockedUntil = 0;
  return {
    tryAcquire() {
      if (busy || clock.nowMs() < blockedUntil) return false;
      busy = true;
      return true;
    },
    failed() {
      busy = false;
      blockedUntil = clock.nowMs() + cooldownMs;
    },
    release() {
      busy = false;
      blockedUntil = 0;
    },
  };
}
