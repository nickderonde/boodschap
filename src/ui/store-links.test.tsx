// ST-07 (privacybeleid, support en licenties in Instellingen) en ST-10 (beide URL-schema's openen het koppelscherm).
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { createUiStore, type UiStore } from './store';
import { strings } from './strings.nl';
import { PRIVACY_URL, SOURCE_URL, SUPPORT_URL } from './links';
import { LICENSE_ENTRIES, LICENSE_TEXTS } from './licenses.generated';
import type { BootschapApp } from '../service/BootschapApp';

const mockH: { store: UiStore | null } = { store: null };
const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn() };

jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({}), Stack: { Screen: () => null } }));
jest.mock('./AppContext', () => {
  const { useStore } = require('zustand');
  return { useUi: () => mockH.store, useUiState: (sel: (s: unknown) => unknown) => useStore(mockH.store, sel), nativeAlert: () => {} };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
}));

import SettingsScreen from '../../app/instellingen';
import LicensesScreen from '../../app/licenties';
import { redirectSystemPath } from '../../app/+native-intent';
import { takePendingJoin } from './pendingJoin';

const fakeApp = () =>
  ({ lists: () => [], onChange: () => () => {}, onSyncStatus: () => () => {}, onError: () => () => {}, relays: async () => ['wss://relay.damus.io'], setRelays: async () => {} }) as unknown as BootschapApp;

describe('ST-07: verwijzingen in Instellingen', () => {
  it('ST-07: "Privacybeleid", "Support en contact" en "Broncode" openen de https-URL\'s; "Open-source licenties" opent het licentiescherm', async () => {
    mockH.store = createUiStore(fakeApp(), { alert: () => {}, timers: { setTimeout: () => 0, clearTimeout: () => {} } });
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    render(<SettingsScreen />);
    await screen.findByText('wss://relay.damus.io');
    for (const [label, url] of [
      [strings.privacyPolicy, PRIVACY_URL],
      [strings.support, SUPPORT_URL],
      [strings.sourceCode, SOURCE_URL],
    ]) {
      await act(async () => {
        fireEvent.press(screen.getByRole('link', { name: label }));
      });
      expect(open).toHaveBeenLastCalledWith(url);
      expect(url).toMatch(/^https:\/\//);
    }
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: strings.openSourceLicenses }));
    });
    expect(mockRouter.push).toHaveBeenCalledWith('/licenties');
    expect(new Set([PRIVACY_URL, SUPPORT_URL].map((u) => new URL(u).host))).toEqual(new Set(['nickderonde.github.io']));
  });

  it('ST-07: het licentiescherm toont alle productiepakketten met licentie, en de licentieteksten', () => {
    render(<LicensesScreen />);
    expect(screen.getByText(strings.licensesIntro(LICENSE_ENTRIES.length))).toBeTruthy();
    expect(screen.getByText(strings.licensesTitle)).toBeTruthy(); // eerste sectie; de teksten volgen verderop in de lijst
    const first = LICENSE_ENTRIES[0];
    expect(screen.getByText(`${first.n} ${first.v}`)).toBeTruthy();
    expect(Object.keys(LICENSE_TEXTS)).toEqual(expect.arrayContaining(['MIT', 'Apache-2.0', 'ISC']));
    for (const e of LICENSE_ENTRIES) expect(e.l).not.toBe('ONBEKEND');
  });
});

describe('ST-10: deellinks met beide schema\'s', () => {
  it('ST-10: boodschap://join#… en bootschap://join#… gaan naar /koppelen met de code in het geheugen; andere paden niet', () => {
    for (const scheme of ['boodschap', 'bootschap']) {
      expect(redirectSystemPath({ path: `${scheme}://join#ABCDEF`, initial: true })).toBe('/koppelen');
      expect(takePendingJoin()).toBe(`${scheme}://join#ABCDEF`);
    }
    expect(redirectSystemPath({ path: '/lijst/123', initial: false })).toBe('/lijst/123');
  });
});
