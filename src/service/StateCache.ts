// Geheugencache van de facade (§9.3): per lijst de ListState, het ListView (lui) en de suggestie-index.
import { normalizeName } from '../core/categorize/normalize';
import { regValue } from '../core/crdt/item';
import { isListDeleted, mergeList } from '../core/crdt/list';
import { materialize } from '../core/crdt/materialize';
import { SuggestIndex } from '../core/suggest';
import type { ItemState, ListDelta, ListState, ListView } from '../core/types';
import type { dao } from '../storage';

export interface CachedList {
  row: dao.ListRow;
  state: ListState;
  view: ListView | null;
}

export class StateCache {
  readonly lists = new Map<string, CachedList>();
  readonly suggest = new SuggestIndex();
  prefs = new Map<string, string>();

  constructor(private readonly placeholderName: string) {}

  get(listId: string): CachedList | undefined {
    return this.lists.get(listId);
  }

  require(listId: string): CachedList {
    const c = this.lists.get(listId);
    if (!c || isListDeleted(c.state)) throw new Error('lijst-onbekend');
    return c;
  }

  set(row: dao.ListRow, state: ListState): void {
    const old = this.lists.get(row.id);
    if (old) for (const id of old.state.items.keys()) if (!state.items.has(id)) this.suggest.upsert(`${row.id}/${id}`, null);
    this.lists.set(row.id, { row, state, view: null });
    for (const it of state.items.values()) this.indexItem(row.id, it);
  }

  remove(listId: string): void {
    const c = this.lists.get(listId);
    if (!c) return;
    for (const id of c.state.items.keys()) this.suggest.upsert(`${listId}/${id}`, null);
    this.lists.delete(listId);
  }

  /** Past een delta toe (mergeList). Geeft true als de staat veranderde. */
  apply(listId: string, delta: ListDelta): boolean {
    const c = this.lists.get(listId);
    if (!c) return false;
    const next = mergeList(c.state, delta);
    if (next === c.state) return false;
    c.state = next;
    c.view = null;
    for (const id of delta.items.keys()) {
      const it = next.items.get(id);
      if (it) this.indexItem(listId, it);
    }
    return true;
  }

  view(listId: string): ListView {
    const c = this.require(listId);
    if (!c.view) c.view = materialize(c.state, this.placeholderName);
    return c.view;
  }

  /** Suggesties volgen uit alle items, ook verwijderde (F-11). */
  private indexItem(listId: string, it: ItemState): void {
    const name = regValue<string>(it, 'n');
    if (!name) return;
    this.suggest.upsert(`${listId}/${it.id}`, {
      norm: normalizeName(name),
      display: name,
      lastMs: regValue<number>(it, 'a') ?? 0,
      category: regValue<string>(it, 'k') ?? 'overig',
      unit: regValue<string | null>(it, 'u') ?? null,
    });
  }
}
