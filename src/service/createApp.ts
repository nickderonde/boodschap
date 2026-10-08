// Productiebedrading (§11): Expo-drivers, echte klok/timers, expo-crypto als Random, NostrTransport op de
// WebSocket van React Native. Alleen dit bestand (en src/ui/platform) mag globale tijd, timers en crypto gebruiken.
import { getRandomBytes } from 'expo-crypto';
import { makeConfig, type Config } from '../config';
import type { Logger, Random, Timers } from '../core/types';
import { openExpoSqliteDriver } from '../storage/ExpoSqliteDriver';
import { expoSecureKeyStore } from '../storage/ExpoSecureKeyStore';
import { createNostrTransport } from '../sync/transports/nostr/NostrTransport';
import type { WebSocketLike } from '../sync/transports/nostr/RelayConnection';
import { createBootschapApp, type BootschapApp } from './BootschapApp';

const timers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

const random: Random = { bytes: (n) => getRandomBytes(n) };

/** Logger zonder inhoud (NF-05): alleen codes en tellers, en alleen in ontwikkelbuilds naar de console. */
const devLogger: Logger = {
  info: () => {},
  warn: (code, data) => {
    if (__DEV__) console.warn(code, data ?? '');
  },
  error: (code, data) => {
    if (__DEV__) console.warn(code, data ?? '');
  },
};

export async function createApp(over?: Partial<Config>, strings?: { defaultListName: string; sharedListPlaceholderName: string; shareWarning: string }): Promise<BootschapApp> {
  const config = makeConfig(over);
  const db = await openExpoSqliteDriver('bootschap.db');
  return createBootschapApp({
    db,
    keys: expoSecureKeyStore,
    clock: { nowMs: () => Date.now() },
    timers,
    random,
    log: devLogger,
    config,
    strings,
    transport: (relays) =>
      createNostrTransport({
        relays,
        wsFactory: (url) => new WebSocket(url) as unknown as WebSocketLike,
        clock: { nowMs: () => Date.now() },
        timers,
        log: devLogger,
        publishTimeoutMs: config.publishTimeoutMs,
        connectTimeoutMs: config.connectTimeoutMs,
        backoffMaxMs: config.backoffMaxMs,
      }),
  });
}
