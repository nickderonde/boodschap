// Normaliseren van productnamen (§8.1 stap 1): lowercase, diakrieten weg, leestekens weg, witruimte samengevoegd.

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Mogelijke enkelvoudsvormen (§8.1 stap 4): strip 's / s / en / eren en herstel klinkerverdubbeling.
 * Geeft kandidaten terug in volgorde van waarschijnlijkheid (zonder de invoer zelf).
 */
export function singularCandidates(word: string): string[] {
  const out: string[] = [];
  const add = (w: string) => {
    if (w.length >= 2 && w !== word && !out.includes(w)) out.push(w);
  };
  if (word.endsWith('eren')) add(word.slice(0, -4)); // eieren → ei, kinderen → kind
  if (word.endsWith('en')) {
    const stem = word.slice(0, -2);
    add(stem);
    // klinkerverdubbeling herstellen: tomaten → tomaat, peren → peer, bonen → boon
    const m = /^(.*[^aeiou])([aeiou])([^aeiou])$/.exec(stem);
    if (m) add(m[1] + m[2] + m[2] + m[3]);
    // dubbele medeklinker: appels? nee; flessen → fles, kippen → kip
    if (/([^aeiou])\1$/.test(stem)) add(stem.slice(0, -1));
    // v/z → f/s: druiven → druif, kazen → kaas
    if (stem.endsWith('v')) {
      add(stem.slice(0, -1) + 'f');
      const m2 = /^(.*[^aeiou])([aeiou])v$/.exec(stem);
      if (m2) add(m2[1] + m2[2] + m2[2] + 'f');
    }
    if (stem.endsWith('z')) {
      add(stem.slice(0, -1) + 's');
      const m3 = /^(.*[^aeiou])([aeiou])z$/.exec(stem);
      if (m3) add(m3[1] + m3[2] + m3[2] + 's');
    }
  }
  if (word.endsWith("'s")) add(word.slice(0, -2));
  if (word.endsWith('s')) add(word.slice(0, -1)); // appels → appel, kiwis → kiwi
  if (word.endsWith('jes')) add(word.slice(0, -3)); // worteltjes
  if (word.endsWith('tjes')) add(word.slice(0, -4));
  return out;
}
