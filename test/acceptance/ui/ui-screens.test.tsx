// UI-acceptatietests (Eindtester): lijstenoverzicht, delen, koppelen via geplakte code (ook ongeldig) en relay-instellingen.
// F-01, F-13, F-14, F-15, F-19, UX-06, UX-07, UX-10, UX-11, NF-05, B-02.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ctx, makeStore, resetUi, router } from './harness';
import { singleDevice } from '../../support/single';
import { addDevice, makeWorld, shareAndJoin } from '../../sim/hub';
import { strings } from '../../../src/ui/strings.nl';
import { DEFAULT_CONFIG } from '../../../src/config';

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
jest.mock('expo-camera', () => {
  const h = require('./harness');
  return { CameraView: () => null, useCameraPermissions: () => [h.ctx.camera, jest.fn()] };
});
jest.mock('expo-clipboard', () => {
  const h = require('./harness');
  return {
    getStringAsync: jest.fn(async () => h.ctx.clipboard),
    setStringAsync: jest.fn(async (t: string) => {
      h.ctx.clipboard = t;
      return true;
    }),
  };
});

import ListsScreen from '../../../app/index';
import JoinScreen from '../../../app/koppelen';
import SettingsScreen from '../../../app/instellingen';
import ShareScreen from '../../../app/lijst/[id]/delen';

const press = async (el: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(el);
  });
};
function allText(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined) return out;
  if (typeof node === 'string') return out.concat(node);
  if (Array.isArray(node)) {
    for (const n of node) allText(n, out);
    return out;
  }
  const o = node as { props?: Record<string, unknown>; children?: unknown };
  for (const k of ['accessibilityLabel', 'placeholder']) if (typeof o.props?.[k] === 'string') out.push(o.props[k] as string);
  allText(o.children, out);
  return out;
}

