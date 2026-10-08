// UX-17 (CR-04, REQUIREMENTS v0.6.4): namen van items en lijsten beginnen automatisch met een hoofdletter.
// Eigen acceptatietests (Eindtester), via de facade en het harnas; de verwachtingen volgen de eistekst, niet de implementatie.
import { formatHlc } from '../../src/core/hlc';
import type { ItemState } from '../../src/core/types';
import { singleDevice, tmpDbFile } from '../support/single';
import { addDevice, makeWorld, shareAndJoin } from '../sim/hub';
import { allItems, find, sortedNames } from './helpers';

const itemId = (r: { kind: string; itemId?: string }) => {
  if (r.kind !== 'added' || !r.itemId) throw new Error('niet toegevoegd');
  return r.itemId;
};

describe('UX-17: hoofdletter bij toevoegen', () => {
  const CASES: [string, string][] = [
    ['bananen', 'Bananen'],
    ['halfvolle melk', 'Halfvolle melk'], // alleen de eerste letter
    ['coca-cola light', 'Coca-cola light'],
    ['tomaten', 'Tomaten'],
    ['ijs', 'IJs'], // IJ-regel
    ['ijsbergsla', 'IJsbergsla'],
    ['Ijs', 'IJs'], // uitkomst van een toetsenbord met automatische hoofdletter
    ['ijzer', 'IJzer'],
    ['ijsselmeerpaling', 'IJsselmeerpaling'],
    ['éclair', 'Éclair'], // accent
    ['ëi', 'Ëi'],
    ['  kaas  ', 'Kaas'], // eerst trimmen
    // blijft gelijk
    ['Melk', 'Melk'],
    ['MELK', 'MELK'],
    ['iPhone-lader', 'iPhone-lader'], // mengvorm
    ['eBook', 'eBook'],
    ['pH-neutrale zeep', 'pH-neutrale zeep'],
    ['IJsselmeer', 'IJsselmeer'],
    ['7up', '7up'], // cijfer vooraan
    ['0% yoghurt', '0% yoghurt'],
    ['(bio) melk', '(bio) melk'], // leesteken vooraan
    ['🍌 bananen', '🍌 bananen'], // emoji vooraan
  ];
  it('ET-UX17-1: de regel voor toevoegen (eerste letter, IJ-regel, mengvorm, cijfer/leesteken/emoji vooraan, trimmen)', async () => {
    const d = await singleDevice({ seed: 1701 });
    const l = d.app.lists()[0].id;
    for (const [input, expected] of CASES) {
      const r = d.app.addItem(l, { text: input }, { force: true }).result;
      const it = allItems(d, l).find((i) => i.id === itemId(r))!;
      expect([input, it.name]).toEqual([input, expected]);
    }
  });

  it('ET-UX17-2: idempotent: een tweede keer toepassen (hernoemen naar de uitkomst) verandert niets', async () => {
    const d = await singleDevice({ seed: 1702 });
    const l = d.app.lists()[0].id;
    for (const [input] of CASES) {
      const id = itemId(d.app.addItem(l, { text: input }, { force: true }).result);
      const once = allItems(d, l).find((i) => i.id === id)!.name;
      d.app.updateItem(l, id, { name: once });
      expect([input, allItems(d, l).find((i) => i.id === id)!.name]).toEqual([input, once]);
    }
  });

  it('ET-UX17-3: hoeveelheid vooraan wordt eerst ontleed: "2 melk" geeft hoeveelheid 2 en "Melk"; "500 g kaas" geeft 500 g en "Kaas"; "3x appels" geeft 3 en "Appels"', async () => {
    const d = await singleDevice({ seed: 1703 });
    const l = d.app.lists()[0].id;
    for (const t of ['2 melk', '500 g kaas', '3x appels', '1,5 l ijsthee']) d.app.addItem(l, { text: t });
    const by = (n: string) => find(d, l, n)!;
    expect([by('Melk').quantity, by('Melk').unit]).toEqual([2, null]);
    expect([by('Kaas').quantity, by('Kaas').unit]).toEqual([500, 'g']);
    expect([by('Appels').quantity, by('Appels').unit]).toEqual([3, null]);
    expect([by('IJsthee').quantity, by('IJsthee').unit]).toEqual([1.5, 'l']); // IJ-regel geldt ook na de hoeveelheid
  });

  it('ET-UX17-4: notities, eenheden en categorie-ID\'s worden niet aangepast', async () => {
    const d = await singleDevice({ seed: 1704 });
    const l = d.app.lists()[0].id;
    const id = itemId(d.app.addItem(l, { text: 'rijst', note: 'het merk dat we altijd nemen', unit: 'zak', quantity: 2 }).result);
    d.app.updateItem(l, id, { category: 'overig' });
    const it = allItems(d, l).find((i) => i.id === id)!;
    expect([it.name, it.note, it.unit, it.category]).toEqual(['Rijst', 'het merk dat we altijd nemen', 'zak', 'overig']);
  });
});

