// UX-17 (CR-04) in de UI: wat de gebruiker typt, verschijnt met hoofdletter; suggesties en dubbel-melding blijven werken.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ctx, makeStore, resetUi } from './harness';
import { singleDevice } from '../../support/single';
import { strings } from '../../../src/ui/strings.nl';

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

import ListScreen from '../../../app/lijst/[id]';
import ListsScreen from '../../../app/index';

const submit = async (text: string) => {
  const input = screen.getByLabelText(strings.addPlaceholder);
  fireEvent.changeText(input, text);
  await act(async () => {
    fireEvent(input, 'submitEditing');
  });
};

describe('UX-17 in de UI', () => {
  it('ET-UX17-10: getypt "bananen", "ijsbergsla", "2 melk", "iPhone-lader" en "7up" verschijnen als "Bananen", "IJsbergsla", "Melk" (2), "iPhone-lader" en "7up"', async () => {
    resetUi();
    const d = await singleDevice({ seed: 1710 });
    makeStore(d.app);
    const listId = d.app.lists()[0].id;
    ctx.params = { id: listId };
    render(<ListScreen />);
    for (const t of ['bananen', 'ijsbergsla', '2 melk', 'iPhone-lader', '7up']) await submit(t);
    for (const n of ['Bananen', 'IJsbergsla', 'Melk', 'iPhone-lader', '7up']) expect([n, screen.queryByText(n) !== null]).toEqual([n, true]);
    expect(screen.queryByText('bananen')).toBeNull();
    expect(screen.getByText('2')).toBeTruthy(); // hoeveelheid
  });

  it('ET-UX17-11: "melk" na "Melk" geeft de dubbel-melding (F-17); een suggestie toont de naam met hoofdletter', async () => {
    resetUi();
    const d = await singleDevice({ seed: 1711 });
    makeStore(d.app);
    const listId = d.app.lists()[0].id;
    ctx.params = { id: listId };
    render(<ListScreen />);
    await submit('Melk');
    await submit('melk');
    expect(ctx.alerts[ctx.alerts.length - 1].title).toBe(strings.duplicateTitle);
    expect(d.app.view(listId).total).toBe(1);
    // suggestie met hoofdletter
    fireEvent.changeText(screen.getByLabelText(strings.addPlaceholder), 'mel');
    expect(screen.getByLabelText(strings.suggestionLabel('Melk'))).toBeTruthy();
  });

  it('ET-UX17-12: een nieuwe lijst met kleine letters krijgt in het overzicht een hoofdletter', async () => {
    resetUi();
    const d = await singleDevice({ seed: 1712 });
    makeStore(d.app);
    render(<ListsScreen />);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: strings.newList }));
    });
    fireEvent.changeText(screen.getByLabelText(strings.newListPlaceholder), 'feestje');
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: strings.create }));
    });
    expect(d.app.lists().map((l) => l.name)).toEqual(['Boodschappen', 'Feestje']);
    expect(screen.getByText('Feestje')).toBeTruthy();
  });
});
