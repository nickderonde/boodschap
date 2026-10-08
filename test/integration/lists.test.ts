// F-01: meerdere lijsten — lokaal deel (M2). Het sync-deel staat in lists-sync.test.ts (M3).
import { singleDevice, tmpDbFile } from '../support/single';
import { InputError } from '../../src/core/validate';

describe('F-01: meerdere lijsten (lokaal)', () => {
  it('F-01 / UX-11: eerste start heeft een lijst "Boodschappen"', async () => {
    const d = await singleDevice();
    const ls = d.app.lists();
    expect(ls).toHaveLength(1);
    expect(ls[0].name).toBe('Boodschappen');
    expect(ls[0].shared).toBe(false);
  });

  it('F-01: minimaal 20 lijsten; naam 1–40 tekens, getrimd', async () => {
    const d = await singleDevice();
    for (let i = 1; i <= 20; i++) await d.app.createList(`  Lijst ${i}  `).committed;
    const names = d.app.lists().map((l) => l.name);
    expect(names).toHaveLength(21);
    expect(names).toContain('Lijst 20');
    expect(() => d.app.createList('   ')).toThrow(InputError);
    expect(() => d.app.createList('x'.repeat(41))).toThrow(InputError);
    expect(d.app.createList('y'.repeat(40)).result.listId).toBeTruthy();
  });

  it('F-01: hernoemen en verwijderen blijven na herstart bewaard; werkt zonder netwerk', async () => {
    const file = tmpDbFile();
    let d = await singleDevice({ file });
    const { listId } = d.app.createList('Weekend').result;
    await d.app.renameList(listId, 'Weekendje weg').committed;
    const extra = d.app.createList('Tijdelijk').result.listId;
    await d.app.flushWrites();
    await d.app.deleteList(extra);
    expect(d.app.lists().map((l) => l.name)).toEqual(['Boodschappen', 'Weekendje weg']);
    d = await d.restart();
    expect(d.app.lists().map((l) => l.name)).toEqual(['Boodschappen', 'Weekendje weg']);
    // geen tweede standaardlijst na herstart
    expect(d.app.lists().filter((l) => l.name === 'Boodschappen')).toHaveLength(1);
    expect(d.app.syncStatus(listId).kind).toBe('lokaal');
  });
});
