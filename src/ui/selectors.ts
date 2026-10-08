// Selectors voor de UI (UX-10): voortgang "x van y afgevinkt" en hulpen voor de weergave.
import type { ListView } from '../core/types';
import type { ListSummary } from '../service/types';
import { strings } from './strings.nl';

export function progressText(l: { checkedCount: number; total: number }): string {
  return l.total === 0 ? strings.emptyItemsCount : strings.progress(l.checkedCount, l.total);
}

export function progressFraction(l: { checkedCount: number; total: number }): number {
  return l.total === 0 ? 0 : l.checkedCount / l.total;
}

export function checkedCount(v: ListView): number {
  return v.sections.filter((s) => s.key === 'afgevinkt').reduce((n, s) => n + s.items.length, 0);
}

export function itemSubtitle(i: { quantity: number | null; unit: string | null; note: string | null }): string {
  const q = i.quantity !== null ? `${formatQuantity(i.quantity)}${i.unit ? ' ' + i.unit : ''}` : i.unit ?? '';
  return [q, i.note ?? ''].filter(Boolean).join(' · ');
}

export function formatQuantity(q: number): string {
  return Number.isInteger(q) ? String(q) : String(q).replace('.', ',');
}

export function sortLists(ls: ListSummary[]): ListSummary[] {
  return [...ls].sort((a, b) => a.position - b.position);
}
