// F-08 (acceptatie, Eindtester): onafhankelijke testset van 100 gangbare Nederlandse boodschappen.
// De fixture is opgesteld zonder naar de woordenlijst van de Engineer te kijken. Eis: >= 90% juiste categorie.
import { categorize } from '../../src/core/categorize/categorize';
import { CATEGORIES } from '../../src/core/categorize/categories';
import { singleDevice } from '../support/single';
import fixture from '../fixtures/categorize-f08-eindtester.json';

type Row = { name: string; category: string; variant: string };
const rows = (fixture as { items: Row[] }).items;

describe('F-08 (Eindtester): automatische categorie', () => {
  it('ET-F08-0: de fixture heeft 100 items, alleen geldige categorie-ID\'s en alle 16 categorieën komen voor', () => {
    expect(rows).toHaveLength(100);
    const ids = new Set(CATEGORIES.map((c) => c.id as string));
    expect(CATEGORIES).toHaveLength(16);
    for (const r of rows) expect([r.name, ids.has(r.category)]).toEqual([r.name, true]);
    expect(new Set(rows.map((r) => r.category)).size).toBe(16);
    expect(new Set(rows.map((r) => r.name.toLowerCase())).size).toBe(100);
  });

  it('ET-F08-1: score op de onafhankelijke testset >= 90%', () => {
    const wrong = rows.filter((r) => categorize(r.name) !== r.category);
    const score = (rows.length - wrong.length) / rows.length;
    // eslint-disable-next-line no-console
    console.log(`F-08 score Eindtester-fixture: ${Math.round(score * 100)}% (${rows.length - wrong.length}/${rows.length})\n` + wrong.map((w) => `  FOUT: "${w.name}" [${w.variant}] -> ${categorize(w.name)} (verwacht ${w.category})`).join('\n'));
    expect(score).toBeGreaterThanOrEqual(0.9);
  });

  it('ET-F08-2: hoofdletter- en accentongevoelig (alle namen in HOOFDLETTERS en zonder accenten geven hetzelfde)', () => {
    const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    const diff = rows.filter((r) => categorize(r.name.toUpperCase()) !== categorize(r.name) || categorize(strip(r.name)) !== categorize(r.name));
    expect(diff.map((d) => d.name)).toEqual([]);
  });

  it('ET-F08-3: onbekend product -> Overig en nooit een fout', () => {
    for (const n of ['qwertyplop', '???', '', '   ', '12345', 'a'.repeat(500), '🍌🍌', 'tomaten'.repeat(100)]) {
      expect(() => categorize(n)).not.toThrow();
    }
    expect(categorize('qwertyplop')).toBe('overig');
    expect(categorize('')).toBe('overig');
  });

  it('ET-F08-4: via de facade: addItem zet automatisch de categorie (en de voorkeur wint, F-09)', async () => {
    const d = await singleDevice({ seed: 5 });
    const listId = d.app.lists()[0].id;
    const r1 = d.app.addItem(listId, { text: 'Bananen' }).result;
    const r2 = d.app.addItem(listId, { text: 'halfvolle melk' }).result;
    const r3 = d.app.addItem(listId, { text: 'kipfilet' }).result;
    if (r1.kind !== 'added' || r2.kind !== 'added' || r3.kind !== 'added') throw new Error('niet toegevoegd');
    const items = d.app.view(listId).sections.flatMap((s) => s.items);
    const cat = (id: string) => items.find((i) => i.id === id)!.category;
    expect(cat(r1.itemId)).toBe('groente-fruit');
    expect(cat(r2.itemId)).toBe('zuivel-eieren');
    expect(cat(r3.itemId)).toBe('vlees-vis');
    // F-09: handmatig wijzigen wordt onthouden voor dit product
    d.app.updateItem(listId, r1.itemId, { category: 'snacks-snoep' });
    const r4 = d.app.addItem(listId, { text: 'bananen' }, { force: true }).result;
    if (r4.kind !== 'added') throw new Error();
    await d.app.flushWrites();
    expect(d.app.view(listId).sections.flatMap((s) => s.items).find((i) => i.id === r4.itemId)!.category).toBe('snacks-snoep');
  });
});
