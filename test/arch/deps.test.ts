// NF-06 / NF-08: dependencies tegen de SDK-bundel, allowlist van native modules, denylist van tracking-SDK's.
import fs from 'node:fs';
import path from 'node:path';

/** Minimale semver-check voor de range-vormen in bundledNativeModules: exact, ~x.y.z en ^x.y.z. */
function parse(v: string): [number, number, number] {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
  if (!m) throw new Error('versie ' + v);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
function gte(a: [number, number, number], b: [number, number, number]): boolean {
  return a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] >= b[2];
}
function satisfies(version: string, range: string): boolean {
  const v = parse(version);
  if (range.startsWith('~')) {
    const r = parse(range.slice(1));
    return v[0] === r[0] && v[1] === r[1] && v[2] >= r[2];
  }
  if (range.startsWith('^')) {
    const r = parse(range.slice(1));
    return v[0] === r[0] && gte(v, r);
  }
  return version === range;
}
const semver = { satisfies, major: (v: string) => parse(v)[0] };

const ROOT = path.resolve(__dirname, '../..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const bundled: Record<string, string> = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules/expo/bundledNativeModules.json'), 'utf8'));
const installed = (name: string): string => JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', name, 'package.json'), 'utf8')).version;

/** Native modules die in Expo Go zitten en die we gebruiken (§4.1). Nieuwe alleen met akkoord van de Architect. */
const NATIVE_ALLOWLIST = new Set([
  'expo', 'react-native', 'expo-router', 'expo-linking', 'expo-constants', '@expo/metro-runtime', 'react-native-screens',
  'react-native-safe-area-context', 'react-native-reanimated', 'react-native-worklets', 'react-native-gesture-handler',
  'expo-status-bar', 'expo-sqlite', 'expo-secure-store', 'expo-crypto', 'expo-camera', 'expo-clipboard',
  '@react-native-community/netinfo', 'react-native-svg', 'expo-keep-awake', 'react', 'react-dom',
  // ST-04: opstartscherm met lichte en donkere variant (config-plugin; in Expo Go aanwezig).
  'expo-splash-screen', 'expo-system-ui',
  // D-50: device-only merkteken in de cache (iOS Library/Caches, niet in back-ups).
  'expo-file-system',
]);

/** Pure-JS dependencies (geen native code). */
const PURE_JS = new Set(['react-native-qrcode-svg', 'nostr-tools', '@noble/ciphers', '@noble/hashes', 'fflate', 'zustand']);

const DENY = /(analytics|sentry|crashlytics|firebase|amplitude|mixpanel|segment|bugsnag|admob|google-mobile-ads|appsflyer|adjust|datadog|newrelic|posthog|onesignal|branch)/i;

describe('Dependencies (NF-06, NF-08)', () => {
  const deps: Record<string, string> = pkg.dependencies;
  const all = { ...pkg.dependencies, ...pkg.devDependencies } as Record<string, string>;

  it('NF-08: elke dependency die in bundledNativeModules staat, valt binnen de SDK-range (geïnstalleerde versie)', () => {
    for (const name of Object.keys(all)) {
      if (!bundled[name]) continue;
      const v = installed(name);
      expect([name, v, semver.satisfies(v, bundled[name])]).toEqual([name, v, true]);
    }
  });

  it('NF-08: elke runtime-dependency is een toegestane Expo Go-module of pure JS', () => {
    for (const name of Object.keys(deps)) expect([name, NATIVE_ALLOWLIST.has(name) || PURE_JS.has(name)]).toEqual([name, true]);
  });

  it('NF-06: geen analytics-, crash- of advertentie-SDK in package.json', () => {
    for (const name of Object.keys(all)) expect([name, DENY.test(name)]).toEqual([name, false]);
  });

  it('§4.1: kritieke pins (E-1, E-2)', () => {
    expect(pkg.devDependencies['babel-preset-expo']).toBeDefined();
    expect(pkg.devDependencies['react-test-renderer']).toBe('19.2.3');
    expect(deps['react-dom']).toBe('19.2.3');
    expect(semver.major(installed('@babel/core'))).toBe(7);
    expect(semver.major(installed('typescript'))).toBe(6);
    expect(semver.major(installed('jest'))).toBe(29);
    expect(pkg.main).toBe('index.ts');
  });
});
