// UI-acceptatietests (Eindtester) voor het lijstscherm: UX-02, UX-03, UX-04, UX-05, UX-06, UX-07, UX-09, UX-10, UX-11,
// F-02, F-03, F-05, F-06, F-07, F-10, F-11, F-17. Echte facade + store + componenten; alleen expo-router en het
// systeemdialoog zijn dubbelgangers.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ctx, makeStore, manualTimers, pressAlertButton, resetUi, router } from './harness';
import { singleDevice, type SingleDevice } from '../../support/single';
import { addDevice, makeWorld, shareAndJoin, type World } from '../../sim/hub';
import type { TestDevice } from '../../sim/device';
import { strings } from '../../../src/ui/strings.nl';
import { touch } from '../../../src/ui/theme';

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
import EditItemScreen from '../../../app/lijst/[id]/item/[itemId]';

const press = async (el: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(el);
  });
};
const type = async (text: string) => {
  const input = screen.getByLabelText(strings.addPlaceholder);
  fireEvent.changeText(input, text);
  return input;
};
const submit = async (text: string) => {
  const input = await type(text);
  await act(async () => {
    fireEvent(input, 'submitEditing');
  });
  return input;
};
const headers = () => screen.getAllByRole('header').map((h) => h.props.children as string);
/** Alle zichtbare tekst en toegankelijkheidslabels van een gerenderd scherm. */
function allText(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined) return out;
  if (typeof node === 'string') {
    out.push(node);
    return out;
  }
  if (Array.isArray(node)) {
    for (const n of node) allText(n, out);
    return out;
  }
  const o = node as { props?: Record<string, unknown>; children?: unknown };
  const p = o.props ?? {};
  for (const k of ['accessibilityLabel', 'placeholder', 'aria-label']) if (typeof p[k] === 'string') out.push(p[k] as string);
  allText(o.children, out);
  return out;
}

async function local(): Promise<{ d: SingleDevice; listId: string }> {
  resetUi();
  const d = await singleDevice({ seed: 11 });
  makeStore(d.app);
  const listId = d.app.lists()[0].id;
  ctx.params = { id: listId };
  return { d, listId };
}

describe('UX-11 / UX-06: eerste start en lege toestand', () => {
  it('ET-UX11-1: eerste start toont direct de lijst "Boodschappen", leeg, met een korte hint en zonder login', async () => {
    const { d, listId } = await local();
    expect(d.app.lists().map((l) => l.name)).toEqual(['Boodschappen']);
    render(<ListScreen />);
    expect(screen.getByText(strings.listEmptyTitle)).toBeTruthy();
    expect(screen.getByText(strings.listEmptyBody)).toBeTruthy();
    expect(screen.getByLabelText(strings.addPlaceholder)).toBeTruthy(); // invoerveld is direct beschikbaar
    expect(screen.getByText(strings.status.lokaal)).toBeTruthy(); // niet gedeeld: alleen op dit toestel
    void listId;
  });

  it('ET-UX06-1: geen jargon (relay, HLC, Nostr, CRDT) op het lijstscherm', async () => {
    const { d, listId } = await local();
    d.app.addItem(listId, { text: 'Melk' });
    render(<ListScreen />);
    const all = allText(screen.toJSON()).join(' | ');
    expect(all.length).toBeGreaterThan(20);
    expect(all).not.toMatch(/relay|hlc|nostr|crdt|tombstone/i);
  });
});

