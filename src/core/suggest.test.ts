import { SuggestIndex, MAX_SUGGESTIONS } from './suggest';
import { normalizeName } from './categorize/normalize';

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;
const c = (display: string, lastMs: number, category = 'overig', unit: string | null = null) => ({ norm: normalizeName(display), display, lastMs, category, unit });

describe('F-11: suggesties/autocomplete', () => {
  it('F-11: prefix- en woordbegin-match vanaf 1 teken', () => {
    const ix = new SuggestIndex(new Map());
    ix.upsert('l1/a', c('Halfvolle melk', NOW));
    ix.upsert('l1/b', c('Melkchocolade', NOW));
    ix.upsert('l1/c', c('Kaas', NOW));
    expect(ix.suggest('m', NOW).map((s) => s.name).sort()).toEqual(['Halfvolle melk', 'Melkchocolade']);
    expect(ix.suggest('h', NOW).map((s) => s.name)).toEqual(['Halfvolle melk']);
    expect(ix.suggest('', NOW)).toEqual([]);
  });

  it('F-11: maximaal 8 suggesties; historie eerst (frequentie × recentie), dan woordenboek', () => {
    const ix = new SuggestIndex();
    for (let i = 0; i < 12; i++) ix.upsert(`l/${i}`, c(`brood ${i}`, NOW - i * DAY));
    const res = ix.suggest('b', NOW);
    expect(res).toHaveLength(MAX_SUGGESTIONS);
    expect(res[0].name).toBe('brood 0');
    expect(res.every((s) => s.source === 'historie')).toBe(true);

    const ix2 = new SuggestIndex();
    ix2.upsert('a', c('appelsap', NOW - 60 * DAY));
    ix2.upsert('b', c('appeltaart', NOW));
    ix2.upsert('b2', c('appeltaart', NOW));
    const r2 = ix2.suggest('appel', NOW);
    expect(r2[0].name).toBe('appeltaart');
    expect(r2[1].name).toBe('appelsap');
    expect(r2.slice(2).every((s) => s.source === 'woordenboek')).toBe(true);
  });

  it('F-11: tikken op een suggestie levert de eerdere categorie en eenheid', () => {
    const ix = new SuggestIndex(new Map());
    ix.upsert('x', c('Kattenvoer', NOW, 'huisdieren', 'zak'));
    expect(ix.suggest('kat', NOW)[0]).toEqual({ name: 'Kattenvoer', category: 'huisdieren', unit: 'zak', source: 'historie' });
  });

  it('F-11: verwijderen van een item wist de suggestie niet (index wordt gevoed met verwijderde items)', () => {
    // De facade blijft verwijderde items aanbieden; alleen upsert(key, null) haalt een bijdrage weg.
    const ix = new SuggestIndex(new Map());
    ix.upsert('a', c('Rookworst', NOW));
    ix.upsert('a', c('Rookworst', NOW + 1)); // zelfde item opnieuw (bv. na verwijderen) → telt één keer
    expect(ix.size).toBe(1);
    expect(ix.suggest('rook', NOW)).toHaveLength(1);
    ix.upsert('a', null);
    expect(ix.suggest('rook', NOW)).toHaveLength(0);
  });

  it('F-11: antwoord < 100 ms bij 5000 historie-items', () => {
    const ix = new SuggestIndex();
    const words = ['melk', 'brood', 'kaas', 'appel', 'peer', 'koffie', 'thee', 'rijst', 'pasta', 'saus'];
    for (let i = 0; i < 5000; i++) ix.upsert(`k${i}`, c(`${words[i % 10]} ${i}`, NOW - (i % 90) * DAY));
    const t0 = performance.now();
    for (const p of ['m', 'b', 'ka', 'pas', 'x']) ix.suggest(p, NOW);
    const per = (performance.now() - t0) / 5;
    expect(per).toBeLessThan(100);
  });
});
