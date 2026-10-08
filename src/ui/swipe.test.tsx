// UX-15 (CR-01): item verwijderen door naar links te swipen. UX-16 (CR-02): lijst verwijderen door in het overzicht te swipen.
// Schermen draaien met de echte facade (node:sqlite), de echte UI-store en de echte componenten; alleen expo-mockRouter,
// safe-area en het systeemdialoog zijn vervangen.
import { memo } from 'react';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { createUiStore, type UiStore } from './store';
import { strings } from './strings.nl';
import type { AlertButton } from './confirm';
import { ItemRow } from './components/ItemRow';
import { createSwipeGroup, isFullSwipe, SwipeGroupProvider, FULL_SWIPE_MIN, SWIPE_ACTION_WIDTH } from './components/SwipeRow';
import { singleDevice } from '../../test/support/single';
import { addDevice, makeWorld, names, shareAndJoin } from '../../test/sim/hub';
import { emptyList, mergeList } from '../core/crdt/list';
import { createItemDelta, editItemDelta } from '../core/ops';
import { formatHlc, HlcClock } from '../core/hlc';
import { materialize } from '../core/crdt/materialize';
import type { ItemView, ListState } from '../core/types';
import type { BootschapAppImpl } from '../service/BootschapApp';

interface Alert {
  title: string;
  message: string;
  buttons: AlertButton[];
}
const mockH: { store: UiStore | null; params: Record<string, string>; alerts: Alert[] } = { store: null, params: {}, alerts: [] };
const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn() };

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockH.params,
  Stack: { Screen: ({ options }: { options?: { headerRight?: () => unknown } }) => (options?.headerRight ? options.headerRight() : null) },
}));
jest.mock('./AppContext', () => {
  const { useStore } = require('zustand');
  return {
    useUi: () => mockH.store,
    useUiState: (sel: (s: unknown) => unknown) => useStore(mockH.store, sel),
    nativeAlert: (title: string, message: string, buttons: AlertButton[]) => mockH.alerts.push({ title, message, buttons }),
  };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
}));

import ListScreen from '../../app/lijst/[id]';
import ListsScreen from '../../app/index';

const timers = { setTimeout: () => 0, clearTimeout: () => {} };
function makeStore(app: BootschapAppImpl): UiStore {
  mockH.alerts = [];
  mockRouter.push.mockClear();
  mockH.store = createUiStore(app, { alert: (title, message, buttons) => mockH.alerts.push({ title, message, buttons }), timers });
  return mockH.store;
}
const press = async (el: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(el);
  });
};
const pressAlert = async (label: string) => {
  const a = mockH.alerts[mockH.alerts.length - 1];
  const b = a?.buttons.find((x) => x.text === label);
  if (!b) throw new Error(`knop "${label}" niet in het laatste dialoog`);
  await act(async () => {
    b.onPress?.();
  });
};

type Inst = { props: Record<string, unknown>; parent: Inst | null };
/** De ReanimatedSwipeable rond een tekst (via de componentboom omhoog). */
function swipeableOf(text: string): Inst {
  let n = screen.getByText(text) as unknown as Inst | null;
  while (n && typeof n.props.renderRightActions !== 'function') n = n.parent;
  if (!n) throw new Error(`geen swipe-rij rond "${text}"`);
  return n;
}
/** Swipe naar links tot de actie open staat (zoals bij loslaten na een korte swipe). */
async function swipeOpen(text: string) {
  await act(async () => {
    fireEvent(screen.getByText(text), 'swipeableOpenStartDrag', 'left');
    fireEvent(screen.getByText(text), 'swipeableWillOpen', 'left');
  });
}
/** Volledige swipe zoals op een iPhone 16: rij 393 pt breed, vinger 60% naar links en loslaten. */
async function swipeFull(text: string) {
  let n = screen.getByText(text) as unknown as Inst | null;
  while (n && !/^(item|list)-/.test(String(n.props.testID ?? ''))) n = n.parent;
  if (!n) throw new Error(`geen swipe-rij rond "${text}"`);
  const testID = String(n.props.testID);
  await act(async () => {
    fireEvent(screen.getByTestId(testID), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 393, height: 56 } } });
    fireGestureHandler(getByGestureTestId(`swipe-${testID}`), [
      { state: State.BEGAN, translationX: 0 },
      { state: State.ACTIVE, translationX: -40 },
      { translationX: -236 },
      { state: State.END, translationX: -236 },
    ]);
  });
}
const itemIdByName = (app: BootschapAppImpl, listId: string, name: string) =>
  app
    .view(listId)
    .sections.flatMap((s) => s.items)
    .find((i) => i.name === name)?.id;

