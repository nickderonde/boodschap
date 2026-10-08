// Suggesties/autocomplete (§8.3, F-11). Index uit alle items (ook verwijderde) + woordenboek met lagere rang.
import { DICTIONARY } from './categorize/dictionary.nl';
import { normalizeName } from './categorize/normalize';
import type { CategoryId } from './types';

export interface Suggestion {
  name: string;
  category: string;
  unit: string | null;
  source: 'historie' | 'woordenboek';
}

export interface Contribution {
  norm: string;
  display: string;
  lastMs: number;
  category: string;
  unit: string | null;
}

interface Agg {
  norm: string;
  words: string[];
  display: string;
  count: number;
  lastMs: number;
  category: string;
  unit: string | null;
}

export const MAX_SUGGESTIONS = 8;
const DAY_MS = 86_400_000;

export class SuggestIndex {
  private readonly byKey = new Map<string, Contribution>();
  private readonly agg = new Map<string, Agg>();
  private readonly dict: { norm: string; words: string[]; category: CategoryId }[];

  constructor(dictionary: ReadonlyMap<string, CategoryId> = DICTIONARY) {
    this.dict = [...dictionary.entries()].map(([norm, category]) => ({ norm, words: norm.split(' '), category }));
  }

  /** Zet de bijdrage van één item (sleutel = lijst+item). `null` haalt de bijdrage weg. */
  upsert(key: string, c: Contribution | null): void {
    const old = this.byKey.get(key);
    if (old) {
      const a = this.agg.get(old.norm);
      if (a) {
        a.count -= 1;
        if (a.count <= 0) this.agg.delete(old.norm);
      }
      this.byKey.delete(key);
    }
    if (!c || !c.norm) return;
    this.byKey.set(key, c);
    const a = this.agg.get(c.norm);
    if (!a) {
      this.agg.set(c.norm, { norm: c.norm, words: c.norm.split(' '), display: c.display, count: 1, lastMs: c.lastMs, category: c.category, unit: c.unit });
    } else {
      a.count += 1;
      if (c.lastMs >= a.lastMs) {
        a.lastMs = c.lastMs;
        a.display = c.display;
        a.category = c.category;
        a.unit = c.unit;
      }
    }
  }

  get size(): number {
    return this.byKey.size;
  }

  suggest(prefix: string, nowMs: number, max = MAX_SUGGESTIONS): Suggestion[] {
    const p = normalizeName(prefix);
    if (!p) return [];
    const matches = (norm: string, words: string[]) => norm.startsWith(p) || words.some((w) => w.startsWith(p));
    const hist: { a: Agg; score: number }[] = [];
    for (const a of this.agg.values()) {
      if (matches(a.norm, a.words)) {
        const days = Math.max(0, (nowMs - a.lastMs) / DAY_MS);
        hist.push({ a, score: a.count * Math.pow(0.5, days / 30) });
      }
    }
    hist.sort((x, y) => y.score - x.score || (x.a.display < y.a.display ? -1 : x.a.display > y.a.display ? 1 : 0));
    const out: Suggestion[] = hist.slice(0, max).map(({ a }) => ({ name: a.display, category: a.category, unit: a.unit, source: 'historie' as const }));
    if (out.length < max) {
      const seen = new Set(hist.map((h) => h.a.norm));
      const dict = this.dict.filter((d) => !seen.has(d.norm) && matches(d.norm, d.words));
      dict.sort((x, y) => (x.norm.startsWith(p) === y.norm.startsWith(p) ? x.norm.length - y.norm.length || (x.norm < y.norm ? -1 : 1) : x.norm.startsWith(p) ? -1 : 1));
      for (const d of dict) {
        if (out.length >= max) break;
        out.push({ name: d.norm, category: d.category, unit: null, source: 'woordenboek' });
      }
    }
    return out;
  }
}
