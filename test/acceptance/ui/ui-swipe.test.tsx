// UI-acceptatietests (Eindtester) voor UX-15 (CR-01: item verwijderen met swipe) en UX-16 (CR-02: lijst verwijderen met swipe).
// Echte facade (node:sqlite / hub), echte UI-store en componenten. In Jest bestaat geen echte vinger: de swipe wordt
// nagebootst met de callbacks van de swipe-rij (open slepen, openen, volledige swipe = ver doorgesleept). Het gevoel van het
// gebaar (drempel, snelheid, scrollen) is [handmatig], zie H-08 in docs/HANDMATIGE_TEST.md.
import { SectionList } from 'react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { ctx, makeStore, resetUi, router } from './harness';
import { singleDevice } from '../../support/single';
import { addDevice, makeWorld, shareAndJoin } from '../../sim/hub';
import { strings } from '../../../src/ui/strings.nl';
import { isFullSwipe } from '../../../src/ui/components/SwipeRow';
import type { BootschapAppImpl } from '../../../src/service/BootschapApp';

jest.mock('expo-router', () => {
  const h = require('./harness');
  return {
    useRouter: () => h.router,
    useLocalSearchParams: () => h.ctx.params,
    Stack: { Screen: ({ options }: { options?: { headerRight?: () => unknown } }) => (options?.headerRight ? options.headerRight() : null) },
  };
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
import EditItemScreen from '../../../app/lijst/[id]/item/[itemId]';

type Inst = { props: Record<string, unknown>; parent: Inst | null };

/** De swipe-rij rondom een stuk tekst. */
function swipeableOf(text: string): Inst {
  let n = screen.getByText(text) as unknown as Inst | null;
  while (n && typeof n.props.renderRightActions !== 'function') n = n.parent;
  if (!n) throw new Error(`geen swipe-rij rond "${text}"`);
  return n;
}
/** Korte swipe naar links: de rij blijft open staan met de rode actie. */
async function swipeOpen(text: string) {
  await act(async () => {
    fireEvent(screen.getByText(text), 'swipeableOpenStartDrag', 'left');
    fireEvent(screen.getByText(text), 'swipeableWillOpen', 'left');
  });
}
/** Volledige swipe: ver doorgesleept (translationX -400) en losgelaten. */
/** Rij zoals op een iPhone 16: 393 pt breed. */
const ROW_WIDTH = 393;
function rowTestId(text: string): string {
  let n = screen.getByText(text) as unknown as Inst | null;
  while (n && !/^(item|list)-/.test(String(n.props.testID ?? ''))) n = n.parent;
  if (!n) throw new Error(`geen swipe-rij rond "${text}"`);
  return String(n.props.testID);
}
/** Sleept met een vinger naar links over `dx` punten en laat los (positief = naar rechts). Gebruikt de gebaar-testtools van gesture-handler. */
async function drag(text: string, dx: number) {
  const testID = rowTestId(text);
  await act(async () => {
    fireEvent(screen.getByTestId(testID), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: ROW_WIDTH, height: 56 } } });
    fireGestureHandler(getByGestureTestId(`swipe-${testID}`), [
      { state: State.BEGAN, translationX: 0 },
      { state: State.ACTIVE, translationX: dx / 4 },
      { translationX: dx },
      { state: State.END, translationX: dx },
    ]);
  });
}
/** Sleept ver naar links, sleept terug en laat dan los (annuleren). */
async function dragAndBack(text: string, far: number, back: number) {
  const testID = rowTestId(text);
  await act(async () => {
    fireEvent(screen.getByTestId(testID), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: ROW_WIDTH, height: 56 } } });
    fireGestureHandler(getByGestureTestId(`swipe-${testID}`), [
      { state: State.BEGAN, translationX: 0 },
      { state: State.ACTIVE, translationX: far / 2 },
      { translationX: far },
      { translationX: back },
      { state: State.END, translationX: back },
    ]);
  });
}
/** Volledige swipe: de vinger sleept ver over de rij (85% van de breedte) en laat los. */
const swipeFull = (text: string) => drag(text, -Math.round(ROW_WIDTH * 0.85));

