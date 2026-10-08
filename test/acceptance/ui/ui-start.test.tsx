// UI-acceptatietest (Eindtester): opstarten. Bij een startfout toont de app een Nederlandse melding en een knop
// "Opnieuw proberen" (geen blijvend leeg scherm); daarna start de app gewoon (UX-06, S-01).
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { singleDevice } from '../../support/single';
import { strings } from '../../../src/ui/strings.nl';

jest.mock('expo-router', () => ({ Stack: Object.assign(({ children }: { children?: unknown }) => children ?? null, { Screen: () => null }) }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaProvider: ({ children }: { children: unknown }) => children, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-crypto', () => ({ getRandomBytes: (n: number) => new Uint8Array(n).fill(7) }));
jest.mock('../../../src/ui/platform/netInfo', () => ({ bindNetInfo: () => () => {} }));
jest.mock('../../../src/ui/platform/appState', () => ({ bindAppState: () => () => {} }));
jest.mock('../../../src/service/createApp', () => ({ createApp: jest.fn() }));

import RootLayout from '../../../app/_layout';
import { createApp } from '../../../src/service/createApp';

describe('UX-06 / K-7: startfout', () => {
  it('ET-UX06-3: eerste start faalt -> begrijpelijke melding + "Opnieuw proberen"; na tikken start de app', async () => {
    const dev = await singleDevice({ seed: 41 });
    const mock = createApp as jest.Mock;
    mock.mockRejectedValueOnce(new Error('opslag stuk')).mockResolvedValue(dev.app);
    render(<RootLayout />);
    expect(await screen.findByText(strings.startError)).toBeTruthy();
    expect(screen.queryByText(/opslag stuk|Error/)).toBeNull(); // geen technische foutmelding voor de gebruiker
    const retry = screen.getByRole('button', { name: strings.retry });
    await act(async () => {
      fireEvent.press(retry);
    });
    await act(async () => {});
    expect(mock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(strings.startError)).toBeNull();
    expect(screen.queryByRole('button', { name: strings.retry })).toBeNull();
  });
});
