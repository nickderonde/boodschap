// UX-17 (CR-04): hoofdletter bij toevoegen en hernoemen via de facade; F-17, F-11, F-08 en F-09 blijven
// hoofdletterongevoelig; geen migratie van bestaande namen; synct als gewone waarde.
import { singleDevice, tmpDbFile } from '../support/single';
import { addDevice, makeWorld, names, shareAndJoin } from '../sim/hub';
import { formatHlc } from '../../src/core/hlc';
import type { ItemState } from '../../src/core/types';

const itemsOf = (app: { view(id: string): { sections: { items: { id: string; name: string; quantity: number | null; unit: string | null; category: string }[] }[] } }, l: string) =>
  app.view(l).sections.flatMap((s) => s.items);

describe('UX-17: hoofdletter via de facade', () => {
  it('UX-17: toevoegen ("bananen" → "Bananen", "2 melk" → Melk ×2, "500 g kaas"), hernoemen van item en lijst', async () => {
    const d = await singleDevice({ seed: 171, file: tmpDbFile('ux17a') });
    const l = d.app.lists()[0].id;
    const r = d.app.addItem(l, { text: 'bananen' }).result;
    d.app.addItem(l, { text: '2 melk' });
    d.app.addItem(l, { text: '500 g kaas' });
    d.app.addItem(l, { text: 'iPhone-lader' });
    const its = itemsOf(d.app, l);
    expect(its.map((i) => i.name).sort()).toEqual(['Bananen', 'Kaas', 'Melk', 'iPhone-lader']);
    expect(its.find((i) => i.name === 'Melk')).toMatchObject({ quantity: 2, unit: null });
    expect(its.find((i) => i.name === 'Kaas')).toMatchObject({ quantity: 500, unit: 'g' });
    if (r.kind !== 'added') throw new Error();
    d.app.updateItem(l, r.itemId, { name: 'ijsbergsla' });
    expect(itemsOf(d.app, l).find((i) => i.id === r.itemId)?.name).toBe('IJsbergsla');
    const nl = d.app.createList('weekend').result.listId;
    expect(d.app.lists().find((x) => x.id === nl)?.name).toBe('Weekend');
    d.app.renameList(nl, 'feestje');
    expect(d.app.lists().find((x) => x.id === nl)?.name).toBe('Feestje');
    await d.app.flushWrites();
    const d2 = await d.restart();
    expect(itemsOf(d2.app, l).map((i) => i.name).sort()).toEqual(['IJsbergsla', 'Kaas', 'Melk', 'iPhone-lader']);
  });

  it('UX-17 / F-17: dubbel-detectie blijft hoofdletterongevoelig ("melk" na "Melk", ook na een oud "bananen")', async () => {
    const d = await singleDevice({ seed: 172 });
    const l = d.app.lists()[0].id;
    const first = d.app.addItem(l, { text: 'Melk' }).result;
    const dup = d.app.addItem(l, { text: 'melk' }).result;
    expect(dup.kind).toBe('duplicate');
    if (first.kind !== 'added' || dup.kind !== 'duplicate') throw new Error();
    expect(dup.existingItemId).toBe(first.itemId);
    expect(d.app.addItem(l, { text: '  MELK ' }).result.kind).toBe('duplicate');
  });

  it('UX-17: een oud kleine-letter-item blijft na herstart en merge ongewijzigd; F-08/F-09/F-11 hoofdletterongevoelig', async () => {
    const d = await singleDevice({ seed: 173, file: tmpDbFile('ux17c') });
    const l = d.app.lists()[0].id;
    const h = formatHlc(d.clock.nowMs(), 0, 'ffffffffffffffff');
    await d.app.mergeRemote(l, {
      regs: {},
      items: new Map<string, ItemState>([['OUDOUDOUDOUDOUD1', { id: 'OUDOUDOUDOUDOUD1', regs: { n: ['bananen', h], k: ['groente-fruit', h], x: [false, h], a: [1, h] }, del: null }]]),
    });
    await d.app.flushWrites();
    const d2 = await d.restart();
    expect(itemsOf(d2.app, l).map((i) => i.name)).toEqual(['bananen']); // geen migratie
    // Dubbel ondanks verschil in hoofdletters.
    expect(d2.app.addItem(l, { text: 'Bananen' }).result.kind).toBe('duplicate');
    // Categorie (F-08) van de nieuwe naam is gelijk aan die van de kleine-letter-vorm.
    d2.app.addItem(l, { text: 'appels' });
    expect(itemsOf(d2.app, l).find((i) => i.name === 'Appels')?.category).toBe('groente-fruit');
    // F-09: een voorkeur voor "kaas" geldt ook voor "Kaas".
    const k = d2.app.addItem(l, { text: 'kaas' }).result;
    if (k.kind !== 'added') throw new Error();
    d2.app.updateItem(l, k.itemId, { category: 'zuivel-eieren' });
    d2.app.deleteItem(l, k.itemId);
    d2.app.addItem(l, { text: 'Kaas' }, { force: true });
    expect(itemsOf(d2.app, l).find((i) => i.name === 'Kaas')?.category).toBe('zuivel-eieren');
    // F-11: "ban" geeft één suggestie voor "bananen"/"Bananen".
    const s = d2.app.suggest('ban').filter((x) => x.name.toLowerCase() === 'bananen');
    expect(s).toHaveLength(1);
  });

  it('UX-17 / S-04: partner ziet "Bananen"; gelijktijdig hernoemen convergeert', async () => {
    const w = await makeWorld();
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B');
    const ids = await shareAndJoin(w, a, [b]);
    const la = ids.get(a)!;
    const lb = ids.get(b)!;
    const r = a.app.addItem(la, { text: 'bananen' }).result;
    await w.settle(30_000);
    expect(names(b, lb)).toEqual(['Bananen']);
    if (r.kind !== 'added') throw new Error();
    a.app.updateItem(la, r.itemId, { name: 'rijpe bananen' });
    b.app.updateItem(lb, r.itemId, { name: 'groene bananen' });
    await w.settle(60_000);
    expect(names(a, la)).toEqual(names(b, lb));
    expect(['Rijpe bananen', 'Groene bananen']).toContain(names(a, la)[0]);
  });
});
