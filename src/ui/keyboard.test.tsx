// D-52 / D-ET-12: op Android (edge-to-edge) krijgt de container de hoogte van het toetsenbord als paddingBottom, zodat
// de AddBar en de dialogen boven het toetsenbord blijven. Houdt de inhoud de safe-area onderin niet zelf vrij, dan komt
// insets.bottom (hier 48, 3 knoppen) erbij. iOS houdt KeyboardAvoidingView met behavior="padding".
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Keyboard, KeyboardAvoidingView, Platform, StyleSheet, Text } from 'react-native';
import { KeyboardSafeView } from './components/KeyboardSafeView';
import { createUiStore, type UiStore } from './store';
import { strings } from './strings.nl';
import { singleDevice } from '../../test/support/single';

const mockH: { store: UiStore | null; params: Record<string, string> } = { store: null, params: {} };
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => mockH.params,
  Stack: { Screen: () => null },
}));
jest.mock('./AppContext', () => {
  const { useStore } = require('zustand');
  return { useUi: () => mockH.store, useUiState: (sel: (s: unknown) => unknown) => useStore(mockH.store, sel), nativeAlert: () => {} };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 48, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
}));

import ListScreen from '../../app/lijst/[id]';
import ListsScreen from '../../app/index';
import SettingsScreen from '../../app/instellingen';

type Handler = (e?: { endCoordinates: { height: number } }) => void;
const handlers = new Map<string, Handler[]>();
let spy: jest.SpyInstance;
const emit = async (name: string, height = 0) => {
  await act(async () => {
    for (const h of handlers.get(name) ?? []) h({ endCoordinates: { height } });
  });
};
const padding = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style)?.paddingBottom;

function asPlatform(os: 'android' | 'ios') {
  jest.replaceProperty(Platform, 'OS', os);
}

beforeEach(() => {
  handlers.clear();
  spy = jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, h: Handler) => {
    handlers.set(name, [...(handlers.get(name) ?? []), h]);
    return { remove: () => handlers.set(name, (handlers.get(name) ?? []).filter((x) => x !== h)) };
  }) as unknown as typeof Keyboard.addListener);
});
afterEach(() => {
  spy.mockRestore();
  jest.restoreAllMocks();
});

describe('D-52: KeyboardSafeView', () => {
  it('D-52 (Android): keyboardDidShow geeft paddingBottom = hoogte toetsenbord + safe-area onderin; keyboardDidHide haalt hem weg', async () => {
    asPlatform('android');
    render(
      <KeyboardSafeView style={{ flex: 1 }} testID="k">
        <Text>inhoud</Text>
      </KeyboardSafeView>,
    );
    expect(padding('k')).toBeUndefined();
    await emit('keyboardDidShow', 312);
    expect(padding('k')).toBe(312 + 48);
    await emit('keyboardDidShow', 360); // emoji-paneel: hoogte verandert terwijl het toetsenbord open is
    expect(padding('k')).toBe(360 + 48);
    await emit('keyboardDidHide');
    expect(padding('k')).toBeUndefined();
  });

  it('D-52 (Android): ownsBottomInset: de inhoud houdt de safe-area zelf vrij, dus alleen de hoogte van het toetsenbord', async () => {
    asPlatform('android');
    render(
      <KeyboardSafeView ownsBottomInset testID="k">
        <Text>inhoud</Text>
      </KeyboardSafeView>,
    );
    await emit('keyboardDidShow', 312);
    expect(padding('k')).toBe(312);
  });

  it('D-52 (iOS): ongewijzigd: KeyboardAvoidingView met behavior "padding" en de offset; ios="none" voegt niets toe', () => {
    asPlatform('ios');
    const r = render(
      <KeyboardSafeView iosOffset={100} testID="k">
        <Text>inhoud</Text>
      </KeyboardSafeView>,
    );
    const kav = r.UNSAFE_getByType(KeyboardAvoidingView);
    expect(kav.props.behavior).toBe('padding');
    expect(kav.props.keyboardVerticalOffset).toBe(100);
    expect(handlers.get('keyboardDidShow') ?? []).toHaveLength(0); // op iOS geen eigen luisteraars (alleen die van KeyboardAvoidingView zelf)
    const r2 = render(
      <KeyboardSafeView ios="none" testID="geen">
        <Text>los</Text>
      </KeyboardSafeView>,
    );
    expect(r2.queryByTestId('geen')).toBeNull();
    expect(r2.getByText('los')).toBeTruthy();
  });
});

describe('D-ET-12: schermen op Android', () => {
  it('D-ET-12: lijstscherm: met het toetsenbord open schuift de container (met de AddBar) omhoog; de AddBar houdt zelf de safe-area vrij', async () => {
    asPlatform('android');
    const d = await singleDevice({ seed: 512 });
    mockH.store = createUiStore(d.app, { alert: () => {}, timers: { setTimeout: () => 0, clearTimeout: () => {} } });
    mockH.params = { id: d.app.lists()[0].id };
    render(<ListScreen />);
    expect(screen.getByPlaceholderText(strings.addPlaceholder)).toBeTruthy();
    await emit('keyboardDidShow', 300);
    expect(padding('lijst-scherm')).toBe(300);
    await emit('keyboardDidHide');
    expect(padding('lijst-scherm')).toBeUndefined();
  });

  it('D-ET-12: dialoog "Nieuwe lijst": de dialoogcontainer krijgt de hoogte van het toetsenbord plus de safe-area als paddingBottom', async () => {
    asPlatform('android');
    const d = await singleDevice({ seed: 513 });
    mockH.store = createUiStore(d.app, { alert: () => {}, timers: { setTimeout: () => 0, clearTimeout: () => {} } });
    render(<ListsScreen />);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: strings.newList }));
    });
    await emit('keyboardDidShow', 280);
    expect(padding('nieuwe-lijst-dialoog')).toBe(280 + 48);
  });

  it('D-ET-12: instellingen (ScrollView zonder safe-area onderin): paddingBottom = toetsenbord + safe-area', async () => {
    asPlatform('android');
    const d = await singleDevice({ seed: 514 });
    mockH.store = createUiStore(d.app, { alert: () => {}, timers: { setTimeout: () => 0, clearTimeout: () => {} } });
    render(<SettingsScreen />);
    await screen.findByLabelText(strings.relayInputLabel);
    await act(async () => {});
    await emit('keyboardDidShow', 300);
    expect(padding('instellingen-scherm')).toBe(300 + 48);
    await emit('keyboardDidHide');
    expect(padding('instellingen-scherm')).toBeUndefined();
  });
});
