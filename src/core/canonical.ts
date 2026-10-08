// Canonieke JSON (§5.7): gesorteerde sleutels, geen witruimte, getallen via JSON.stringify.
import type { ItemState, ListState } from './types';

export function canonicalJSON(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const s = JSON.stringify(value);
    return s === undefined ? 'null' : s;
  }
  if (Array.isArray(value)) return '[' + value.map(canonicalJSON).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJSON(obj[k])).join(',') + '}';
}

export function canonicalItem(it: ItemState): unknown {
  return { id: it.id, regs: it.regs, del: it.del };
}

/** Canonieke serialisatie van een (deel)lijststaat: definitie van "gelijke staat" (sectie 3). */
export function canonicalList(list: ListState): string {
  const items = [...list.items.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map(canonicalItem);
  return canonicalJSON({ regs: list.regs, items });
}
