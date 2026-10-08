// Start de app (createApp → init), maakt de UI-store en bindt AppState/NetInfo (§11). De rest van de UI leest de store.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Alert, Platform } from 'react-native';
import { getRandomBytes } from 'expo-crypto';
import { useStore } from 'zustand';
import { createApp } from '../service/createApp';
import type { BootschapApp } from '../service/BootschapApp';
import type { Timers } from '../core/types';
import { runSelfTest } from '../selftest';
import { createUiStore, type UiState, type UiStore } from './store';
import type { AlertFn } from './confirm';
import { strings } from './strings.nl';
import { bindAppState } from './platform/appState';
import { bindNetInfo } from './platform/netInfo';
import { uiTimers } from './platform/timers';

const Ctx = createContext<UiStore | null>(null);

export const nativeAlert: AlertFn = (title, message, buttons) =>
  Alert.alert(title, message, buttons, { cancelable: Platform.OS !== 'android' ? true : false });

export interface AppProviderDeps {
  create: () => Promise<BootschapApp>;
  alert: AlertFn;
  timers: Timers;
  bind?: (app: BootschapApp) => (() => void)[];
  selftest?: () => void;
}

const defaultDeps: AppProviderDeps = {
  create: () =>
    createApp(undefined, {
      defaultListName: strings.defaultListName,
      sharedListPlaceholderName: strings.sharedListPlaceholderName,
      shareWarning: strings.shareWarning,
    }),
  alert: nativeAlert,
  timers: uiTimers,
  bind: (app) => [bindAppState(app), bindNetInfo(app)],
  selftest: () =>
    runSelfTest({ bytes: (n) => getRandomBytes(n) }, {
      info: (c) => console.log(c),
      warn: (c) => console.warn(c),
      error: (c) => console.warn(c),
    }),
};

export function AppProvider({
  children,
  fallback,
  deps = defaultDeps,
}: {
  children: ReactNode;
  fallback: (state: 'loading' | 'error', retry: () => void) => ReactNode;
  deps?: AppProviderDeps;
}) {
  const [store, setStore] = useState<UiStore | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    let app: BootschapApp | null = null;
    const unsubs: (() => void)[] = [];
    setFailed(false);
    (async () => {
      app = await deps.create();
      await app.init();
      // Review K-3: tijdens het starten al opgeruimd (Fast Refresh) → deze instantie meteen afsluiten.
      if (!alive) {
        await app.shutdown().catch(() => {});
        return;
      }
      const st = createUiStore(app, { alert: deps.alert, timers: deps.timers });
      if (deps.bind) unsubs.push(...deps.bind(app));
      setStore(st);
      deps.selftest?.();
    })().catch(() => {
      if (alive) setFailed(true);
      void app?.shutdown().catch(() => {});
    });
    return () => {
      alive = false;
      for (const u of unsubs) u();
      // Review K-3: geen tweede BootschapApp naast deze (eigen SQLite-verbinding, sockets) na Fast Refresh.
      if (app) void app.shutdown().catch(() => {});
      setStore(null);
    };
  }, [attempt, deps]);
  // Review K-7: na een startfout opnieuw proberen zonder de app te herstarten.
  if (!store) return <>{fallback(failed ? 'error' : 'loading', () => setAttempt((a) => a + 1))}</>;
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useUi(): UiStore {
  const s = useContext(Ctx);
  if (!s) throw new Error('AppProvider ontbreekt');
  return s;
}

export function useUiState<T>(selector: (s: UiState) => T): T {
  return useStore(useUi(), selector);
}
