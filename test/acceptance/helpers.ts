// Hulpfuncties voor de acceptatietests van de Eindtester. Alleen publieke API's: facade, harnas, test-relay.
import { canonicalList } from '../../src/core/canonical';
import type { ItemView } from '../../src/core/types';
import type { TestDevice } from '../sim/device';

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

export function allItems(d: TestDevice, listId: string): ItemView[] {
  return d.app.view(listId).sections.flatMap((s) => s.items);
}

export function find(d: TestDevice, listId: string, name: string): ItemView | undefined {
  return allItems(d, listId).find((i) => i.name === name);
}

export function sortedNames(d: TestDevice, listId: string): string[] {
  return allItems(d, listId)
    .map((i) => i.name)
    .sort();
}

/** "Gelijke staat" (REQUIREMENTS §3): canonieke serialisatie incl. tombstones is identiek op alle apparaten. */
export function canonicalOf(d: TestDevice, listId: string): string {
  return canonicalList(d.app.stateOf(listId));
}

export function expectSameState(devs: TestDevice[], ids: Map<TestDevice, string>): void {
  const ref = canonicalOf(devs[0], ids.get(devs[0])!);
  for (const d of devs.slice(1)) expect([d.name, canonicalOf(d, ids.get(d)!) === ref]).toEqual([d.name, true]);
}

/** Deterministische pseudo-willekeurige tekst (niet comprimeerbaar), voor grote lijsten. */
export function lcgWords(seed: number): () => string {
  let s = seed >>> 0;
  const next = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s;
  };
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  return () => {
    let out = '';
    const len = 8 + (next() % 8);
    for (let i = 0; i < len; i++) out += alphabet[next() % 26];
    return out;
  };
}
