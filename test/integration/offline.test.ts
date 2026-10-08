// S-01: lokaal eerst — met transport volledig uit werken F-01..F-11, elke actie < 100 ms (logica gemeten).
import { singleDevice } from '../support/single';

describe('S-01: lokaal eerst', () => {
  it('S-01: alle commando\'s werken zonder transport en reageren < 100 ms', async () => {
    const d = await singleDevice(); // geen transportfabriek = alles uit
    const t = (f: () => unknown) => {
      const t0 = performance.now();
      f();
      return performance.now() - t0;
    };
    const listId = d.app.lists()[0].id;
    // vul eerst met 300 items, zodat de metingen realistisch zijn
    for (let i = 0; i < 300; i++) d.app.addItem(listId, { text: `artikel ${i}` });
    await d.app.flushWrites();
    const timings: number[] = [];
    let id = '';
    timings.push(t(() => d.app.createList('Nieuw')));
    timings.push(t(() => {
      const r = d.app.addItem(listId, { text: '2 melk' }).result;
      if (r.kind === 'added') id = r.itemId;
    }));
    timings.push(t(() => d.app.toggleChecked(listId, id)));
    timings.push(t(() => d.app.updateItem(listId, id, { name: 'halfvolle melk' })));
    timings.push(t(() => d.app.view(listId)));
    timings.push(t(() => d.app.suggest('ha')));
    timings.push(t(() => d.app.clearChecked(listId)));
    timings.push(t(() => d.app.renameList(listId, 'Supermarkt')));
    await d.app.flushWrites();
    for (const ms of timings) expect(ms).toBeLessThan(100);
    expect(d.app.lists().find((l) => l.id === listId)?.name).toBe('Supermarkt');
    expect(d.app.syncStatus(listId).kind).toBe('lokaal');
  });
});