describe('F-01 / UX-10 / UX-11: lijstenoverzicht', () => {
  it('ET-F01-2: eerste start: één lijst "Boodschappen" met "Nog leeg"; nieuwe lijst maken via de dialoog; lege naam kan niet', async () => {
    resetUi();
    const d = await singleDevice({ seed: 21 });
    makeStore(d.app);
    render(<ListsScreen />);
    expect(screen.getByText('Boodschappen')).toBeTruthy();
    expect(screen.getByText(strings.emptyItemsCount)).toBeTruthy();
    await press(screen.getByRole('button', { name: strings.newList }));
    const input = screen.getByLabelText(strings.newListPlaceholder);
    expect(input.props.maxLength).toBe(40);
    expect(screen.getByRole('button', { name: strings.create }).props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.changeText(input, 'Feestje');
    await press(screen.getByRole('button', { name: strings.create }));
    expect(d.app.lists().map((l) => l.name)).toEqual(['Boodschappen', 'Feestje']);
    expect(router.push).toHaveBeenCalledWith(expect.stringMatching(/^\/lijst\//));
  });

  it('ET-F01-3: alle lijsten weg -> begrijpelijke lege toestand met uitleg; knoppen "Nieuwe lijst" en "Lijst toevoegen" blijven beschikbaar', async () => {
    resetUi();
    const d = await singleDevice({ seed: 22 });
    makeStore(d.app);
    await d.app.deleteList(d.app.lists()[0].id);
    render(<ListsScreen />);
    expect(screen.getByText(strings.listsEmptyTitle)).toBeTruthy();
    expect(screen.getByText(strings.listsEmptyBody)).toBeTruthy();
    await press(screen.getByRole('button', { name: strings.addSharedList }));
    expect(router.push).toHaveBeenCalledWith('/koppelen');
  });

  it('ET-UX10-2: de lijstkaart toont "x van y afgevinkt" en de naam in het toegankelijkheidslabel; geen jargon', async () => {
    resetUi();
    const d = await singleDevice({ seed: 23 });
    const store = makeStore(d.app);
    const listId = d.app.lists()[0].id;
    for (const n of ['Melk', 'Brood', 'Kaas']) d.app.addItem(listId, { text: n });
    const first = d.app.view(listId).sections[0].items[0];
    store.actions.toggle(listId, first.id);
    render(<ListsScreen />);
    expect(screen.getByText('1 van 3 afgevinkt')).toBeTruthy();
    expect(screen.getByLabelText(/^Boodschappen, 1 van 3 afgevinkt/)).toBeTruthy();
    expect(allText(screen.toJSON()).join(' ')).not.toMatch(/relay|hlc|nostr|crdt/i);
  });
});

describe('F-13 / NF-05 / B-02: delen', () => {
  it('ET-F13-2: het deelscherm toont QR, code, waarschuwing "alleen met mensen die je vertrouwt" en "Klaar om te koppelen"; kopiëren zet de deeltekst op het klembord', async () => {
    resetUi();
    const w = await makeWorld();
    const a = await addDevice(w, 'A');
    const la = a.app.lists()[0].id;
    makeStore(a.app);
    ctx.params = { id: la };
    render(<ShareScreen />);
    await act(async () => {
      await w.settle(10_000);
    });
    expect(await screen.findByText(strings.readyToJoin)).toBeTruthy();
    expect(screen.getByText(strings.shareWarning)).toBeTruthy();
    const info = await a.app.shareInfo(la);
    expect(screen.getByText(info.code)).toBeTruthy();
    expect(info.text).toContain('boodschap://join#'); // ST-10: nieuw schema
    await press(screen.getByRole('button', { name: strings.copyCode }));
    await act(async () => {});
    expect(ctx.clipboard).toBe(info.text);
    expect(ctx.store!.getState().message?.text).toBe(strings.copied);
    expect(screen.getByText(strings.copied)).toBeTruthy(); // D-ET-06: de bevestiging is ook echt zichtbaar op het deelscherm
    expect(allText(screen.toJSON()).join(' ')).not.toMatch(/relay|hlc|nostr|crdt/i);
  });
});

describe('F-14 / F-15 / UX-06: koppelen via geplakte code', () => {
  async function pair() {
    resetUi();
    const w = await makeWorld();
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B');
    const la = a.app.lists()[0].id;
    for (const n of ['Melk', 'Brood', 'Kaas']) a.app.addItem(la, { text: n });
    const info = await a.app.share(la);
    await w.settle(10_000);
    makeStore(b.app);
    return { w, a, b, la, info };
  }
  const openPaste = async () => {
    await press(screen.getByRole('tab', { name: strings.pasteTab }));
  };
  const paste = async (text: string) => {
    fireEvent.changeText(screen.getByLabelText(strings.pastePlaceholder), text);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: strings.join }));
    });
  };

  it('ET-F15-1: camera geweigerd -> uitleg met verwijzing naar plakken; plakken van de hele deeltekst koppelt en opent de lijst', async () => {
    const { w, b, info } = await pair();
    ctx.camera = { granted: false, canAskAgain: false };
    render(<JoinScreen />);
    expect(screen.getByText(strings.cameraDenied)).toBeTruthy();
    expect(strings.cameraDenied).toMatch(/plakken/);
    await press(screen.getByRole('button', { name: strings.usePaste }));
    await paste('Hoi! ' + info.text + ' Groetjes');
    expect(b.app.lists().filter((l) => l.shared)).toHaveLength(1);
    expect(router.replace).toHaveBeenCalledWith(expect.stringMatching(/^\/lijst\//));
    await act(async () => {
      await w.settle(20_000);
    });
    const listId = b.app.lists().find((l) => l.shared)!.id;
    expect(b.app.view(listId).sections.flatMap((s) => s.items).map((i) => i.name).sort()).toEqual(['Brood', 'Kaas', 'Melk']);
  });

  it('ET-F15-2: de knop "Plakken" haalt de tekst van het klembord; alleen de code of alleen de link werkt ook', async () => {
    const { b, info } = await pair();
    ctx.camera = { granted: false, canAskAgain: true };
    render(<JoinScreen />);
    await openPaste();
    ctx.clipboard = info.code;
    await press(screen.getByRole('button', { name: strings.pasteFromClipboard }));
    await act(async () => {});
    expect(screen.getByLabelText(strings.pastePlaceholder).props.value).toBe(info.code);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: strings.join }));
    });
    expect(b.app.lists().filter((l) => l.shared)).toHaveLength(1);
  });

  it('ET-F14-4: ongeldige of beschadigde invoer geeft een begrijpelijke Nederlandse melding, geen crash en geen extra lijst', async () => {
    const { b, info } = await pair();
    render(<JoinScreen />);
    await openPaste();
    const before = b.app.lists().length;
    const typo = info.code.slice(0, 12) + (info.code[12] === 'A' ? 'B' : 'A') + info.code.slice(13);
    const cases: [string, string[]][] = [
      ['hallo, dit is geen code', [strings.joinErrors['geen-code']]],
      [info.code.slice(0, 25), [strings.joinErrors.beschadigd, strings.joinErrors.controlesom]],
      [typo, [strings.joinErrors.controlesom, strings.joinErrors.beschadigd]],
      ['bootschap://join#onzin', [strings.joinErrors.beschadigd, strings.joinErrors['geen-code'], strings.joinErrors.controlesom]],
    ];
    for (const [input, accepted] of cases) {
      await paste(input);
      const shown = allText(screen.toJSON()).join(' | ');
      expect([input, accepted.some((m) => screen.queryByText(m) !== null)]).toEqual([input, true]);
      const msg = accepted.find((m) => screen.queryByText(m) !== null) ?? '';
      expect(msg).not.toMatch(/relay|hlc|nostr|crdt|exception|undefined|\[object/i);
      expect(shown).not.toMatch(/exception|undefined|\[object/i);
    }
    expect(b.app.lists()).toHaveLength(before);
    expect(router.replace).not.toHaveBeenCalled();
    // en daarna werkt de echte code gewoon, en de foutmelding verdwijnt
    await paste(info.text);
    expect(router.replace).toHaveBeenCalledTimes(1);
  });

  it('ET-F14-5: dezelfde lijst nogmaals koppelen opent de bestaande lijst en toont "Deze lijst staat al op je telefoon" (geen tweede kopie)', async () => {
    const { w, b, info } = await pair();
    render(<JoinScreen />);
    await openPaste();
    await paste(info.text);
    await act(async () => {
      await w.settle(20_000);
    });
    router.replace.mockClear();
    await paste(info.text);
    expect(b.app.lists().filter((l) => l.shared)).toHaveLength(1);
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(ctx.store!.getState().message?.text).toBe(strings.alreadyPresent);
  });

  it('ET-UX11-2: de camera wordt pas gevraagd op het koppelscherm (niet vooraf): zonder toestemming is er een knop "Camera toestaan" en een alternatief', async () => {
    await pair();
    ctx.camera = { granted: false, canAskAgain: true };
    render(<JoinScreen />);
    expect(screen.getByText(strings.cameraNeeded)).toBeTruthy();
    expect(screen.getByRole('button', { name: strings.allowCamera })).toBeTruthy();
    expect(screen.getByRole('button', { name: strings.usePaste })).toBeTruthy();
  });
});