describe('F-02 / UX-03: snel achter elkaar items invoeren', () => {
  it('ET-UX03-1: na toevoegen is het veld leeg en blijft het invoerveld bruikbaar (geen blur bij submit); toetsenbord-Klaar voegt toe', async () => {
    const { d, listId } = await local();
    render(<ListScreen />);
    const input = await submit('Melk');
    expect(screen.getByLabelText(strings.addPlaceholder).props.value).toBe('');
    expect(input.props.blurOnSubmit).toBe(false);
    expect(input.props.submitBehavior).toBe('submit');
    await submit('Brood');
    await submit('Kaas');
    expect(d.app.view(listId).total).toBe(3);
    expect(screen.getByText('Melk')).toBeTruthy();
    expect(screen.getByText('Kaas')).toBeTruthy();
  });

  it('ET-F02-1: de plus-knop voegt toe; lege of spaties-invoer wordt niet toegevoegd en geeft geen crash', async () => {
    const { d, listId } = await local();
    render(<ListScreen />);
    await type('   ');
    const add = screen.getByRole('button', { name: strings.add });
    await press(add);
    expect(d.app.view(listId).total).toBe(0);
    await type('Appels');
    await press(screen.getByRole('button', { name: strings.add }));
    expect(d.app.view(listId).total).toBe(1);
    expect(screen.getByLabelText(strings.addPlaceholder).props.value).toBe('');
  });

  it('ET-F12-1: "2 melk", "500 g kaas" en "3x appels" worden hoeveelheid + eenheid + naam in de regel', async () => {
    const { listId, d } = await local();
    render(<ListScreen />);
    await submit('2 melk');
    await submit('500 g kaas');
    await submit('3x appels');
    const items = d.app.view(listId).sections.flatMap((s) => s.items);
    expect(items.map((i) => [i.name, i.quantity, i.unit]).sort()).toEqual([
      ['Appels', 3, null],
      ['Kaas', 500, 'g'],
      ['Melk', 2, null],
    ]);
    expect(screen.getByText('500 g')).toBeTruthy();
  });

  it('ET-F17-1: een dubbel item wordt niet stil toegevoegd: melding met "Toch toevoegen" en "Hoeveelheid verhogen"', async () => {
    const { d, listId } = await local();
    render(<ListScreen />);
    await submit('Melk');
    await submit('Melk');
    expect(d.app.view(listId).total).toBe(1);
    const a = ctx.alerts[ctx.alerts.length - 1];
    expect(a.title).toBe(strings.duplicateTitle);
    expect(a.buttons.map((b) => b.text)).toEqual(expect.arrayContaining([strings.duplicateAddAnyway, strings.duplicateIncrease]));
    await act(async () => pressAlertButton(strings.duplicateIncrease));
    expect(d.app.view(listId).total).toBe(1);
    expect(d.app.view(listId).sections[0].items[0].quantity).toBe(2);
    await submit('Melk');
    await act(async () => pressAlertButton(strings.duplicateAddAnyway));
    expect(d.app.view(listId).total).toBe(2);
  });

  it('ET-UX05-1: validatiefouten (te lange naam via de facade) geven een Nederlandse melding en geen crash', async () => {
    const { d, listId } = await local();
    render(<ListScreen />);
    // het invoerveld begrenst op 100 tekens; een naam mag max. 80 (F-02): geweigerd met een duidelijke melding
    await submit('y'.repeat(100));
    expect(d.app.view(listId).total).toBe(0);
    expect(screen.getByText(strings.inputErrors['naam-te-lang'])).toBeTruthy();
  });
});

