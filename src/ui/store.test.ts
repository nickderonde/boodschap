// UX-05 (store): de store is een dunne laag; commitfouten (onError) en validatiefouten verschijnen als melding.
// Ook: snackbar met "Ongedaan maken" (F-07) en de dubbel-vraag (F-17).
import { createUiStore } from './store';
import type { AlertFn } from './confirm';
import type { BootschapApp } from '../service/BootschapApp';
import { InputError } from '../core/validate';

function fakeApp() {
  const listeners: { change?: (ids: string[]) => void; error?: (e: { code: string }) => void } = {};
  const calls: string[] = [];
  const app = {
    lists: () => [],
    onChange: (cb: (ids: string[]) => void) => ((listeners.change = cb), () => {}),
    onSyncStatus: () => () => {},
    onError: (cb: (e: { code: string }) => void) => ((listeners.error = cb), () => {}),
    addItem: (_l: string, input: { text: string }, opts?: { force?: boolean }) => {
      calls.push(`add:${input.text}:${opts?.force ? 'force' : ''}`);
      if (!input.text.trim()) throw new InputError('naam-leeg');
      if (input.text === 'melk' && !opts?.force) return { result: { kind: 'duplicate', existingItemId: 'M' }, committed: Promise.resolve() };
      return { result: { kind: 'added', itemId: 'X' }, committed: Promise.reject(new Error('opslag')) };
    },
    increaseQuantity: () => (calls.push('increase'), { result: undefined, committed: Promise.resolve() }),
    deleteItem: () => ({ result: { id: 'tok', listId: 'L', itemIds: ['X'], expiresAtMs: 0 }, committed: Promise.resolve() }),
    undo: () => (calls.push('undo'), { result: undefined, committed: Promise.resolve() }),
  } as unknown as BootschapApp;
  return { app, listeners, calls };
}

const timers = { setTimeout: () => null, clearTimeout: () => {} };

describe('UX-05: store', () => {
  it('UX-05: een commitfout van de facade (onError) wordt als melding getoond', () => {
    const f = fakeApp();
    const store = createUiStore(f.app, { alert: () => {}, timers });
    store.actions.addItem('L', 'kaas'); // committed wordt afgewezen → de facade meldt via onError
    f.listeners.error?.({ code: 'opslaan-mislukt' });
    expect(store.getState().message).toMatchObject({ tone: 'error', text: 'Opslaan is mislukt. Je laatste wijziging is teruggedraaid.' });
  });

  it('UX-05: een validatiefout crasht niet maar geeft een Nederlandse melding', () => {
    const f = fakeApp();
    const store = createUiStore(f.app, { alert: () => {}, timers });
    store.actions.addItem('L', '   ');
    expect(store.getState().message).toMatchObject({ tone: 'error', text: 'Vul een naam in.' });
  });

  it('F-17: dubbel → vraag met "Toch toevoegen" en "Hoeveelheid verhogen"', () => {
    const f = fakeApp();
    let buttons: string[] = [];
    const alert: AlertFn = (_t, _m, b) => {
      buttons = b.map((x) => x.text);
      b.find((x) => x.text === 'Hoeveelheid verhogen')?.onPress?.();
    };
    createUiStore(f.app, { alert, timers }).actions.addItem('L', 'melk');
    expect(buttons).toEqual(['Annuleren', 'Hoeveelheid verhogen', 'Toch toevoegen']);
    expect(f.calls).toEqual(['add:melk:', 'increase']);
  });

  it('F-07: verwijderen toont een snackbar met "Ongedaan maken"; undo roept de facade aan', () => {
    const f = fakeApp();
    const store = createUiStore(f.app, { alert: () => {}, timers });
    store.actions.deleteItem('L', 'X', 'kaas');
    expect(store.getState().message).toMatchObject({ text: '"kaas" verwijderd', undo: { id: 'tok' } });
    store.actions.undo();
    expect(f.calls).toContain('undo');
    expect(store.getState().message).toBeNull();
  });

  it('onChange van de facade verhoogt de versie (hertekenen)', () => {
    const f = fakeApp();
    const store = createUiStore(f.app, { alert: () => {}, timers });
    const v = store.getState().version;
    f.listeners.change?.(['L']);
    expect(store.getState().version).toBe(v + 1);
  });
});