describe('UX-17: hernoemen en lijsten', () => {
  it('ET-UX17-5: een item hernoemen krijgt een hoofdletter; ook een lijst aanmaken en hernoemen', async () => {
    const d = await singleDevice({ seed: 1705, file: tmpDbFile('ux17-5') });
    const l = d.app.lists()[0].id;
    const id = itemId(d.app.addItem(l, { text: 'Brood' }).result);
    d.app.updateItem(l, id, { name: 'volkorenbrood' });
    expect(find(d, l, 'Volkorenbrood')).toBeDefined();
    d.app.updateItem(l, id, { name: 'ijsvogel' });
    expect(allItems(d, l)[0].name).toBe('IJsvogel');
    const nl = d.app.createList('weekendboodschappen').result.listId;
    expect(d.app.lists().find((x) => x.id === nl)?.name).toBe('Weekendboodschappen');
    d.app.renameList(nl, 'ijsbaan');
    expect(d.app.lists().find((x) => x.id === nl)?.name).toBe('IJsbaan');
    d.app.renameList(nl, 'iPad-lijst');
    expect(d.app.lists().find((x) => x.id === nl)?.name).toBe('iPad-lijst');
    d.app.renameList(nl, '2e hands');
    expect(d.app.lists().find((x) => x.id === nl)?.name).toBe('2e hands');
    await d.app.flushWrites();
    const d2 = await d.restart();
    expect(d2.app.lists().map((x) => x.name).sort()).toEqual(['2e hands', 'Boodschappen']);
  });
});

describe('UX-17: bestaande functies blijven hoofdletterongevoelig', () => {
  it('ET-UX17-6: dubbel-detectie (F-17): "melk" na "Melk" en "MELK" na "melk" worden als dubbel herkend; "toch toevoegen" kan nog', async () => {
    const d = await singleDevice({ seed: 1706 });
    const l = d.app.lists()[0].id;
    const first = d.app.addItem(l, { text: 'Melk' }).result;
    const dup1 = d.app.addItem(l, { text: 'melk' }).result;
    const dup2 = d.app.addItem(l, { text: 'MELK' }).result;
    expect(first.kind).toBe('added');
    expect(dup1).toEqual({ kind: 'duplicate', existingItemId: itemId(first) });
    expect(dup2.kind).toBe('duplicate');
    expect(sortedNames(d, l)).toEqual(['Melk']);
    expect(d.app.addItem(l, { text: 'melk' }, { force: true }).result.kind).toBe('added');
    expect(sortedNames(d, l)).toEqual(['Melk', 'Melk']);
  });

  it('ET-UX17-7: categorie (F-08) en gekozen categorie (F-09) werken hoofdletterongevoelig; suggesties (F-11) vinden "Melk" met "mel" en "MEL"', async () => {
    const d = await singleDevice({ seed: 1707 });
    const l = d.app.lists()[0].id;
    expect(find(d, l, 'Bananen')).toBeUndefined();
    const b = itemId(d.app.addItem(l, { text: 'bananen' }).result);
    expect(allItems(d, l).find((i) => i.id === b)!.category).toBe('groente-fruit'); // zelfde als voor de wijziging
    const k = itemId(d.app.addItem(l, { text: 'kaas' }).result);
    d.app.updateItem(l, k, { category: 'dranken' });
    d.app.deleteItem(l, k);
    const k2 = itemId(d.app.addItem(l, { text: 'KAAS' }, { force: true }).result);
    expect(allItems(d, l).find((i) => i.id === k2)!.category).toBe('dranken'); // voorkeur geldt ook voor andere hoofdletters
    d.app.addItem(l, { text: 'melk' });
    for (const p of ['mel', 'MEL', 'Mel']) expect([p, d.app.suggest(p).some((s) => s.name.toLowerCase() === 'melk')]).toEqual([p, true]);
    const s = d.app.suggest('mel').filter((x) => x.name.toLowerCase() === 'melk');
    expect(s).toHaveLength(1); // geen dubbele suggestie door "melk"/"Melk"
    expect(s[0].name).toBe('Melk');
  });
});