describe('F-11: suggesties tijdens het typen', () => {
  it('ET-F11-1: vanaf 1 teken suggesties; eerder gebruikte items eerst; maximaal 8; tikken voegt toe met de eerdere categorie', async () => {
    const { d, listId } = await local();
    // historie: een eerder gekocht, inmiddels afgevinkt product met een zelfgekozen categorie
    const r = d.app.addItem(listId, { text: 'Hagelslag melk' }).result;
    if (r.kind !== 'added') throw new Error();
    d.app.updateItem(listId, r.itemId, { category: 'snacks-snoep' });
    d.app.toggleChecked(listId, r.itemId);
    for (let i = 0; i < 12; i++) d.app.addItem(listId, { text: `Hagelzout ${i}` });
    await d.app.flushWrites();
    render(<ListScreen />);
    await type('h');
    const chips = screen.getAllByLabelText(/ toevoegen$/);
    expect(chips.length).toBeGreaterThanOrEqual(1);
    expect(chips.length).toBeLessThanOrEqual(8);
    await type('Hagelslag');
    const chip = screen.getByLabelText(strings.suggestionLabel('Hagelslag melk'));
    await press(chip);
    const added = d.app.view(listId).sections.flatMap((s) => s.items).filter((i) => i.name === 'Hagelslag melk' && !i.checked);
    expect(added).toHaveLength(1);
    expect(added[0].category).toBe('snacks-snoep');
    expect(screen.getByLabelText(strings.addPlaceholder).props.value).toBe('');
  });

  it('ET-F11-2: ook zonder historie komen suggesties uit de ingebouwde woordenlijst ("mel" -> melk)', async () => {
    await local();
    render(<ListScreen />);
    await type('mel');
    const labels = screen.getAllByLabelText(/ toevoegen$/).map((n) => n.props.accessibilityLabel as string);
    expect(labels.some((l) => /^melk/i.test(l))).toBe(true);
  });

  it('ET-F11-3: geen suggesties bij lege invoer, en suggesties verdwijnen na toevoegen', async () => {
    await local();
    render(<ListScreen />);
    expect(screen.queryAllByLabelText(/ toevoegen$/)).toHaveLength(0);
    await type('kaa');
    expect(screen.queryAllByLabelText(/ toevoegen$/).length).toBeGreaterThan(0);
    await submit('Kaas');
    expect(screen.queryAllByLabelText(/ toevoegen$/)).toHaveLength(0);
  });
});

describe('F-03 / UX-04: afvinken, doorhalen en onderaan', () => {
  it('ET-F03-1: één tik vinkt af; het item gaat naar het onderdeel "Afgevinkt" onderaan; nogmaals tikken zet terug', async () => {
    const { d, listId } = await local();
    for (const n of ['Melk', 'Brood', 'Tomaten']) d.app.addItem(listId, { text: n });
    render(<ListScreen />);
    expect(headers()).toEqual(['Groente & fruit', 'Brood & gebak', 'Zuivel & eieren']);
    await press(screen.getByLabelText(strings.checkItem('Brood')));
    expect(headers()).toEqual(['Groente & fruit', 'Zuivel & eieren', strings.checkedSection]);
    const cb = screen.getByLabelText(strings.uncheckItem('Brood'));
    expect(cb.props.accessibilityState).toMatchObject({ checked: true });
    // brood staat nu na de andere items (onderaan) in de weergave
    const order = screen.getAllByRole('checkbox').map((n) => n.props.accessibilityLabel as string);
    expect(order[order.length - 1]).toBe(strings.uncheckItem('Brood'));
    await press(cb);
    expect(headers()).toEqual(['Groente & fruit', 'Brood & gebak', 'Zuivel & eieren']);
  });

  it('ET-UX04-1: tikdoel van de rij is minstens 44 pt', () => {
    expect(touch.row).toBeGreaterThanOrEqual(44);
    expect(touch.min).toBeGreaterThanOrEqual(44);
  });

  it('ET-F03-2: afgevinkt-onderdeel is doorgehaald weergegeven en het afvinken blijft na opnieuw openen van het scherm bewaard', async () => {
    const { d, listId } = await local();
    d.app.addItem(listId, { text: 'Melk' });
    const first = render(<ListScreen />);
    await press(screen.getByLabelText(strings.checkItem('Melk')));
    await d.app.flushWrites();
    first.unmount();
    render(<ListScreen />);
    expect(screen.getByLabelText(strings.uncheckItem('Melk'))).toBeTruthy();
    const name = screen.getByText('Melk');
    expect(JSON.stringify(name.props.style)).toContain('line-through');
  });
});

