// Echte timers voor de UI-laag (snackbar). Alleen src/ui/platform mag globale timers gebruiken (§2).
import type { Clock, Timers } from '../../core/types';

export const uiTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export const wallClock: Clock = { nowMs: () => Date.now() };
