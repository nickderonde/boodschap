// Vaste supermarktvolgorde van categorieën (§8.1, F-08, F-10, B-05). Normatief.
import type { CategoryId } from '../types';

export interface Category {
  id: CategoryId;
  name: string;
}

export const CATEGORIES: readonly Category[] = [
  { id: 'groente-fruit', name: 'Groente & fruit' },
  { id: 'brood-gebak', name: 'Brood & gebak' },
  { id: 'vlees-vis', name: 'Vlees & vis' },
  { id: 'vleeswaren-kaas', name: 'Vleeswaren & kaas' },
  { id: 'zuivel-eieren', name: 'Zuivel & eieren' },
  { id: 'ontbijt-beleg', name: 'Ontbijt & beleg' },
  { id: 'pasta-rijst-wereld', name: 'Pasta, rijst & wereldkeuken' },
  { id: 'houdbaar-conserven', name: 'Houdbaar & conserven' },
  { id: 'snacks-snoep', name: 'Snacks & snoep' },
  { id: 'dranken', name: 'Dranken' },
  { id: 'diepvries', name: 'Diepvries' },
  { id: 'huishouden', name: 'Huishouden & schoonmaak' },
  { id: 'verzorging', name: 'Verzorging & drogisterij' },
  { id: 'baby-kind', name: 'Baby & kind' },
  { id: 'huisdieren', name: 'Huisdieren' },
  { id: 'overig', name: 'Overig' },
];

const ORDER = new Map<string, number>(CATEGORIES.map((c, i) => [c.id, i]));

export function isCategoryId(s: unknown): s is CategoryId {
  return typeof s === 'string' && ORDER.has(s);
}

/** Positie in de vaste volgorde; onbekende ID's vallen onder Overig. */
export function categoryOrder(id: string): number {
  return ORDER.get(id) ?? ORDER.get('overig')!;
}

/** Een onbekend ID wordt getoond onder Overig, maar elders behouden (§5.3). */
export function displayCategory(id: string | undefined | null): CategoryId {
  return id && isCategoryId(id) ? id : 'overig';
}

export function categoryName(id: string): string {
  return CATEGORIES[categoryOrder(id)].name;
}