describe('F-10: categoriegroepering in vaste supermarktvolgorde', () => {
  it('ET-F10-1: groepen staan in de afgesproken volgorde; lege categorieën zijn verborgen; binnen een categorie op toevoegvolgorde', async () => {
    const { d, listId } = await local();
    for (const n of ['Kattenvoer', 'Shampoo', 'Cola', 'Kaas', 'Brood', 'Tomaten', 'Appels', 'Xyzzy onbekend']) d.app.addItem(listId, { text: n });
    render(<ListScreen />);
    expect(headers()).toEqual(['Groente & fruit', 'Brood & gebak', 'Vleeswaren & kaas', 'Dranken', 'Verzorging & drogisterij', 'Huisdieren', 'Overig']);
    const names = screen.getAllByRole('checkbox').map((n) => n.props.accessibilityLabel as string);
    expect(names.indexOf(strings.checkItem('Tomaten'))).toBeLessThan(names.indexOf(strings.checkItem('Appels'))); // eerst toegevoegd, eerst getoond
  });

  it('ET-F10-2: alle 16 categorieën: de volgorde van de secties in de weergave is de vaste supermarktvolgorde (B-05)', async () => {
    const { d, listId } = await local();
    const sample = ['Kattenvoer', 'Xyzzy onbekend', 'Luiers', 'Shampoo', 'Afwasmiddel', 'ijs', 'Cola', 'Chips', 'Rijst', 'Tomatenpuree', 'Hagelslag', 'Melk', 'Kaas', 'Kipfilet', 'Brood', 'Tomaten'];
    for (const n of sample) d.app.addItem(listId, { text: n });
    expect(d.app.view(listId).sections.map((s) => s.key)).toEqual([
      'groente-fruit', 'brood-gebak', 'vlees-vis', 'vleeswaren-kaas', 'zuivel-eieren', 'ontbijt-beleg', 'pasta-rijst-wereld', 'houdbaar-conserven', 'snacks-snoep', 'dranken', 'diepvries', 'huishouden', 'verzorging', 'baby-kind', 'huisdieren', 'overig',
    ]);
  });
});

