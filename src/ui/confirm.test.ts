// UX-07 (§12.1): bij annuleren wordt de facade niet aangeroepen, bij bevestigen wel; een gedeelde lijst noemt "alle
// telefoons"; "Lijst verlaten" roept leave aan en niet deleteList.
import { confirmDestructive, type AlertButton, type AlertFn } from './confirm';
import { createUiStore } from './store';
import type { BootschapApp } from '../service/BootschapApp';

function fakeAlert(pick: (buttons: AlertButton[]) => AlertButton | undefined) {
  const shown: { title: string; message: string; buttons: string[] }[] = [];
  const alert: AlertFn = (title, message, buttons) => {
    shown.push({ title, message, buttons: buttons.map((b) => b.text) });
    pick(buttons)?.onPress?.();
  };
  return { alert, shown };
}

function fakeApp(shared: boolean) {
  const calls: string[] = [];
  const app = {
    lists: () => [{ id: 'L', name: 'Weekend', shared, total: 0, checkedCount: 0, position: 0 }],
    onChange: () => () => {},
    onSyncStatus: () => () => {},
    onError: () => () => {},
    deleteList: async () => void calls.push('deleteList'),
    leave: async (_id: string, keep: boolean) => void calls.push(`leave:${keep}`),
  } as unknown as BootschapApp;
  return { app, calls };
}

const timers = { setTimeout: () => null, clearTimeout: () => {} };

describe('UX-07: bevestiging bij destructieve acties', () => {
  it('UX-07: lijst verwijderen (niet gedeeld) — annuleren roept de facade niet aan, bevestigen wel', async () => {
    const cancel = fakeAlert((b) => b.find((x) => x.style === 'cancel'));
    const f1 = fakeApp(false);
    expect(await createUiStore(f1.app, { alert: cancel.alert, timers }).actions.deleteList('L')).toBe(false);
    expect(f1.calls).toEqual([]);
    expect(cancel.shown[0].message).toContain('kan niet ongedaan worden gemaakt');
    const ok = fakeAlert((b) => b.find((x) => x.style === 'destructive'));
    const f2 = fakeApp(false);
    expect(await createUiStore(f2.app, { alert: ok.alert, timers }).actions.deleteList('L')).toBe(true);
    expect(f2.calls).toEqual(['deleteList']);
  });

  it('UX-07 / sectie 3: een gedeelde lijst noemt "alle telefoons"; "Lijst verlaten" roept leave aan, niet deleteList', async () => {
    let step = 0;
    const leaveThenKeep = fakeAlert((b) => (step++ === 0 ? b.find((x) => x.text === 'Lijst verlaten') : b.find((x) => x.text === 'Verlaten, kopie houden')));
    const f = fakeApp(true);
    await createUiStore(f.app, { alert: leaveThenKeep.alert, timers }).actions.deleteList('L');
    expect(leaveThenKeep.shown[0].message).toMatch(/alle telefoons/);
    expect(leaveThenKeep.shown[0].buttons).toEqual(['Annuleren', 'Lijst verlaten', 'Overal verwijderen']);
    expect(f.calls).toEqual(['leave:true']);
  });

  it('UX-07: lijst verlaten (F-18) — annuleren doet niets; "Verlaten en verwijderen" → leave zonder kopie', async () => {
    const f = fakeApp(true);
    const cancel = fakeAlert((b) => b.find((x) => x.style === 'cancel'));
    await createUiStore(f.app, { alert: cancel.alert, timers }).actions.leaveList('L');
    expect(f.calls).toEqual([]);
    const del = fakeAlert((b) => b.find((x) => x.style === 'destructive'));
    await createUiStore(f.app, { alert: del.alert, timers }).actions.leaveList('L');
    expect(f.calls).toEqual(['leave:false']);
    expect(del.shown[0].message).toMatch(/Wie de code heeft, kan altijd weer meedoen/);
  });

  it('UX-07: afgevinkte wissen — dialoogvariant (als F-07 niet gebouwd zou zijn)', async () => {
    const a = fakeAlert((b) => b.find((x) => x.style === 'cancel'));
    expect(await confirmDestructive(a.alert, 'clear-checked', { count: 4 })).toBe('cancel');
    expect(a.shown[0].message).toBe('4 afgevinkte items wissen?');
  });
});
