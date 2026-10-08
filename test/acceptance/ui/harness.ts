// Gedeelde hulpmiddelen voor de UI-acceptatietests (Eindtester). Schermen draaien met de ECHTE facade (BootschapApp op
// node:sqlite), de echte UI-store en de echte componenten; alleen expo-router, de camera, het klembord en het
// besturingssysteem-dialoog zijn vervangen door dubbelgangers.
import { createUiStore, type UiStore } from '../../../src/ui/store';
import type { AlertButton } from '../../../src/ui/confirm';
import type { BootschapAppImpl } from '../../../src/service/BootschapApp';

export interface RecordedAlert {
  title: string;
  message: string;
  buttons: AlertButton[];
}

export const ctx: { store: UiStore | null; params: Record<string, string>; alerts: RecordedAlert[]; clipboard: string; camera: { granted: boolean; canAskAgain: boolean } } = {
  store: null,
  params: {},
  alerts: [],
  clipboard: '',
  camera: { granted: false, canAskAgain: true },
};

export const router = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };

export const nativeAlert = (title: string, message: string, buttons: AlertButton[]): void => {
  ctx.alerts.push({ title, message, buttons });
};

/** Timers die niets uit zichzelf afvuren (snackbar verloopt alleen als de test dat wil). */
export const manualTimers = (() => {
  const pending = new Map<number, () => void>();
  let seq = 0;
  return {
    setTimeout(fn: () => void): unknown {
      pending.set(++seq, fn);
      return seq;
    },
    clearTimeout(h: unknown): void {
      pending.delete(h as number);
    },
    fireAll(): void {
      const fns = [...pending.values()];
      pending.clear();
      for (const f of fns) f();
    },
  };
})();

export function resetUi(): void {
  ctx.alerts = [];
  ctx.params = {};
  ctx.clipboard = '';
  ctx.camera = { granted: false, canAskAgain: true };
  router.push.mockClear();
  router.replace.mockClear();
  router.back.mockClear();
}

export function makeStore(app: BootschapAppImpl): UiStore {
  const store = createUiStore(app, { alert: nativeAlert, timers: manualTimers });
  ctx.store = store;
  return store;
}

/** Drukt op een knop van het laatst getoonde systeemdialoog. */
export function pressAlertButton(label: string): void {
  const a = ctx.alerts[ctx.alerts.length - 1];
  if (!a) throw new Error('geen dialoog getoond');
  const b = a.buttons.find((x) => x.text === label);
  if (!b) throw new Error(`knop "${label}" niet gevonden; wel: ${a.buttons.map((x) => x.text).join(' | ')}`);
  b.onPress?.();
}