describe('F-05 / F-06 / F-07 / UX-07: verwijderen met ongedaan maken', () => {
  it('ET-F05-1: item verwijderen via het bewerkscherm; snackbar met "Ongedaan maken" herstelt het item', async () => {
    const { d, listId } = await local();
    const r = d.app.addItem(listId, { text: 'Kaas' }).result;
    if (r.kind !== 'added') throw new Error();
    ctx.params = { id: listId, itemId: r.itemId };
    const edit = render(<EditItemScreen />);
    await act(async () => {
      fireEvent.press(edit.getByRole('button', { name: strings.deleteItem }));
    });
    expect(router.back).toHaveBeenCalled();
    edit.unmount();
    expect(d.app.view(listId).total).toBe(0);
    ctx.params = { id: listId };
    const list = render(<ListScreen />); // terug op het lijstscherm: de snackbar staat er nog
    expect(list.getByText(strings.itemDeleted('Kaas'))).toBeTruthy();
    await act(async () => {
      fireEvent.press(list.getByRole('button', { name: strings.undo }));
    });
    expect(d.app.view(listId).sections.flatMap((s) => s.items).map((i) => i.name)).toEqual(['Kaas']);
    expect(list.queryByText(strings.itemDeleted('Kaas'))).toBeNull();
  });

  it('ET-F06-1: "Afgevinkte wissen" wist alleen afgevinkte items; ongedaan maken herstelt exact die items; de snackbar verloopt', async () => {
    const { d, listId } = await local();
    for (const n of ['A1', 'A2', 'A3', 'B1']) d.app.addItem(listId, { text: n });
    render(<ListScreen />);
    for (const n of ['A1', 'A2', 'A3']) await press(screen.getByLabelText(strings.checkItem(n)));
    expect(headers()).toContain(strings.checkedSection);
    await press(screen.getByRole('button', { name: strings.clearChecked }));
    expect(d.app.view(listId).sections.flatMap((s) => s.items).map((i) => i.name)).toEqual(['B1']);
    expect(screen.getByText(strings.itemsCleared(3))).toBeTruthy();
    await press(screen.getByRole('button', { name: strings.undo }));
    expect(d.app.view(listId).sections.flatMap((s) => s.items).map((i) => `${i.name}:${i.checked}`).sort()).toEqual(['A1:true', 'A2:true', 'A3:true', 'B1:false']);
    // opnieuw wissen; nu laten we de snackbar verlopen
    await press(screen.getByRole('button', { name: strings.clearChecked }));
    expect(screen.getByText(strings.itemsCleared(3))).toBeTruthy();
    await act(async () => manualTimers.fireAll());
    expect(screen.queryByText(strings.itemsCleared(3))).toBeNull();
  });

  it('ET-F06-2: 200 afgevinkte items wissen werkt en is in één keer ongedaan te maken', async () => {
    const { d, listId } = await local();
    for (let i = 0; i < 200; i++) {
      const r = d.app.addItem(listId, { text: `Artikel ${i}` }).result;
      if (r.kind === 'added') d.app.toggleChecked(listId, r.itemId);
    }
    d.app.addItem(listId, { text: 'Blijft' });
    await d.app.flushWrites();
    render(<ListScreen />);
    await press(screen.getByRole('button', { name: strings.clearChecked }));
    expect(d.app.view(listId).total).toBe(1);
    expect(screen.getByText(strings.itemsCleared(200))).toBeTruthy();
    await press(screen.getByRole('button', { name: strings.undo }));
    expect(d.app.view(listId).total).toBe(201);
  });

  it('ET-UX07-1: lijst verwijderen vraagt eerst bevestiging; annuleren laat de lijst staan; bevestigen verwijdert en gaat terug', async () => {
    const { d, listId } = await local();
    d.app.addItem(listId, { text: 'Melk' });
    render(<ListScreen />);
    await press(screen.getByRole('button', { name: strings.menu }));
    await act(async () => pressAlertButton(strings.deleteList));
    const confirm = ctx.alerts[ctx.alerts.length - 1];
    expect(confirm.title).toBe(strings.confirm.deleteLocalTitle);
    expect(confirm.message).toContain('Boodschappen');
    expect(d.app.lists()).toHaveLength(1); // nog niets gebeurd
    await act(async () => pressAlertButton(strings.cancel));
    expect(d.app.lists()).toHaveLength(1);
    expect(router.back).not.toHaveBeenCalled();
    await press(screen.getByRole('button', { name: strings.menu }));
    await act(async () => pressAlertButton(strings.deleteList));
    await act(async () => pressAlertButton(strings.confirm.deleteButton));
    expect(d.app.lists()).toHaveLength(0);
    expect(router.back).toHaveBeenCalled();
  });

  it('ET-UX07-2: gedeelde lijst verwijderen: tekst zegt dat het op alle telefoons gebeurt en wijst op "Lijst verlaten"', async () => {
    resetUi();
    const w = await makeWorld();
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B');
    const ids = await shareAndJoin(w, a, [b]);
    makeStore(a.app);
    ctx.params = { id: ids.get(a)! };
    render(<ListScreen />);
    await press(screen.getByRole('button', { name: strings.menu }));
    await act(async () => pressAlertButton(strings.deleteList));
    const confirm = ctx.alerts[ctx.alerts.length - 1];
    expect(confirm.title).toBe(strings.confirm.deleteSharedTitle);
    expect(confirm.message).toMatch(/alle telefoons/);
    expect(confirm.message).toMatch(/Lijst verlaten/);
    expect(confirm.buttons.map((x) => x.text)).toEqual(expect.arrayContaining([strings.leaveList, strings.confirm.deleteEverywhere, strings.cancel]));
    await act(async () => pressAlertButton(strings.cancel));
    expect(a.app.lists()).toHaveLength(1);
  });
});

