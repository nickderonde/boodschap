// ST-07 (CR-03): Instellingen bevat "Privacybeleid", "Support" en "Open-source licenties"; de eerste twee openen de https-URL's
// uit ST-06; het licentiescherm toont de licenties van de productiepakketten. Teksten uit strings.nl.ts (UX-01).
import { Linking } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ctx, makeStore, resetUi, router } from './harness';
import { singleDevice } from '../../support/single';
import { strings } from '../../../src/ui/strings.nl';
import { LICENSE_ENTRIES } from '../../../src/ui/licenses.generated';

jest.mock('expo-router', () => {
  const h = require('./harness');
  return { useRouter: () => h.router, useLocalSearchParams: () => h.ctx.params, Stack: { Screen: () => null } };
});
jest.mock('../../../src/ui/AppContext', () => {
  const h = require('./harness');
  const { useStore } = require('zustand');
  return { useUi: () => h.ctx.store, useUiState: (sel: (s: unknown) => unknown) => useStore(h.ctx.store, sel), nativeAlert: h.nativeAlert };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
}));

import SettingsScreen from '../../../app/instellingen';
import LicensesScreen from '../../../app/licenties';

async function settings() {
  resetUi();
  const d = await singleDevice({ seed: 71 });
  makeStore(d.app);
  render(<SettingsScreen />);
  await act(async () => {});
}

describe('ST-07: verwijzingen in de app', () => {
  it('ET-ST07-2: Instellingen toont "Privacybeleid", "Support" en "Open-source licenties" (Nederlands)', async () => {
    await settings();
    for (const label of [strings.privacyPolicy, strings.support, strings.openSourceLicenses]) expect(screen.getByLabelText(label)).toBeTruthy();
    expect(strings.privacyPolicy).toBe('Privacybeleid');
    expect(strings.openSourceLicenses).toMatch(/licenties/i);
  });

  it('ET-ST07-3: Privacybeleid en Support openen de vaste https-URL\'s (NL-pagina\'s) in de browser; er wordt niets anders geopend', async () => {
    await settings();
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await act(async () => {
      fireEvent.press(screen.getByLabelText(strings.privacyPolicy));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText(strings.support));
    });
    const urls = open.mock.calls.map((c) => String(c[0]));
    expect(urls).toEqual(['https://nickderonde.github.io/boodschap/privacy/', 'https://nickderonde.github.io/boodschap/support/']);
    for (const u of urls) expect(u.startsWith('https://')).toBe(true);
    open.mockRestore();
  });

  it('ET-ST07-4: "Open-source licenties" opent het licentiescherm in de app (geen browser)', async () => {
    await settings();
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await act(async () => {
      fireEvent.press(screen.getByLabelText(strings.openSourceLicenses));
    });
    expect(router.push).toHaveBeenCalledWith('/licenties');
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it('ET-ST07-5: het licentiescherm toont het aantal pakketten en de licentietekst; de lijst bevat de kernpakketten (expo, react-native, nostr-tools, @noble/ciphers)', async () => {
    resetUi();
    render(<LicensesScreen />);
    expect(screen.getByText(strings.licensesIntro(LICENSE_ENTRIES.length))).toBeTruthy();
    expect(LICENSE_ENTRIES.length).toBeGreaterThan(300);
    const names = new Set(LICENSE_ENTRIES.map((e) => e.n));
    for (const n of ['expo', 'react-native', 'nostr-tools', '@noble/ciphers', '@noble/hashes', 'fflate', 'zustand']) expect([n, names.has(n)]).toEqual([n, true]);
    expect(ctx.store).toBeTruthy();
  });

  it('ET-ST07-6: de versie van de app staat in Instellingen', async () => {
    await settings();
    expect(screen.getByText(/1\.0\.0|Versie/)).toBeTruthy();
  });
});
