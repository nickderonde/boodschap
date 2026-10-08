// Dubbel-detectie bij toevoegen (§8.4, F-17).
import { normalizeName } from './categorize/normalize';
import { liveItems } from './crdt/materialize';
import type { ListState } from './types';

/** Geeft het ID van een levend, niet-afgevinkt item met dezelfde genormaliseerde naam, of null. */
export function findDuplicate(list: ListState, name: string): string | null {
  const norm = normalizeName(name);
  if (!norm) return null;
  let best: { id: string; added: string } | null = null;
  for (const it of liveItems(list)) {
    if (it.checked || normalizeName(it.name) !== norm) continue;
    if (!best || it.addedHlc < best.added) best = { id: it.id, added: it.addedHlc };
  }
  return best?.id ?? null;
}

/** "Hoeveelheid verhogen": q := (q ?? 1) + (nieuw ?? 1). */
export function increasedQuantity(current: number | null, by: number | null | undefined): number {
  return (current ?? 1) + (by ?? 1);
}
