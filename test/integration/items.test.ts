// F-02..F-06, F-09, F-17, UX-10 (lokaal, één apparaat).
import { singleDevice, tmpDbFile } from '../support/single';
import { InputError } from '../../src/core/validate';
import { CommandError } from '../../src/service/BootschapApp';

const allItems = (v: { sections: { items: { name: string; checked: boolean }[] }[] }) => v.sections.flatMap((s) => s.items);

describe('Items (F-02..F-06, F-09, F-17, UX-10)', () => {
  it('F-02: toevoegen met naam, hoeveelheid, eenheid en notitie; direct zichtbaar; bewaard na herstart', async () => {
    const file = tmpDbFile();
    let d = await singleDevice({ file });
    const listId = d.app.lists()[0].id;
    const r = d.app.addItem(listId, { text: 'kaas', quantity: 500, unit: 'g', note: 'jong belegen' });
    expect(r.result.kind).toBe('added');
    expect(allItems(d.app.view(listId))).toHaveLength(1); // direct, vóór committed
    await r.committed;
    d = await d.restart();
    const it = d.app.view(listId).sections[0].items[0];
    expect(it).toMatchObject({ name: 'Kaas', quantity: 500, unit: 'g', note: 'jong belegen', category: 'vleeswaren-kaas', checked: false });
  });

  it('F-02: validatie — lege naam geweigerd, naam ≤ 80, notitie ≤ 200', async () => {
    const d = await singleDevice();
    const listId = d.app.lists()[0].id;
    expect(() => d.app.addItem(listId, { text: '   ' })).toThrow(InputError);
    expect(() => d.app.addItem(listId, { text: 'x'.repeat(81) })).toThrow(InputError);
    expect(() => d.app.addItem(listId, { text: 'melk', note: 'n'.repeat(201) })).toThrow(InputError);
    expect(() => d.app.addItem(listId, { text: 'melk', quantity: -1 })).toThrow(InputError);
    expect(d.app.addItem(listId, { text: 'x'.repeat(80) }).result.kind).toBe('added');
  });

  it('F-02 / F-12: tekstinvoer wordt ontleed ("2 melk", "500 g kaas")', async () => {
    const d = await singleDevice();
    const listId = d.app.lists()[0].id;
    d.app.addItem(listId, { text: '2 melk' });
    d.app.addItem(listId, { text: '500 g kaas' });
    const its = allItems(d.app.view(listId)) as unknown as { name: string; quantity: number; unit: string | null }[];
    expect(its.find((i) => i.name === 'Melk')).toMatchObject({ quantity: 2, unit: null });
    expect(its.find((i) => i.name === 'Kaas')).toMatchObject({ quantity: 500, unit: 'g' });
  });

  it('F-02: 1000 items per lijst werkt en blijft na herstart bewaard', async () => {
    const file = tmpDbFile();
    let d = await singleDevice({ file });
    const listId = d.app.lists()[0].id;
    for (let i = 0; i < 1000; i++) d.app.addItem(listId, { text: `product ${i}` });
    await d.app.flushWrites();
    expect(d.app.view(listId).total).toBe(1000);
    d = await d.restart();
    expect(d.app.view(listId).total).toBe(1000);
  });

  it('F-03 / UX-10: afvinken en ontvinken; afgevinkt onderaan; teller x van y', async () => {
    const d = await singleDevice();
    const listId = d.app.lists()[0].id;
    const a = d.app.addItem(listId, { text: 'appels' }).result;
    d.app.addItem(listId, { text: 'melk' });
    if (a.kind !== 'added') throw new Error();
    d.app.toggleChecked(listId, a.itemId);
    let v = d.app.view(listId);
    expect(v.sections[v.sections.length - 1].key).toBe('afgevinkt');
    expect(v.sections[v.sections.length - 1].items[0].name).toBe('Appels');
    expect([v.checkedCount, v.total]).toEqual([1, 2]);
    await d.app.toggleChecked(listId, a.itemId).committed;
    v = d.app.view(listId);
    expect(v.sections.some((s) => s.key === 'afgevinkt')).toBe(false);
    expect([v.checkedCount, v.total]).toEqual([0, 2]);
    expect(d.app.lists()[0]).toMatchObject({ total: 2, checkedCount: 0 });
  });

  it('F-04: elk veld bewerken, met validatie; bewaard', async () => {
    const file = tmpDbFile();
    let d = await singleDevice({ file });
    const listId = d.app.lists()[0].id;
    const r = d.app.addItem(listId, { text: 'brood' }).result;
    if (r.kind !== 'added') throw new Error();
    await d.app.updateItem(listId, r.itemId, { name: 'volkorenbrood', quantity: 2, unit: 'stuks', note: 'gesneden', category: 'brood-gebak' }).committed;
    expect(() => d.app.updateItem(listId, r.itemId, { name: '' })).toThrow(InputError);
    expect(() => d.app.updateItem(listId, r.itemId, { category: 'bestaat-niet' as never })).toThrow(InputError);
    d = await d.restart();
    expect(d.app.view(listId).sections[0].items[0]).toMatchObject({ name: 'Volkorenbrood', quantity: 2, unit: 'stuks', note: 'gesneden', category: 'brood-gebak' });
    await d.app.updateItem(listId, r.itemId, { quantity: null, note: null }).committed;
    expect(d.app.view(listId).sections[0].items[0]).toMatchObject({ quantity: null, note: null });
  });

  it('F-05: verwijderen — item verdwijnt direct en tombstone wordt bewaard', async () => {
    const file = tmpDbFile();
    let d = await singleDevice({ file });
    const listId = d.app.lists()[0].id;
    const r = d.app.addItem(listId, { text: 'kaas' }).result;
    if (r.kind !== 'added') throw new Error();
    await d.app.flushWrites();
    d.app.deleteItem(listId, r.itemId);
    expect(d.app.view(listId).total).toBe(0);
    await d.app.flushWrites();
    d = await d.restart();
    expect(d.app.view(listId).total).toBe(0);
    expect(d.app.stateOf(listId).items.get(r.itemId)?.del).toBeTruthy();
    expect(() => d.app.deleteItem(listId, r.itemId)).toThrow(CommandError);
  });

  it('F-06: afgevinkte wissen verwijdert alleen afgevinkte items; ook 200 stuks; undo-token', async () => {
    const d = await singleDevice();
    const listId = d.app.lists()[0].id;
    const ids: string[] = [];
    for (let i = 0; i < 210; i++) {
      const r = d.app.addItem(listId, { text: `p${i}` }).result;
      if (r.kind === 'added') ids.push(r.itemId);
    }
    for (let i = 0; i < 200; i++) d.app.toggleChecked(listId, ids[i]);
    const { result: token, committed } = d.app.clearChecked(listId);
    await committed;
    expect(token.itemIds).toHaveLength(200);
    const v = d.app.view(listId);
    expect(v.total).toBe(10);
    expect(v.checkedCount).toBe(0);
  });

  it('F-09: categorie handmatig wijzigen wordt onthouden voor dat product (ook na herstart)', async () => {
    const file = tmpDbFile();
    let d = await singleDevice({ file });
    const listId = d.app.lists()[0].id;
    const r = d.app.addItem(listId, { text: 'Agar-agar' }).result;
    if (r.kind !== 'added') throw new Error();
    expect(d.app.view(listId).sections[0].items[0].category).toBe('overig');
    await d.app.updateItem(listId, r.itemId, { category: 'vlees-vis' }).committed;
    d = await d.restart();
    d.app.deleteItem(listId, r.itemId);
    d.app.addItem(listId, { text: 'agar-agar' });
    expect(d.app.view(listId).sections[0]).toMatchObject({ key: 'vlees-vis' });
  });

  it('F-17: dubbel-detectie — melding, "Toch toevoegen" (force) en "Hoeveelheid verhogen"', async () => {
    const d = await singleDevice();
    const listId = d.app.lists()[0].id;
    const first = d.app.addItem(listId, { text: 'Melk' }).result;
    if (first.kind !== 'added') throw new Error();
    const dup = d.app.addItem(listId, { text: 'melk' });
    expect(dup.result).toEqual({ kind: 'duplicate', existingItemId: first.itemId });
    await dup.committed;
    expect(d.app.view(listId).total).toBe(1); // niet stil dubbel toegevoegd
    await d.app.increaseQuantity(listId, first.itemId).committed;
    expect(d.app.view(listId).sections[0].items[0].quantity).toBe(2);
    await d.app.increaseQuantity(listId, first.itemId, 3).committed;
    expect(d.app.view(listId).sections[0].items[0].quantity).toBe(5);
    expect(d.app.addItem(listId, { text: 'melk' }, { force: true }).result.kind).toBe('added');
    expect(d.app.view(listId).total).toBe(2);
  });

  it('F-11 (service): suggesties uit eerder gebruikte items, ook na verwijderen', async () => {
    const d = await singleDevice();
    const listId = d.app.lists()[0].id;
    const r = d.app.addItem(listId, { text: 'Kattenvoer', unit: 'zak', quantity: 1 }).result;
    if (r.kind !== 'added') throw new Error();
    d.app.deleteItem(listId, r.itemId);
    const s = d.app.suggest('kat');
    expect(s[0]).toMatchObject({ name: 'Kattenvoer', unit: 'zak', category: 'huisdieren', source: 'historie' });
  });
});