describe('UX-17: bestaande namen en synchronisatie', () => {
  it('ET-UX17-8: bestaande namen (zonder hoofdletter) worden niet gemigreerd: ze blijven staan na een herstart en kunnen nog worden bewerkt; de bewerking krijgt wel een hoofdletter', async () => {
    const d = await singleDevice({ seed: 1708, file: tmpDbFile('ux17-8') });
    const l = d.app.lists()[0].id;
    const h = formatHlc(d.clock.nowMs(), 0, 'abababababababab');
    const old: ItemState = { id: 'OLDOLDOLDOLDOLD1', regs: { n: ['druiven', h], k: ['groente-fruit', h], x: [false, h], a: [1, h] }, del: null };
    await d.app.mergeRemote(l, { regs: {}, items: new Map([[old.id, old]]) });
    await d.app.flushWrites();
    const d2 = await d.restart();
    expect(sortedNames(d2, l)).toEqual(['druiven']); // niet gemigreerd
    d2.app.toggleChecked(l, old.id); // andere bewerkingen laten de naam met rust
    expect(sortedNames(d2, l)).toEqual(['druiven']);
    d2.app.updateItem(l, old.id, { quantity: 4 });
    expect(sortedNames(d2, l)).toEqual(['druiven']);
    d2.app.updateItem(l, old.id, { name: 'druiven' }); // opnieuw opslaan van de naam = een bewerking van de naam
    expect(sortedNames(d2, l)).toEqual(['Druiven']);
  });

  it('ET-UX17-9: een gesynchroniseerde naam behoudt de hoofdletter van de afzender; een partner met een "oude" kleine-lettervorm wordt niet aangepast', async () => {
    const w = await makeWorld();
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B');
    const ids = await shareAndJoin(w, a, [b]);
    const [la, lb] = [ids.get(a)!, ids.get(b)!];
    a.app.addItem(la, { text: 'ijsbergsla' });
    a.app.addItem(la, { text: 'iPhone-lader' });
    a.app.addItem(la, { text: '7up' });
    const h = formatHlc(w.sched.now(), 0, 'cdcdcdcdcdcdcdcd');
    // een binnenkomende wijziging van een partner (bijv. oudere app-versie) met een kleine-letternaam
    await b.app.mergeRemote(lb, { regs: {}, items: new Map<string, ItemState>([['PARTNERPARTNER01', { id: 'PARTNERPARTNER01', regs: { n: ['spruitjes', h], k: ['groente-fruit', h], x: [false, h], a: [2, h] }, del: null }]]) });
    await w.settle(30_000);
    expect(sortedNames(b, lb)).toEqual(['7up', 'IJsbergsla', 'iPhone-lader', 'spruitjes']);
    // B hernoemt via de app: dat krijgt een hoofdletter en synct zo naar A
    b.app.updateItem(lb, 'PARTNERPARTNER01', { name: 'spruitjes met spek' });
    await w.settle(30_000);
    expect(sortedNames(a, la)).toContain('Spruitjes met spek');
    expect(sortedNames(a, la)).toEqual(sortedNames(b, lb));
  });
});
