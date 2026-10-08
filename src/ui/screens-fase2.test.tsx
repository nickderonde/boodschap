// D-ET-06 (melding "Code gekopieerd" zichtbaar op het deelscherm) en O-ET-09 (eigen labels voor veld en knop).
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createUiStore, type UiStore } from './store';
import { strings } from './strings.nl';
import type { BootschapApp } from '../service/BootschapApp';

const h: { store: UiStore | null; clipboard: string } = { store: null, clipboard: '' };

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'L' }),
  Stack: { Screen: () => null },
}));
jest.mock('./AppContext', () => {
  const { useStore } = require('zustand');
  return {
    useUi: () => h.store,
    useUiState: (sel: (s: unknown) => unknown) => useStore(h.store, sel),
    nativeAlert: () => {},
  };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
}));
jest.mock('expo-clipboard', () => ({
  getStringAsync: jest.fn(async () => h.clipboard),
  setStringAsync: jest.fn(async (t: string) => {
    h.clipboard = t;
    return true;
  }),
}));

import ShareScreen from '../../app/lijst/[id]/delen';
import SettingsScreen from '../../app/instellingen';

function fakeApp(): BootschapApp {
  const info = { link: 'bootschap://join#abc', code: 'BS1-ABCD-EFGH', text: 'deeltekst met code', ready: true };
  return {
    lists: () => [{ id: 'L', name: 'Boodschappen', shared: true, total: 0, checkedCount: 0, position: 0 }],
    onChange: () => () => {},
    onSyncStatus: () => () => {},
    onError: () => () => {},
    share: async () => info,
    shareInfo: async () => info,
    relays: async () => ['wss://relay.damus.io'],
    setRelays: async () => {},
  } as unknown as BootschapApp;
}

const timers = { setTimeout: () => null, clearTimeout: () => {} };

describe('Fase 2 Eindtester: schermen', () => {
  it('D-ET-06: na "Kopieer code" is de melding "Code gekopieerd" zichtbaar op het deelscherm', async () => {
    h.store = createUiStore(fakeApp(), { alert: () => {}, timers });
    render(<ShareScreen />);
    const copy = await screen.findByRole('button', { name: strings.copyCode });
    await act(async () => {
      fireEvent.press(copy);
    });
    await waitFor(() => expect(screen.getByText(strings.copied)).toBeTruthy());
    expect(h.clipboard).toBe('deeltekst met code');
  });

  it('O-ET-09: het invoerveld en de knop "Relay toevoegen" hebben elk een eigen label', async () => {
    h.store = createUiStore(fakeApp(), { alert: () => {}, timers });
    render(<SettingsScreen />);
    await screen.findByText('wss://relay.damus.io');
    expect(screen.getAllByLabelText(strings.addRelay)).toHaveLength(1);
    expect(screen.getAllByLabelText(strings.relayInputLabel)).toHaveLength(1);
    expect(strings.relayInputLabel).not.toBe(strings.addRelay);
  });
});
