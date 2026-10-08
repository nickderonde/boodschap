// UX-17 (CR-04, REQUIREMENTS v0.6.4): namen van items en lijsten beginnen met een hoofdletter ("bananen" → "Bananen").
// Toegepast in de core (validate.ts) bij toevoegen/hernoemen van items en aanmaken/hernoemen van lijsten, dus voor UI
// én sync gelijk; niet op gegevens die via synchronisatie binnenkomen. Dubbel-detectie, suggesties, categorisatie en
// categorievoorkeur werken op de genormaliseerde (kleine-letter)vorm en merken hier niets van. Idempotent.
//
// Regel (na trimmen en na het ontleden van een hoeveelheid, F-12):
//  1. Mengvorm blijft staan: bevat het eerste woord na het eerste teken een hoofdletter ("iPhone-lader", "eBook",
//     "pH-neutrale zeep", "IJsselmeer", "MELK", "iJs"), dan verandert er niets.
//  2. Eerste letter: is het eerste teken een kleine letter (ook met accent: "éclair", "ëi"), dan wordt alleen dat teken
//     een hoofdletter. Cijfer, leesteken, emoji of spatie vooraan ("7up", "0% yoghurt", "(bio) melk"): niets.
//  3. IJ-regel: begint de naam daarna met "Ij" gevolgd door een kleine letter of het einde van het woord, dan "IJ"
//     ("ijs" → "IJs", "ijsbergsla" → "IJsbergsla", "Ijs" van het toetsenbord → "IJs").

const LOWER = /^\p{Ll}$/u;
const UPPER = /\p{Lu}/u;

export function capitalizeName(name: string): string {
  const s = name ?? '';
  if (s.length === 0) return s;
  const firstWord = s.split(/\s/u)[0];
  const chars = [...firstWord];
  // 1. Mengvorm (hoofdletter na het eerste teken van het eerste woord): de gebruiker bedoelt die schrijfwijze.
  if (chars.slice(1).some((c) => UPPER.test(c))) return s;
  let out = s;
  // 2. Eerste letter, alleen als het een kleine letter is met precies één hoofdletter (dus niet "ß" → "SS").
  const first = String.fromCodePoint(s.codePointAt(0)!);
  if (LOWER.test(first)) {
    const upper = first.toLocaleUpperCase('nl-NL');
    if ([...upper].length === 1) out = upper + s.slice(first.length);
  }
  // 3. IJ-regel.
  if (/^Ij(\p{Ll}|$|[^\p{L}])/u.test(out)) out = 'IJ' + out.slice(2);
  return out;
}