const press = async (el: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(el);
  });
};
const pressAlert = async (label: string) => {
  const a = ctx.alerts[ctx.alerts.length - 1];
  const b = a?.buttons.find((x) => x.text === label);
  if (!b) throw new Error(`knop "${label}" niet in het laatste dialoog (${a?.buttons.map((x) => x.text).join(' | ')})`);
  await act(async () => {
    b.onPress?.();
  });
};
const itemAction = (n: string) => screen.queryByRole('button', { name: strings.swipeDeleteItem(n) });
const listAction = (n: string) => screen.queryByRole('button', { name: strings.swipeDeleteList(n) });
const itemsOf = (d: { app: BootschapAppImpl }, listId: string) => d.app.view(listId).sections.flatMap((s) => s.items);
const find = (d: { app: BootschapAppImpl }, listId: string, name: string) => itemsOf(d, listId).find((i) => i.name === name);
const allItems = itemsOf;
const names = (app: BootschapAppImpl, listId: string) =>
  app
    .view(listId)
    .sections.flatMap((s) => s.items)
    .map((i) => i.name)
    .sort();

async function itemScreen() {
  resetUi();
  const d = await singleDevice({ seed: 1501 });
  const listId = d.app.lists()[0].id;
  const ids: Record<string, string> = {};
  for (const [n, extra] of [['Melk', { quantity: 2, unit: 'l' }], ['Brood', { note: 'volkoren' }], ['Kaas', {}], ['Appels', {}]] as const) {
    const r = d.app.addItem(listId, { text: n, ...extra }).result;
    if (r.kind !== 'added') throw new Error();
    ids[n.toLowerCase()] = r.itemId; // sleutels in kleine letters; de weergavenaam is nu met hoofdletter (UX-17)
  }
  makeStore(d.app);
  ctx.store!.actions.toggle(listId, ids.kaas); // kaas is afgevinkt
  ctx.params = { id: listId };
  render(<ListScreen />);
  return { d, listId, ids };
}