describe('UX-15 (CR-01): item verwijderen door naar links te swipen', () => {
  async function setup() {
    const d = await singleDevice({ seed: 151 });
    const listId = d.app.lists()[0].id;
    for (const n of ['melk', 'brood', 'kaas']) d.app.addItem(listId, { text: n });
    const store = makeStore(d.app);
    store.actions.toggle(listId, itemIdByName(d.app, listId, 'kaas')!);
    mockH.params = { id: listId };
    render(<ListScreen />);
    return { d, listId };
  }

  it('UX-15: swipe toont de rode actie "Verwijderen"; tik erop verwijdert via de facade, zonder dialoog, met snackbar "Ongedaan maken"', async () => {
    const { d, listId } = await setup();
    // Dicht: de actie is niet bereikbaar.
    expect(screen.queryByRole('button', { name: strings.swipeDeleteItem('melk') })).toBeNull();
    await swipeOpen('melk');
    const action = screen.getByRole('button', { name: strings.swipeDeleteItem('melk') });
    expect(within(action).getByText(strings.swipeDelete)).toBeTruthy();
    await press(action);
    expect(itemIdByName(d.app, listId, 'melk')).toBeUndefined();
    expect(screen.queryByText('melk')).toBeNull();
    expect(mockH.alerts).toHaveLength(0);
    expect(screen.getByText(strings.itemDeleted('melk'))).toBeTruthy();
    // Ongedaan maken zet het item terug.
    await press(screen.getByRole('button', { name: strings.undo }));
    expect(itemIdByName(d.app, listId, 'melk')).toBeDefined();
    expect(screen.getByText('melk')).toBeTruthy();
  });

  it('UX-15: een volledige swipe verwijdert direct (ook een afgevinkt item), met undo', async () => {
    const { d, listId } = await setup();
    expect(isFullSwipe(-400, 390)).toBe(true);
    expect(isFullSwipe(-96, 390)).toBe(false);
    expect(isFullSwipe(-(FULL_SWIPE_MIN - 1), 0)).toBe(false);
    await swipeFull('kaas'); // afgevinkt
    expect(itemIdByName(d.app, listId, 'kaas')).toBeUndefined();
    expect(mockH.alerts).toHaveLength(0);
    expect(screen.getByText(strings.itemDeleted('kaas'))).toBeTruthy();
    await press(screen.getByRole('button', { name: strings.undo }));
    const back = d.app.view(listId).sections.flatMap((s) => s.items).find((i) => i.name === 'kaas');
    expect(back?.checked).toBe(true);
  });

  it('UX-15: er staat maximaal één rij open; een tweede swipe of een tik elders sluit de eerste, en de tik vinkt nog steeds af', async () => {
    const { d, listId } = await setup();
    await swipeOpen('melk');
    expect(screen.getByRole('button', { name: strings.swipeDeleteItem('melk') })).toBeTruthy();
    await swipeOpen('brood');
    expect(screen.queryByRole('button', { name: strings.swipeDeleteItem('melk') })).toBeNull();
    expect(screen.getByRole('button', { name: strings.swipeDeleteItem('brood') })).toBeTruthy();
    // Tik op een andere rij: open rij gaat dicht en het item wordt afgevinkt.
    await press(screen.getByRole('checkbox', { name: strings.checkItem('melk') }));
    expect(screen.queryByRole('button', { name: strings.swipeDeleteItem('brood') })).toBeNull();
    expect(d.app.view(listId).sections.flatMap((s) => s.items).find((i) => i.name === 'melk')?.checked).toBe(true);
    expect(itemIdByName(d.app, listId, 'brood')).toBeDefined();
  });

  it('UX-15: elke itemrij heeft de accessibility action "Verwijderen" met dezelfde uitwerking', async () => {
    const { d, listId } = await setup();
    const row = screen.getByRole('checkbox', { name: strings.checkItem('brood') });
    expect(row.props.accessibilityActions).toEqual([{ name: 'delete', label: strings.swipeDelete }]);
    await act(async () => {
      fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });
    });
    expect(itemIdByName(d.app, listId, 'brood')).toBeUndefined();
    expect(mockH.alerts).toHaveLength(0);
    expect(screen.getByText(strings.itemDeleted('brood'))).toBeTruthy();
    // Andere acties doen niets.
    await act(async () => {
      fireEvent(screen.getByRole('checkbox', { name: strings.checkItem('melk') }), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    });
    expect(itemIdByName(d.app, listId, 'melk')).toBeDefined();
  });

  it('UX-15: de verwijdering en het herstel via "Ongedaan maken" syncen naar het tweede apparaat', async () => {
    const w = await makeWorld();
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B');
    const ids = await shareAndJoin(w, a, [b]);
    const la = ids.get(a)!;
    const lb = ids.get(b)!;
    a.app.addItem(la, { text: 'eieren' });
    a.app.addItem(la, { text: 'appels' });
    await act(async () => {
      await w.settle(10_000);
    });
    expect(names(b, lb)).toEqual(expect.arrayContaining(['eieren', 'appels']));
    makeStore(a.app);
    mockH.params = { id: la };
    render(<ListScreen />);
    await swipeOpen('eieren');
    await press(screen.getByRole('button', { name: strings.swipeDeleteItem('eieren') }));
    await act(async () => {
      await w.settle(10_000);
    });
    expect(names(b, lb)).not.toContain('eieren');
    await press(screen.getByRole('button', { name: strings.undo }));
    await act(async () => {
      await w.settle(10_000);
    });
    expect(names(b, lb)).toContain('eieren');
  });

  it('UX-15 / review K-2: met swipe-rijen hertekent afvinken in een lijst van 1000 items precies één rij', () => {
    const N = '0000000000000001';
    let l: ListState = emptyList();
    for (let i = 0; i < 1000; i++) {
      const id = `I${String(i).padStart(15, '0')}`;
      l = mergeList(l, createItemDelta(id, { name: `p${i}`, quantity: null, unit: null, note: null, category: 'overig', addedMs: 1 }, formatHlc(1_759_740_000_000 + i, 0, N)));
    }
    const renders = new Map<string, number>();
    const Counted = memo(function Counted(p: { item: ItemView; onToggle: (id: string) => void; onEdit: (id: string) => void; onDelete: (id: string, n: string) => void }) {
      renders.set(p.item.id, (renders.get(p.item.id) ?? 0) + 1);
      return <ItemRow {...p} />;
    });
    const onToggle = () => {};
    const onEdit = () => {};
    const onDelete = () => {};
    const group = createSwipeGroup();
    const List = ({ view }: { view: ReturnType<typeof materialize> }) => (
      <SwipeGroupProvider group={group}>
        {view.sections
          .flatMap((s) => s.items)
          .map((it) => (
            <Counted key={it.id} item={it} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />
          ))}
      </SwipeGroupProvider>
    );
    const r = render(<List view={materialize(l)} />);
    const total = () => [...renders.values()].reduce((a, b) => a + b, 0);
    expect(total()).toBe(1000);
    expect(r.getAllByRole('checkbox')[0].props.accessibilityActions).toEqual([{ name: 'delete', label: strings.swipeDelete }]);
    l = mergeList(l, editItemDelta(l.items.get('I000000000000500')!, { x: true }, new HlcClock(N), 1_759_750_000_000));
    r.rerender(<List view={materialize(l)} />);
    expect(total()).toBe(1001);
    expect(renders.get('I000000000000500')).toBe(2);
  });
});