describe('F-19 / UX-06: relay-instellingen', () => {
  async function settings() {
    resetUi();
    const d = await singleDevice({ seed: 31 });
    makeStore(d.app);
    render(<SettingsScreen />);
    await act(async () => {});
    return d;
  }
  const add = async (url: string) => {
    fireEvent.changeText(screen.getByPlaceholderText(strings.relayPlaceholder), url);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: strings.addRelay }));
    });
    await act(async () => {});
  };

  it('ET-F19-1: toont de 4 standaardrelays; ws:// (zonder TLS) en onzin worden geweigerd met een melding en veranderen niets', async () => {
    const d = await settings();
    for (const r of DEFAULT_CONFIG.defaultRelays) expect(screen.getByText(r)).toBeTruthy();
    for (const bad of ['ws://relay.example.com', 'http://relay.example.com', 'relay.example.com', 'wss://', 'wss://met spatie.nl', 'wss://ok.nl extra']) {
      await add(bad);
      expect([bad, screen.queryByText(strings.relayInvalid) !== null]).toEqual([bad, true]);
    }
    expect(await d.app.relays()).toEqual(DEFAULT_CONFIG.defaultRelays);
  });

  it('ET-F19-2: het gegeven wss://-adres wordt toegevoegd en blijft bewaard; verwijderen werkt; de laatste relay kan niet weg', async () => {
    const d = await settings();
    await add('wss://relay.voorbeeld.nl');
    expect(screen.getByText('wss://relay.voorbeeld.nl')).toBeTruthy();
    expect(await d.app.relays()).toContain('wss://relay.voorbeeld.nl');
    expect(screen.queryByText(strings.relayInvalid)).toBeNull();
    for (const r of [...DEFAULT_CONFIG.defaultRelays]) await press(screen.getByRole('button', { name: strings.removeRelay(r) }));
    await act(async () => {});
    expect(await d.app.relays()).toEqual(['wss://relay.voorbeeld.nl']);
    await press(screen.getByRole('button', { name: strings.removeRelay('wss://relay.voorbeeld.nl') }));
    expect(screen.getByText(strings.relayMinimum)).toBeTruthy();
    expect(await d.app.relays()).toEqual(['wss://relay.voorbeeld.nl']);
    await press(screen.getByRole('button', { name: strings.resetRelays }));
    await act(async () => {});
    expect(await d.app.relays()).toEqual(DEFAULT_CONFIG.defaultRelays);
  });

  it('ET-UX09-2: invoerveld en knop op het instellingenscherm hebben verschillende toegankelijkheidslabels (O-ET-09)', async () => {
    await settings();
    const input = screen.getByPlaceholderText(strings.relayPlaceholder);
    const button = screen.getByRole('button', { name: strings.addRelay });
    expect(input.props.accessibilityLabel).toBeTruthy();
    expect(input.props.accessibilityLabel).not.toBe(button.props.accessibilityLabel);
  });

  it('ET-F19-3: de facade zelf weigert ws:// en lege relaylijsten ook (verdediging in de diepte)', async () => {
    const d = await settings();
    await expect(d.app.setRelays(['ws://relay.example.com'])).rejects.toBeDefined();
    await expect(d.app.setRelays([])).rejects.toBeDefined();
    expect(await d.app.relays()).toEqual(DEFAULT_CONFIG.defaultRelays);
  });

  it('ET-NF05-2: instellingen leggen privacy uit en waarschuwen dat iedereen met de code kan meedoen', async () => {
    await settings();
    expect(screen.getByText(strings.privacyBody)).toBeTruthy();
    expect(screen.getByText(strings.shareWarning)).toBeTruthy();
  });
});

