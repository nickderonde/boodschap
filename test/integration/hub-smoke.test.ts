// Rooktest van de sync-keten op de MemoryHub: delen, koppelen, wijzigen, convergeren (S-04 basis, F-14 via hub).
import { addDevice, makeWorld, names, shareAndJoin } from '../sim/hub';
import { canonicalList } from '../../src/core/canonical';

describe('Sync-keten op de hub (rooktest)', () => {
  it('S-04: A deelt, B koppelt, wijzigingen in beide richtingen komen aan en de staat is gelijk', async () => {
    const w = await makeWorld();
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B');
    const listA = a.app.lists()[0].id;
    a.app.addItem(listA, { text: 'melk' });
    await w.settle(5_000);
    const ids = await shareAndJoin(w, a, [b]);
    const listB = ids.get(b)!;
    expect(names(b, listB)).toEqual(['melk']);
    expect(b.app.view(listB).name).toBe('Boodschappen');
    b.app.addItem(listB, { text: 'kaas' });
    a.app.addItem(listA, { text: 'brood' });
    await w.settle(30_000);
    expect(names(a, listA)).toEqual(['brood', 'kaas', 'melk']);
    expect(names(b, listB)).toEqual(['brood', 'kaas', 'melk']);
    expect(canonicalList(a.app.stateOf(listA))).toBe(canonicalList(b.app.stateOf(listB)));
    expect(a.app.syncStatus(listA).kind).toBe('gesynchroniseerd');
    expect(b.app.syncStatus(listB).kind).toBe('gesynchroniseerd');
  });
});
