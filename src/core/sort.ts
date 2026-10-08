// Sortering en secties (§8.2, F-03, F-10).
import { CATEGORIES, categoryOrder, displayCategory } from './categorize/categories';
import type { ItemView, Section } from './types';

export const CHECKED_SECTION = 'afgevinkt';

function byAdded(a: ItemView, b: ItemView): number {
  if (a.addedHlc !== b.addedHlc) return a.addedHlc < b.addedHlc ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function byCategoryThenAdded(a: ItemView, b: ItemView): number {
  const ca = categoryOrder(displayCategory(a.category));
  const cb = categoryOrder(displayCategory(b.category));
  return ca !== cb ? ca - cb : byAdded(a, b);
}

/** Niet-afgevinkte items per categorie (vaste volgorde, lege categorieën weg), daarna één sectie "Afgevinkt". */
export function sections(items: ItemView[]): Section[] {
  const open = items.filter((i) => !i.checked);
  const done = items.filter((i) => i.checked).sort(byCategoryThenAdded);
  const out: Section[] = [];
  for (const cat of CATEGORIES) {
    const its = open.filter((i) => displayCategory(i.category) === cat.id).sort(byAdded);
    if (its.length > 0) out.push({ key: cat.id, title: cat.name, items: its });
  }
  if (done.length > 0) out.push({ key: CHECKED_SECTION, title: 'Afgevinkt', items: done });
  return out;
}