describe('UX-01 / UX-06: Nederlandse teksten buiten de instellingen zonder jargon', () => {
  it('ET-UX01-1: alle gebruikersteksten behalve instellingen/privacy bevatten geen "relay", "HLC", "Nostr" of Engelse standaardwoorden', () => {
    const { relaysTitle, relaysIntro, relayPlaceholder, addRelay, removeRelay, relayInvalid, relayMinimum, resetRelays, privacyBody, ...rest } = strings as unknown as Record<string, unknown>;
    void [relaysTitle, relaysIntro, relayPlaceholder, addRelay, removeRelay, relayInvalid, relayMinimum, resetRelays, privacyBody];
    const flat: string[] = [];
    const walk = (v: unknown): void => {
      if (typeof v === 'string') flat.push(v);
      else if (typeof v === 'function') {
        try {
          flat.push(String((v as (...a: unknown[]) => unknown)('x', 2, 3)));
        } catch {
          /* */
        }
      } else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(rest);
    expect(flat.length).toBeGreaterThan(100);
    for (const t of flat) expect([t, /relay|hlc|nostr|crdt|tombstone|snapshot/i.test(t)]).toEqual([t, false]);
    for (const t of flat) expect([t, /\b(Error|Cancel|Delete|Loading|Retry|Please)\b/.test(t)]).toEqual([t, false]);
  });
});

describe('NF-05 / B-02: het klembord wordt na het koppelen leeggemaakt als er de deelcode op staat', () => {
  async function pairing() {
    resetUi();
    const w = await makeWorld();
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B');
    const info = await a.app.share(a.app.lists()[0].id);
    await w.settle(10_000);
    makeStore(b.app);
    ctx.camera = { granted: false, canAskAgain: true };
    render(<JoinScreen />);
    await press(screen.getByRole('tab', { name: strings.pasteTab }));
    return { b, info };
  }

  it('ET-NF05-3: na een geslaagde koppeling met de code via "Plakken" staat het klembord leeg', async () => {
    const { info } = await pairing();
    ctx.clipboard = info.text;
    await press(screen.getByRole('button', { name: strings.pasteFromClipboard }));
    await act(async () => {});
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: strings.join }));
    });
    await act(async () => {});
    expect(router.replace).toHaveBeenCalled();
    expect(ctx.clipboard).toBe('');
  });

  it('ET-NF05-4: een foute code laat het klembord ongemoeid (opnieuw proberen kan); ander klembordinhoud wordt nooit gewist', async () => {
    const { info } = await pairing();
    ctx.clipboard = 'boodschappen: melk, brood';
    fireEvent.changeText(screen.getByLabelText(strings.pastePlaceholder), info.code.slice(0, 20));
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: strings.join }));
    });
    await act(async () => {});
    expect(router.replace).not.toHaveBeenCalled();
    ctx.clipboard = 'boodschappen: melk, brood';
    fireEvent.changeText(screen.getByLabelText(strings.pastePlaceholder), info.text);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: strings.join }));
    });
    await act(async () => {});
    expect(router.replace).toHaveBeenCalled();
    expect(ctx.clipboard).toBe('boodschappen: melk, brood');
  });
});
