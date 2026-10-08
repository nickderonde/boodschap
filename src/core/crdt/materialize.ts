// Gematerialiseerde weergave (§5.5): levende items, zichtbare waarden en sortering.
import { sections } from '../sort';
import type { ItemState, ItemView, ListState, ListView } from '../types';
import { isItemDeleted, regHlc, regValue } from './item';
import { isListDeleted, listName } from './list';

/**
 * Eén ItemView per (onveranderlijke) ItemState: mergeList hergebruikt ongewijzigde items, dus ongewijzigde rijen
 * krijgen dezelfde view-referentie en memo(ItemRow) slaat ze over (review K-2).
 */
const viewCache = new WeakMap<ItemState, ItemView>();

export function itemView(it: ItemState): ItemView {
  const hit = viewCache.get(it);
  if (hit) return hit;
  const v = buildItemView(it);
  viewCache.set(it, v);
  return v;
}

function buildItemView(it: ItemState): ItemView {
  return {
    id: it.id,
    name: regValue<string>(it, 'n') ?? '',
    quantity: regValue<number | null>(it, 'q') ?? null,
    unit: regValue<string | null>(it, 'u') ?? null,
    note: regValue<string | null>(it, 'o') ?? null,
    category: regValue<string>(it, 'k') ?? 'overig',
    checked: regValue<boolean>(it, 'x') === true,
    addedHlc: regHlc(it, 'a') ?? regHlc(it, 'n') ?? '',
  };
}

/** Een item is pas zichtbaar als het een naam heeft en niet verwijderd is (R-DEL). */
export function liveItems(list: ListState): ItemView[] {
  const out: ItemView[] = [];
  for (const it of list.items.values()) {
    if (isItemDeleted(it) || it.regs.n === undefined) continue;
    out.push(itemView(it));
  }
  return out;
}

export function materialize(list: ListState, fallbackName = 'Gedeelde lijst'): ListView {
  const items = liveItems(list);
  return {
    name: listName(list) ?? fallbackName,
    deleted: isListDeleted(list),
    sections: sections(items),
    total: items.length,
    checkedCount: items.filter((i) => i.checked).length,
  };
}
