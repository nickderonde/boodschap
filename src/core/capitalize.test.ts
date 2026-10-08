// UX-17 (CR-04): hoofdletter aan het begin van namen. Tabeltests met alle voorbeelden uit REQUIREMENTS v0.6.4.
import { capitalizeName } from './capitalize';
import { cleanItemName, cleanListName } from './validate';
import { parseInput } from './parseInput';

describe('UX-17: capitalizeName', () => {
  const cases: Array<[string, string]> = [
    // eerste letter
    ['bananen', 'Bananen'],
    ['coca-cola light', 'Coca-cola light'],
    ['halfvolle melk', 'Halfvolle melk'],
    ['MELK', 'MELK'],
    ['Melk', 'Melk'],
    // accenten
    ['éclair', 'Éclair'],
    ['ëi', 'Ëi'],
    ['ölijfolie', 'Ölijfolie'],
    // mengvorm blijft staan
    ['iPhone-lader', 'iPhone-lader'],
    ['eBook', 'eBook'],
    ['pH-neutrale zeep', 'pH-neutrale zeep'],
    ['IJsselmeer', 'IJsselmeer'],
    ['IJS', 'IJS'],
    ['iJs', 'iJs'],
    // IJ-regel
    ['ijs', 'IJs'],
    ['ijsbergsla', 'IJsbergsla'],
    ['ijzer', 'IJzer'],
    ['Ijs', 'IJs'],
    ['ij', 'IJ'],
    ['ij-thee', 'IJ-thee'],
    ['ijs met slagroom', 'IJs met slagroom'],
    // cijfer, leesteken, emoji, spatie vooraan: niets
    ['7up', '7up'],
    ['0% yoghurt', '0% yoghurt'],
    ['(bio) melk', '(bio) melk'],
    ['123', '123'],
    ['🍌 bananen', '🍌 bananen'],
    ['  bananen', '  bananen'],
    [' bananen', ' bananen'],
    // leeg en meerdere spaties
    ['', ''],
    ['melk  halfvol', 'Melk  halfvol'],
    // geen lengteverandering (ß heeft geen enkele hoofdletter)
    ['ßtraße', 'ßtraße'],
  ];
  it.each(cases)('UX-17: %j → %j', (input, expected) => {
    expect(capitalizeName(input)).toBe(expected);
  });

  it('UX-17: idempotent (twee keer toepassen = één keer)', () => {
    for (const [input] of cases) expect(capitalizeName(capitalizeName(input))).toBe(capitalizeName(input));
  });

  it('UX-17 / F-12: eerst de hoeveelheid ontleden, dan de hoofdletter op de rest', () => {
    const t = (s: string) => {
      const p = parseInput(s);
      return [cleanItemName(p.name), p.quantity, p.unit];
    };
    expect(t('2 melk')).toEqual(['Melk', 2, null]);
    expect(t('500 g kaas')).toEqual(['Kaas', 500, 'g']);
    expect(t('3x appels')).toEqual(['Appels', 3, null]);
    expect(t('  bananen  ')).toEqual(['Bananen', null, null]); // trimmen gaat vooraf (F-02)
  });

  it('UX-17: lijstnamen krijgen dezelfde regel; leeg blijft een fout', () => {
    expect(cleanListName('weekend')).toBe('Weekend');
    expect(cleanListName(' ijsjes voor het feest ')).toBe('IJsjes voor het feest');
    expect(() => cleanItemName('   ')).toThrow('naam-leeg');
  });
});