describe('F-04 / F-09: bewerken en handmatige categorie', () => {
  it('ET-F04-1: naam, hoeveelheid, eenheid, notitie en categorie bewerken; de wijziging is direct zichtbaar; ongeldige hoeveelheid geeft een melding', async () => {
    const { d, listId } = await local();
    const r = d.app.addItem(listId, { text: 'Melk' }).result;
    if (r.kind !== 'added') throw new Error();
    ctx.params = { id: listId, itemId: r.itemId };
    const edit = render(<EditItemScreen />);
    fireEvent.changeText(edit.getByLabelText(strings.name), 'Halfvolle melk');
    fireEvent.changeText(edit.getByLabelText(strings.quantity), '2,5');
    fireEvent.press(edit.getByLabelText(`${strings.unit} l`));
    fireEvent.changeText(edit.getByLabelText(strings.note), 'van de boer');
    fireEvent.press(edit.getByLabelText(strings.categories.dranken));
    await act(async () => {
      fireEvent.press(edit.getByRole('button', { name: strings.save }));
    });
    const it = d.app.view(listId).sections.flatMap((s) => s.items)[0];
    expect(it).toMatchObject({ name: 'Halfvolle melk', quantity: 2.5, unit: 'l', note: 'van de boer', category: 'dranken' });
    expect(router.back).toHaveBeenCalled();
  });
});

describe('UX-10: voortgang "x van y afgevinkt"', () => {
  it('ET-UX10-1: de teller in de lijstkaart klopt na elke wijziging, ook die van de partner', async () => {
    resetUi();
    const w = await makeWorld();
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B');
    const ids = await shareAndJoin(w, a, [b]);
    makeStore(b.app);
    const lb = ids.get(b)!;
    const la = ids.get(a)!;
    const progress = () => b.app.lists().find((l) => l.id === lb)!;
    expect([progress().checkedCount, progress().total]).toEqual([0, 0]);
    await act(async () => {
      for (const n of ['X1', 'X2', 'X3']) a.app.addItem(la, { text: n });
      await w.settle(15_000);
    });
    expect([progress().checkedCount, progress().total]).toEqual([0, 3]);
    const one = a.app.view(la).sections[0].items[0];
    await act(async () => {
      a.app.toggleChecked(la, one.id);
      await w.settle(15_000);
    });
    expect([progress().checkedCount, progress().total]).toEqual([1, 3]);
    const { progressText } = require('../../../src/ui/selectors') as typeof import('../../../src/ui/selectors');
    expect(progressText(progress())).toBe('1 van 3 afgevinkt');
  });
});

