// F-07: ongedaan maken van verwijderen (lokaal deel). Het sync-deel (wint op 2 apparaten) staat in rdel-sync.test.ts.
import { singleDevice } from '../support/single';
import { CommandError } from '../../src/service/BootschapApp';

describe('F-07: ongedaan maken', () => {
  it('F-07: binnen 10 s herstelt exact de verwijderde items (item en "afgevinkte wissen")', async () => {
    const d = await singleDevice();
    const listId = d.app.lists()[0].id;
    const a = d.app.addItem(listId, { text: 'appels', quantity: 3 }).result;
    const b = d.app.addItem(listId, { text: 'peren' }).result;
    if (a.kind !== 'added' || b.kind !== 'added') throw new Error();
    d.app.toggleChecked(listId, a.itemId);
    d.app.toggleChecked(listId, b.itemId);
    const { result: tok } = d.app.clearChecked(listId);
    expect(d.app.view(listId).total).toBe(0);
    d.clock.advance(9_000);
    await d.app.undo(tok).committed;
    const v = d.app.view(listId);
    expect(v.total).toBe(2);
    expect(v.checkedCount).toBe(2);
    expect(v.sections[0].items.find((i) => i.name === 'appels')?.quantity).toBe(3);

    const { result: tok2 } = d.app.deleteItem(listId, a.itemId);
    await d.app.undo(tok2).committed;
    expect(d.app.view(listId).total).toBe(2);
  });

  it('F-07: na 10 s is herstel niet meer mogelijk; een token werkt maar één keer', async () => {
    const d = await singleDevice();
    const listId = d.app.lists()[0].id;
    const a = d.app.addItem(listId, { text: 'appels' }).result;
    if (a.kind !== 'added') throw new Error();
    const { result: tok } = d.app.deleteItem(listId, a.itemId);
    d.clock.advance(10_001);
    expect(() => d.app.undo(tok)).toThrow(CommandError);
    const b = d.app.addItem(listId, { text: 'peren' }).result;
    if (b.kind !== 'added') throw new Error();
    const { result: tok2 } = d.app.deleteItem(listId, b.itemId);
    d.app.undo(tok2);
    expect(() => d.app.undo(tok2)).toThrow(CommandError);
  });
});