describe('UX-15 (CR-01): item verwijderen met swipe naar links', () => {
  it('ET-UX15-1: de actie is pas na een swipe zichtbaar; alleen openen verwijdert niets; rode actie heet "Verwijderen" (tekst uit strings.nl)', async () => {
    const { d, listId } = await itemScreen();
    expect(itemAction('Melk')).toBeNull();
    await swipeOpen('Melk');
    const action = screen.getByRole('button', { name: strings.swipeDeleteItem('Melk') });
    expect(within(action).getByText(strings.swipeDelete)).toBeTruthy();
    expect(strings.swipeDelete).toBe('Verwijderen');
    expect(names(d.app, listId)).toContain('Melk');
    expect(ctx.alerts).toHaveLength(0);
  });

  it('ET-UX15-2: tik op de actie verwijdert het item direct (geen dialoog) en toont de snackbar "Ongedaan maken"', async () => {
    const { d, listId } = await itemScreen();
    await swipeOpen('Melk');
    await press(screen.getByRole('button', { name: strings.swipeDeleteItem('Melk') }));
    expect(names(d.app, listId)).toEqual(['Appels', 'Brood', 'Kaas']);
    expect(ctx.alerts).toHaveLength(0);
    expect(screen.getByText(strings.itemDeleted('Melk'))).toBeTruthy();
    expect(screen.getByRole('button', { name: strings.undo })).toBeTruthy();
    expect(screen.queryByText('Melk')).toBeNull();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('ET-UX15-3: een volledige swipe verwijdert het item direct, ook zonder tik op de actie; geen dialoog', async () => {
    const { d, listId } = await itemScreen();
    expect(isFullSwipe(-Math.round(ROW_WIDTH * 0.85), ROW_WIDTH)).toBe(true);
    expect(isFullSwipe(-60, ROW_WIDTH)).toBe(false); // een korte swipe is geen volledige swipe
    await swipeFull('Brood');
    expect(names(d.app, listId)).toEqual(['Appels', 'Kaas', 'Melk']);
    expect(ctx.alerts).toHaveLength(0);
    expect(screen.getByText(strings.itemDeleted('Brood'))).toBeTruthy();
  });

  it('ET-UX15-3b: een korte of halve veeg verwijdert niets (alleen de actie komt erbij); een veeg naar rechts doet niets', async () => {
    const { d, listId } = await itemScreen();
    await drag('Brood', -60);
    await drag('Brood', -ROW_WIDTH * 0.25);
    await drag('Melk', 150);
    expect(names(d.app, listId)).toEqual(['Appels', 'Brood', 'Kaas', 'Melk']);
    expect(ctx.alerts).toHaveLength(0);
    expect(screen.queryByText(strings.itemDeleted('Brood'))).toBeNull();
  });

  it('ET-UX15-3d: drempel van 50% van de rijbreedte: net eronder (47%) verwijdert niet, net erboven (53%) wel; terugslepen vóór loslaten annuleert', async () => {
    const { d, listId } = await itemScreen();
    await drag('Brood', -Math.round(ROW_WIDTH * 0.47));
    expect(names(d.app, listId)).toContain('Brood');
    await dragAndBack('Melk', -Math.round(ROW_WIDTH * 0.9), -Math.round(ROW_WIDTH * 0.2));
    expect(names(d.app, listId)).toContain('Melk');
    expect(ctx.alerts).toHaveLength(0);
    await drag('Brood', -Math.round(ROW_WIDTH * 0.53));
    expect(names(d.app, listId)).not.toContain('Brood');
    expect(screen.getByText(strings.itemDeleted('Brood'))).toBeTruthy();
  });

  it('ET-UX15-3c: een volledige swipe op een rij die al open staat verwijdert ook (de zichtbare actie telt mee)', async () => {
    const { d, listId } = await itemScreen();
    await swipeOpen('Appels');
    await swipeFull('Appels');
    expect(names(d.app, listId)).not.toContain('Appels');
    expect(screen.getByText(strings.itemDeleted('Appels'))).toBeTruthy();
  });

  it('ET-UX15-4: ook een afgevinkt item is te verwijderen met swipe, en "Ongedaan maken" herstelt het afgevinkt', async () => {
    const { d, listId } = await itemScreen();
    expect(screen.getByLabelText(strings.uncheckItem('Kaas'))).toBeTruthy();
    await swipeOpen('Kaas');
    await press(screen.getByRole('button', { name: strings.swipeDeleteItem('Kaas') }));
    expect(names(d.app, listId)).not.toContain('Kaas');
    await press(screen.getByRole('button', { name: strings.undo }));
    expect(find(d, listId, 'Kaas')?.checked).toBe(true);
    expect(screen.queryByText(strings.itemDeleted('Kaas'))).toBeNull();
    expect(screen.getByLabelText(strings.uncheckItem('Kaas'))).toBeTruthy();
  });

  it('ET-UX15-5: swipe, verwijderen, ongedaan maken herstelt exact hetzelfde item (zelfde id, hoeveelheid, eenheid, notitie)', async () => {
    const { d, listId, ids } = await itemScreen();
    const before = allItems(d, listId).find((i) => i.name === 'Melk')!;
    await swipeOpen('Melk');
    await press(screen.getByRole('button', { name: strings.swipeDeleteItem('Melk') }));
    await press(screen.getByRole('button', { name: strings.undo }));
    const after = allItems(d, listId).find((i) => i.name === 'Melk')!;
    expect(after.id).toBe(ids.melk);
    expect([after.quantity, after.unit, after.note, after.category, after.checked]).toEqual([before.quantity, before.unit, before.note, before.category, before.checked]);
    // een tweede keer verwijderen en herstellen werkt ook (R-DEL: telkens een nieuwe HLC)
    await swipeOpen('Melk');
    await press(screen.getByRole('button', { name: strings.swipeDeleteItem('Melk') }));
    await press(screen.getByRole('button', { name: strings.undo }));
    expect(names(d.app, listId)).toContain('Melk');
  });

  it('ET-UX15-6: de verwijdering is een gewone R-DEL-verwijdering: tombstone met een HLC hoger dan elke andere wijziging aan het item', async () => {
    const { d, listId, ids } = await itemScreen();
    await swipeOpen('Melk');
    await press(screen.getByRole('button', { name: strings.swipeDeleteItem('Melk') }));
    const it = d.app.stateOf(listId).items.get(ids.melk)!;
    expect(it.del).toBeTruthy();
    for (const [, reg] of Object.entries(it.regs)) expect(it.del! > reg[1]).toBe(true);
  });

  it('ET-UX15-7: maximaal één rij tegelijk open: een tweede swipe sluit de eerste; een tik op een rij sluit de open rij; scrollen sluit', async () => {
    await itemScreen();
    await swipeOpen('Melk');
    expect(itemAction('Melk')).toBeTruthy();
    await swipeOpen('Brood');
    expect(itemAction('Brood')).toBeTruthy();
    expect(itemAction('Melk')).toBeNull(); // eerste rij is dicht
    // tik op een andere rij: sluit de open rij én vinkt af zoals altijd
    await press(screen.getByLabelText(strings.checkItem('Appels')));
    expect(itemAction('Brood')).toBeNull();
    expect(screen.getByLabelText(strings.uncheckItem('Appels'))).toBeTruthy();
    // scrollen sluit de open rij
    await swipeOpen('Melk');
    expect(itemAction('Melk')).toBeTruthy();
    await act(async () => {
      fireEvent(screen.UNSAFE_getByType(SectionList), 'scrollBeginDrag');
    });
    expect(itemAction('Melk')).toBeNull();
  });

  it('ET-UX15-8: afvinken met een tik werkt ook als de rij zelf open staat; de rij sluit', async () => {
    const { d, listId } = await itemScreen();
    await swipeOpen('Melk');
    await press(screen.getByLabelText(strings.checkItem('Melk')));
    expect(find(d, listId, 'Melk')?.checked).toBe(true);
    expect(itemAction('Melk')).toBeNull();
    expect(names(d.app, listId)).toContain('Melk'); // niet per ongeluk verwijderd
  });

  it('ET-UX15-9: toegankelijkheid: elke itemrij heeft de actie "Verwijderen"; uitvoeren verwijdert met snackbar zonder dialoog', async () => {
    const { d, listId } = await itemScreen();
    const rows = screen.getAllByRole('checkbox');
    expect(rows).toHaveLength(4);
    for (const r of rows) expect(r.props.accessibilityActions).toEqual([{ name: 'delete', label: strings.swipeDelete }]);
    await act(async () => {
      fireEvent(screen.getByLabelText(strings.checkItem('Appels')), 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });
    });
    expect(names(d.app, listId)).toEqual(['Brood', 'Kaas', 'Melk']);
    expect(ctx.alerts).toHaveLength(0);
    expect(screen.getByText(strings.itemDeleted('Appels'))).toBeTruthy();
    await act(async () => {
      fireEvent(screen.getByLabelText(strings.uncheckItem('Kaas')), 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });
    });
    expect(names(d.app, listId)).not.toContain('Kaas'); // ook voor afgevinkte items
    // een onbekende actie doet niets
    await act(async () => {
      fireEvent(screen.getByLabelText(strings.checkItem('Melk')), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    });
    expect(names(d.app, listId)).toContain('Melk');
  });

  it('ET-UX15-10: het bewerkscherm houdt zijn verwijderknop (met ongedaan maken)', async () => {
    const { d, listId, ids } = await itemScreen();
    ctx.params = { id: listId, itemId: ids.brood };
    const edit = render(<EditItemScreen />);
    await act(async () => {
      fireEvent.press(edit.getByRole('button', { name: strings.deleteItem }));
    });
    expect(names(d.app, listId)).not.toContain('Brood');
    expect(ctx.store!.getState().message?.text).toBe(strings.itemDeleted('Brood'));
    expect(ctx.store!.getState().message?.undo).toBeDefined();
  });

  it('ET-UX15-11: snel achter elkaar twee items verwijderen en alleen het laatste herstellen: het eerste blijft weg, geen crash', async () => {
    const { d, listId } = await itemScreen();
    await swipeOpen('Melk');
    await press(screen.getByRole('button', { name: strings.swipeDeleteItem('Melk') }));
    await swipeOpen('Brood');
    await press(screen.getByRole('button', { name: strings.swipeDeleteItem('Brood') }));
    await press(screen.getByRole('button', { name: strings.undo }));
    expect(names(d.app, listId)).toEqual(['Appels', 'Brood', 'Kaas']);
  });

  it('ET-UX15-12: de verwijdering synct naar het tweede apparaat en "Ongedaan maken" herstelt het ook daar', async () => {
    resetUi();
    const w = await makeWorld();
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B');
    const ids = await shareAndJoin(w, a, [b]);
    const [la, lb] = [ids.get(a)!, ids.get(b)!];
    for (const n of ['Melk', 'Brood']) a.app.addItem(la, { text: n });
    await w.settle(20_000);
    expect(names(b.app, lb)).toEqual(['Brood', 'Melk']);
    makeStore(a.app);
    ctx.params = { id: la };
    render(<ListScreen />);
    await swipeOpen('Melk');
    await press(screen.getByRole('button', { name: strings.swipeDeleteItem('Melk') }));
    await act(async () => {
      await w.settle(6_000); // binnen het undo-venster van 10 s (virtuele tijd)
    });
    expect(names(b.app, lb)).toEqual(['Brood']);
    await press(screen.getByRole('button', { name: strings.undo }));
    await act(async () => {
      await w.settle(20_000);
    });
    expect(names(b.app, lb)).toEqual(['Brood', 'Melk']);
  });
});

describe('UX-16 (CR-02): lijst verwijderen met swipe in het overzicht', () => {
  async function overview(opts: { second?: boolean } = {}) {
    resetUi();
    const d = await singleDevice({ seed: 1601 });
    makeStore(d.app);
    const first = d.app.lists()[0];
    d.app.addItem(first.id, { text: 'Melk' });
    if (opts.second) d.app.createList('Feestje');
    const del = jest.spyOn(d.app, 'deleteList');
    const leave = jest.spyOn(d.app, 'leave');
    render(<ListsScreen />);
    return { d, first, del, leave };
  }

  it('ET-UX16-1: de actie is pas na een swipe zichtbaar; openen verwijdert niets', async () => {
    const { d, del } = await overview();
    expect(listAction('Boodschappen')).toBeNull();
    await swipeOpen('Boodschappen');
    const action = screen.getByRole('button', { name: strings.swipeDeleteList('Boodschappen') });
    expect(within(action).getByText(strings.swipeDelete)).toBeTruthy();
    expect(d.app.lists()).toHaveLength(1);
    expect(del).not.toHaveBeenCalled();
    expect(ctx.alerts).toHaveLength(0);
  });

  it('ET-UX16-2: tik op de actie toont altijd de bevestiging uit UX-07; er is nog niets verwijderd', async () => {
    const { d, del } = await overview();
    await swipeOpen('Boodschappen');
    await press(screen.getByRole('button', { name: strings.swipeDeleteList('Boodschappen') }));
    expect(ctx.alerts).toHaveLength(1);
    expect(ctx.alerts[0].title).toBe(strings.confirm.deleteLocalTitle);
    expect(ctx.alerts[0].message).toContain('Boodschappen');
    expect(ctx.alerts[0].buttons.map((b) => b.text)).toEqual([strings.cancel, strings.confirm.deleteButton]);
    expect(d.app.lists()).toHaveLength(1);
    expect(del).not.toHaveBeenCalled();
  });

  it('ET-UX16-3: ook een volledige swipe verwijdert nooit zonder bevestiging', async () => {
    const { d, del } = await overview();
    await swipeFull('Boodschappen');
    expect(ctx.alerts).toHaveLength(1);
    expect(ctx.alerts[0].title).toBe(strings.confirm.deleteLocalTitle);
    expect(d.app.lists()).toHaveLength(1);
    expect(del).not.toHaveBeenCalled();
  });

  it('ET-UX16-3b: een korte veeg op een lijst opent geen dialoog en verwijdert niets', async () => {
    const { d, del } = await overview();
    await drag('Boodschappen', -60);
    expect(ctx.alerts).toHaveLength(0);
    expect(del).not.toHaveBeenCalled();
    expect(d.app.lists()).toHaveLength(1);
  });

  it('ET-UX16-3c: net onder de drempel (47%) of terugslepen vóór loslaten opent geen dialoog; net erboven (53%) opent de bevestiging, nooit een directe verwijdering', async () => {
    const { d, del } = await overview();
    await drag('Boodschappen', -Math.round(ROW_WIDTH * 0.47));
    await dragAndBack('Boodschappen', -Math.round(ROW_WIDTH * 0.9), -Math.round(ROW_WIDTH * 0.2));
    expect(ctx.alerts).toHaveLength(0);
    await drag('Boodschappen', -Math.round(ROW_WIDTH * 0.53));
    expect(ctx.alerts).toHaveLength(1);
    expect(ctx.alerts[0].title).toBe(strings.confirm.deleteLocalTitle);
    expect(del).not.toHaveBeenCalled();
    expect(d.app.lists()).toHaveLength(1);
  });

  it('ET-UX16-4: annuleren laat de lijst staan, roept de facade niet aan en sluit de rij', async () => {
    const { d, del } = await overview();
    await swipeOpen('Boodschappen');
    await press(screen.getByRole('button', { name: strings.swipeDeleteList('Boodschappen') }));
    await pressAlert(strings.cancel);
    expect(del).not.toHaveBeenCalled();
    expect(d.app.lists()).toHaveLength(1);
    expect(screen.getByText('Boodschappen')).toBeTruthy();
    expect(listAction('Boodschappen')).toBeNull(); // rij is weer dicht
  });

  it('ET-UX16-5: bevestigen verwijdert de lijst en hij verdwijnt uit het overzicht', async () => {
    const { d, del } = await overview({ second: true });
    await swipeOpen('Feestje');
    await press(screen.getByRole('button', { name: strings.swipeDeleteList('Feestje') }));
    await pressAlert(strings.confirm.deleteButton);
    expect(del).toHaveBeenCalledTimes(1);
    expect(d.app.lists().map((l) => l.name)).toEqual(['Boodschappen']);
    expect(screen.queryByText('Feestje')).toBeNull();
    expect(screen.getByText('Boodschappen')).toBeTruthy();
    // de laatste lijst verwijderen geeft de lege toestand
    await swipeOpen('Boodschappen');
    await press(screen.getByRole('button', { name: strings.swipeDeleteList('Boodschappen') }));
    await pressAlert(strings.confirm.deleteButton);
    expect(screen.getByText(strings.listsEmptyTitle)).toBeTruthy();
  });

  it('ET-UX16-6: maximaal één rij open; tik op een lijst opent hem nog steeds (en sluit de open rij)', async () => {
    await overview({ second: true });
    await swipeOpen('Boodschappen');
    await swipeOpen('Feestje');
    expect(listAction('Feestje')).toBeTruthy();
    expect(listAction('Boodschappen')).toBeNull();
    await press(screen.getByLabelText(/^Boodschappen, /));
    expect(router.push).toHaveBeenCalledWith(expect.stringMatching(/^\/lijst\//));
    expect(listAction('Feestje')).toBeNull();
  });

  it('ET-UX16-7: toegankelijkheid: elke lijstrij heeft de actie "Verwijderen"; uitvoeren toont de bevestiging (nooit direct verwijderen)', async () => {
    const { d, del } = await overview({ second: true });
    const rows = screen.getAllByLabelText(/ afgevinkt|Nog leeg/);
    expect(rows.length).toBe(2);
    for (const r of rows) expect(r.props.accessibilityActions).toEqual([{ name: 'delete', label: strings.swipeDelete }]);
    await act(async () => {
      fireEvent(rows[0], 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });
    });
    expect(ctx.alerts).toHaveLength(1);
    expect(ctx.alerts[0].title).toBe(strings.confirm.deleteLocalTitle);
    expect(del).not.toHaveBeenCalled();
    expect(d.app.lists()).toHaveLength(2);
  });

  it('ET-UX16-8: het ⋯-menu in de lijst blijft bestaan en biedt nog "Lijst verwijderen"', async () => {
    const { first } = await overview();
    screen.unmount();
    ctx.params = { id: first.id };
    render(<ListScreen />);
    await press(screen.getByRole('button', { name: strings.menu }));
    expect(ctx.alerts[ctx.alerts.length - 1].buttons.map((b) => b.text)).toContain(strings.deleteList);
  });

  describe('gedeelde lijst', () => {
    async function sharedOverview() {
      resetUi();
      const w = await makeWorld();
      const a = await addDevice(w, 'A');
      const b = await addDevice(w, 'B');
      const ids = await shareAndJoin(w, a, [b]);
      a.app.addItem(ids.get(a)!, { text: 'Melk' });
      await w.settle(20_000);
      makeStore(a.app);
      const del = jest.spyOn(a.app, 'deleteList');
      const leave = jest.spyOn(a.app, 'leave');
      render(<ListsScreen />);
      await swipeOpen('Boodschappen');
      await press(screen.getByRole('button', { name: strings.swipeDeleteList('Boodschappen') }));
      return { w, a, b, la: ids.get(a)!, lb: ids.get(b)!, del, leave };
    }

    it('ET-UX16-9: de bevestiging noemt "alle telefoons" en biedt "Lijst verlaten" als alternatief', async () => {
      const { a } = await sharedOverview();
      const dlg = ctx.alerts[ctx.alerts.length - 1];
      expect(dlg.title).toBe(strings.confirm.deleteSharedTitle);
      expect(dlg.message).toMatch(/alle telefoons/);
      expect(dlg.message).toMatch(/Lijst verlaten/);
      expect(dlg.buttons.map((x) => x.text)).toEqual(expect.arrayContaining([strings.cancel, strings.leaveList, strings.confirm.deleteEverywhere]));
      expect(a.app.lists()).toHaveLength(1);
    });

    it('ET-UX16-10: annuleren laat de gedeelde lijst staan op beide telefoons (geen deleteList, geen leave)', async () => {
      const { w, a, b, lb, del, leave } = await sharedOverview();
      await pressAlert(strings.cancel);
      await act(async () => {
        await w.settle(30_000);
      });
      expect(del).not.toHaveBeenCalled();
      expect(leave).not.toHaveBeenCalled();
      expect(a.app.lists()).toHaveLength(1);
      expect(b.app.lists().filter((l) => l.id === lb)).toHaveLength(1);
      expect(listAction('Boodschappen')).toBeNull();
    });

    it('ET-UX16-11: "Lijst verlaten" gebruikt leave (niet deleteList): alleen deze telefoon, de ander houdt de lijst en de items', async () => {
      const { w, a, b, la, lb, del, leave } = await sharedOverview();
      await pressAlert(strings.leaveList);
      // daarna de bevestiging van "verlaten" (F-18): kopie houden
      expect(ctx.alerts[ctx.alerts.length - 1].title).toBe(strings.confirm.leaveTitle);
      await pressAlert(strings.confirm.leaveKeep);
      await act(async () => {
        await w.settle(30_000);
      });
      expect(del).not.toHaveBeenCalled();
      expect(leave).toHaveBeenCalledWith(la, true);
      expect(a.app.lists().find((l) => l.id === la)?.shared).toBe(false);
      expect(names(b.app, lb)).toEqual(['Melk']);
      expect(b.app.lists().filter((l) => l.id === lb)).toHaveLength(1);
    });

    it('ET-UX16-12: "Overal verwijderen" verwijdert de lijst op alle gekoppelde telefoons', async () => {
      const { w, a, b, lb, del } = await sharedOverview();
      await pressAlert(strings.confirm.deleteEverywhere);
      await act(async () => {
        await w.settle(60_000);
      });
      expect(del).toHaveBeenCalledTimes(1);
      expect(a.app.lists()).toHaveLength(0);
      expect(b.app.lists().filter((l) => l.id === lb)).toHaveLength(0);
      expect(screen.queryByText('Boodschappen')).toBeNull();
    });
  });
});