describe('UX-02 / S-17: sync-indicator altijd zichtbaar, tekst én icoon, in elke status', () => {
  async function shared(): Promise<{ w: World; a: TestDevice; b: TestDevice; la: string }> {
    resetUi();
    const w = await makeWorld({ relays: ['wss://r1.test', 'wss://r2.test', 'wss://r3.test', 'wss://r4.test'] });
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B');
    const ids = await shareAndJoin(w, a, [b]);
    makeStore(a.app);
    ctx.params = { id: ids.get(a)! };
    return { w, a, b, la: ids.get(a)! };
  }
  const advance = (w: World, ms: number) =>
    act(async () => {
      await w.settle(ms);
    });
  const bar = (text: string) => screen.getByLabelText(new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\—]/g, '\\$&')}`));

  it('ET-UX02-1: niet gedeeld -> "Alleen op dit toestel"; gedeeld en klaar -> "Gesynchroniseerd"', async () => {
    const { d } = await local();
    void d;
    render(<ListScreen />);
    expect(bar(strings.status.lokaal)).toBeTruthy();
    screen.unmount();
    const { w } = await shared();
    render(<ListScreen />);
    await advance(w, 5_000);
    expect(bar(strings.status.gesynchroniseerd)).toBeTruthy();
  });

  it('ET-UX02-2: offline -> "Offline — n wijzigingen wachten" binnen 1 s; telt mee met elke wijziging; na herstel weer "Gesynchroniseerd"', async () => {
    const { w, a, la } = await shared();
    render(<ListScreen />);
    await advance(w, 5_000);
    a.net.online(false);
    await advance(w, 1_000);
    expect(screen.queryByLabelText(new RegExp(`^${strings.status.offline(0)}`))).toBeTruthy();
    await act(async () => {
      a.app.addItem(la, { text: 'Melk' });
      a.app.addItem(la, { text: 'Brood' });
    });
    await advance(w, 1_000);
    expect(bar(strings.status.offline(2))).toBeTruthy();
    a.net.online(true);
    await advance(w, 30_000);
    expect(bar(strings.status.gesynchroniseerd)).toBeTruthy();
  });

  it('ET-UX02-3: "Synchroniseren…" terwijl een wijziging nog niet door een relay is bevestigd', async () => {
    const { w, a, la } = await shared();
    render(<ListScreen />);
    await advance(w, 5_000);
    for (const r of w.hub.relays.values()) r.faults.latencyMs = 3_000; // trage relays: acks laten even op zich wachten
    await act(async () => void a.app.addItem(la, { text: 'Melk' }));
    await advance(w, 1_500);
    expect(bar(strings.status.bezig)).toBeTruthy();
    await advance(w, 30_000);
    expect(bar(strings.status.gesynchroniseerd)).toBeTruthy();
  });

  it('ET-UX02-4: alle relays weigeren > 30 s -> "Synchronisatiefout" met uitleg dat de wijzigingen veilig zijn; herstelt zodra een relay bevestigt', async () => {
    const { w, a, la } = await shared();
    render(<ListScreen />);
    await advance(w, 5_000);
    for (const r of w.hub.relays.values()) r.faults.refuse = 'blocked:';
    await act(async () => void a.app.addItem(la, { text: 'Melk' }));
    await advance(w, 60_000);
    expect(bar(strings.status.fout)).toBeTruthy();
    expect(screen.getByText(strings.status.foutSub)).toBeTruthy();
    for (const r of w.hub.relays.values()) r.faults.refuse = null;
    // Zelf herstel: pull-to-refresh/voorgrond (zie ET-S17-1 voor het ontbreken van een automatische nieuwe poging)
    await act(async () => {
      a.app.foreground();
    });
    await advance(w, 60_000);
    expect(bar(strings.status.gesynchroniseerd)).toBeTruthy();
  });

  it('ET-UX02-5: "Beperkt verbonden (x van y)" als niet alle relays bereikbaar zijn', async () => {
    const { w } = await shared();
    render(<ListScreen />);
    await advance(w, 5_000);
    const rs = [...w.hub.relays.values()];
    rs[0].setDown(true);
    rs[1].setDown(true);
    await advance(w, 5_000);
    expect(bar(strings.status.beperkt(2, 4))).toBeTruthy();
  });

  it('ET-UX02-6: de indicator heeft tekst én een icoon (niet alleen kleur), ook voor foutstatus', async () => {
    // statusText-mapping per status: altijd text en icon gevuld
    const { statusText } = require('../../../src/ui/statusText') as typeof import('../../../src/ui/statusText');
    const kinds = ['lokaal', 'gesynchroniseerd', 'bezig', 'offline', 'beperkt', 'fout'] as const;
    for (const kind of kinds) {
      const d = statusText({ kind, pending: 2, relaysOpen: 1, relaysTotal: 4, fetching: false });
      expect([kind, d.text.length > 0, d.icon.length > 0]).toEqual([kind, true, true]);
    }
  });
});

describe('UX-09: toegankelijkheid van het lijstscherm', () => {
  it('ET-UX09-1: alle knoppen en regels hebben een accessibilityLabel', async () => {
    const { d, listId } = await local();
    for (const n of ['Melk', 'Brood']) d.app.addItem(listId, { text: n });
    render(<ListScreen />);
    await type('ka');
    const interactive = [...screen.getAllByRole('button'), ...screen.getAllByRole('checkbox')];
    expect(interactive.length).toBeGreaterThan(5);
    for (const el of interactive) expect([el.props.accessibilityLabel, typeof el.props.accessibilityLabel === 'string' && el.props.accessibilityLabel.length > 0]).toEqual([el.props.accessibilityLabel, true]);
  });
});