describe('UX-15 / review S-1: volledige swipe op een echt toestel (iPhone 16, rij 393 pt)', () => {
  const W = 393;
  async function setup() {
    const d = await singleDevice({ seed: 152 });
    const listId = d.app.lists()[0].id;
    for (const n of ['melk', 'brood']) d.app.addItem(listId, { text: n });
    makeStore(d.app);
    mockH.params = { id: listId };
    render(<ListScreen />);
    const id = itemIdByName(d.app, listId, 'melk')!;
    // Echte rijbreedte zoals op het toestel.
    await act(async () => {
      fireEvent(screen.getByTestId(`item-${id}`), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: W, height: 56 } } });
    });
    return { d, listId, id };
  }
  /** Vingerbeweging naar links: oplopend tot de gegeven punten, loslaten op het laatste punt. */
  async function drag(id: string, xs: number[]) {
    await act(async () => {
      fireGestureHandler(getByGestureTestId(`swipe-item-${id}`), [
        { state: State.BEGAN, translationX: 0 },
        { state: State.ACTIVE, translationX: xs[0] },
        ...xs.slice(1).map((x) => ({ translationX: x })),
        { state: State.END, translationX: xs[xs.length - 1] },
      ]);
    });
  }

  it('S-1: drempel op vingerafstand: 60% van 393 pt is een volledige swipe, 40% niet', () => {
    expect(isFullSwipe(-0.6 * W, W)).toBe(true);
    expect(isFullSwipe(-0.52 * W, W)).toBe(true);
    expect(isFullSwipe(-0.4 * W, W)).toBe(false);
    expect(isFullSwipe(-SWIPE_ACTION_WIDTH, W)).toBe(false);
  });

  it('S-1: slepen tot ±60% en loslaten verwijdert het item (met snackbar), precies één keer', async () => {
    const { d, listId, id } = await setup();
    const spy = jest.spyOn(d.app, 'deleteItem');
    await drag(id, [-40, -120, -0.6 * W]);
    // ReanimatedSwipeable veert daarna terug naar de actie en meldt pas dan willOpen; dat mag niets dubbel doen.
    await act(async () => {
      fireEvent(screen.getByText('brood'), 'swipeableWillOpen', 'left'); // andere rij: geen invloed
    });
    expect(itemIdByName(d.app, listId, 'melk')).toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(screen.getByText(strings.itemDeleted('melk'))).toBeTruthy();
  });

  it('S-1: 40% slepen opent alleen de actie; ver slepen en weer terug vóór loslaten verwijdert niet', async () => {
    const { d, listId, id } = await setup();
    await drag(id, [-40, -0.4 * W]);
    expect(itemIdByName(d.app, listId, 'melk')).toBeDefined();
    await drag(id, [-60, -0.7 * W, -100]);
    expect(itemIdByName(d.app, listId, 'melk')).toBeDefined();
    expect(mockH.alerts).toHaveLength(0);
  });

  it('S-1: de rij is bij willOpen al teruggeveerd naar de actie (-96): de volledige swipe telt toch, en maar één keer', async () => {
    const { d, listId, id } = await setup();
    const spy = jest.spyOn(d.app, 'deleteItem');
    const s = swipeableOf('melk');
    const willOpen = s.props.onSwipeableWillOpen as (dir: string) => void;
    const opened = s.props.onSwipeableOpen as ((dir: string) => void) | undefined;
    await drag(id, [-50, -0.55 * W]);
    // Wat ReanimatedSwipeable daarna (via runOnJS) nog meldt: terugveren naar de actie, willOpen en open.
    await act(async () => {
      willOpen('left');
      opened?.('left');
    });
    expect(itemIdByName(d.app, listId, 'melk')).toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('UX-16 (CR-02): lijst verwijderen door in het overzicht naar links te swipen', () => {
  async function setupLocal() {
    const d = await singleDevice({ seed: 161 });
    d.app.createList('Feestje');
    makeStore(d.app);
    render(<ListsScreen />);
    return d;
  }

  it('UX-16: swipe toont "Verwijderen"; tik toont altijd de bevestiging; annuleren roept de facade niet aan en klapt de rij dicht', async () => {
    const d = await setupLocal();
    const spy = jest.spyOn(d.app, 'deleteList');
    expect(screen.queryByRole('button', { name: strings.swipeDeleteList('Feestje') })).toBeNull();
    await swipeOpen('Feestje');
    await press(screen.getByRole('button', { name: strings.swipeDeleteList('Feestje') }));
    expect(mockH.alerts).toHaveLength(1);
    expect(mockH.alerts[0].title).toBe(strings.confirm.deleteLocalTitle);
    await pressAlert(strings.cancel);
    expect(spy).not.toHaveBeenCalled();
    expect(d.app.lists().map((l) => l.name)).toContain('Feestje');
    expect(screen.queryByRole('button', { name: strings.swipeDeleteList('Feestje') })).toBeNull();
  });

  it('UX-16: ook een volledige swipe verwijdert nooit zonder bevestiging; bevestigen verwijdert en de lijst verdwijnt', async () => {
    const d = await setupLocal();
    const spy = jest.spyOn(d.app, 'deleteList');
    await swipeFull('Feestje');
    expect(spy).not.toHaveBeenCalled();
    expect(mockH.alerts).toHaveLength(1);
    await pressAlert(strings.confirm.deleteButton);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(d.app.lists().map((l) => l.name)).not.toContain('Feestje');
    expect(screen.queryByText('Feestje')).toBeNull();
    expect(screen.getByText('Boodschappen')).toBeTruthy();
  });

  it('UX-16: gedeelde lijst: dialoog noemt "alle telefoons" en biedt "Lijst verlaten" (leave, niet deleteList)', async () => {
    const w = await makeWorld();
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B');
    const ids = await shareAndJoin(w, a, [b]);
    const la = ids.get(a)!;
    const name = a.app.lists().find((l) => l.id === la)!.name;
    const del = jest.spyOn(a.app, 'deleteList');
    const leave = jest.spyOn(a.app, 'leave');
    makeStore(a.app);
    render(<ListsScreen />);
    await swipeOpen(name);
    await press(screen.getByRole('button', { name: strings.swipeDeleteList(name) }));
    expect(mockH.alerts[0].title).toBe(strings.confirm.deleteSharedTitle);
    expect(mockH.alerts[0].message).toMatch(/alle telefoons/);
    expect(mockH.alerts[0].buttons.map((x) => x.text)).toEqual([strings.cancel, strings.leaveList, strings.confirm.deleteEverywhere]);
    await pressAlert(strings.leaveList);
    await pressAlert(strings.confirm.leaveDelete);
    expect(leave).toHaveBeenCalledWith(la, false);
    expect(del).not.toHaveBeenCalled();
    expect(a.app.lists().some((l) => l.id === la)).toBe(false);
  });

  it('UX-16: één open rij tegelijk; tikken op een lijst opent hem nog steeds; accessibility action "Verwijderen" vraagt bevestiging', async () => {
    const d = await setupLocal();
    await swipeOpen('Boodschappen');
    await swipeOpen('Feestje');
    expect(screen.queryByRole('button', { name: strings.swipeDeleteList('Boodschappen') })).toBeNull();
    expect(screen.getByRole('button', { name: strings.swipeDeleteList('Feestje') })).toBeTruthy();
    const card = screen.getByRole('button', { name: /^Boodschappen,/ });
    await press(card);
    expect(mockRouter.push).toHaveBeenCalledWith(`/lijst/${d.app.lists().find((l) => l.name === 'Boodschappen')!.id}`);
    expect(screen.queryByRole('button', { name: strings.swipeDeleteList('Feestje') })).toBeNull();
    expect(card.props.accessibilityActions).toEqual([{ name: 'delete', label: strings.swipeDelete }]);
    await act(async () => {
      fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });
    });
    expect(mockH.alerts.at(-1)?.title).toBe(strings.confirm.deleteLocalTitle);
    await pressAlert(strings.cancel);
    expect(d.app.lists()).toHaveLength(2);
  });

  it('UX-16: het ⋯-menu in de lijst blijft bestaan met "Lijst verwijderen"', async () => {
    const d = await setupLocal();
    mockH.params = { id: d.app.lists()[0].id };
    render(<ListScreen />);
    await press(screen.getByRole('button', { name: strings.menu }));
    expect(mockH.alerts.at(-1)?.buttons.map((x) => x.text)).toContain(strings.deleteList);
  });
});
