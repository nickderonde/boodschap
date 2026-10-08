// UI-store (§12): een dunne laag op de facade, zonder eigen optimistische logica (die zit in de facade, §9.3).
// zustand/vanilla, dus testbaar in Node. Commitfouten en onError verschijnen als melding (UX-05).
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { CategoryId, Timers } from '../core/types';
import { InputError } from '../core/validate';
import type { BootschapApp } from '../service/BootschapApp';
import type { AddResult, ItemPatch, JoinResult, ListSummary, ShareInfo, UndoToken } from '../service/types';
import type { SyncStatus } from '../sync/engine/status';
import { confirmDestructive, type AlertFn } from './confirm';
import { strings } from './strings.nl';

export interface Message {
  id: number;
  text: string;
  undo?: UndoToken;
  tone: 'info' | 'error';
}

export interface UiState {
  lists: ListSummary[];
  /** Verhoogd bij elke wijziging; schermen lezen app.view() en hertekenen hierop. */
  version: number;
  status: Record<string, SyncStatus>;
  message: Message | null;
}

export interface UiActions {
  refresh(): void;
  createList(name: string): string | null;
  renameList(listId: string, name: string): boolean;
  addItem(listId: string, text: string, extra?: { category?: CategoryId; unit?: string | null }): void;
  toggle(listId: string, itemId: string): void;
  updateItem(listId: string, itemId: string, patch: ItemPatch): boolean;
  deleteItem(listId: string, itemId: string, name: string): void;
  clearChecked(listId: string): void;
  undo(): void;
  deleteList(listId: string): Promise<boolean>;
  leaveList(listId: string): Promise<boolean>;
  share(listId: string): Promise<ShareInfo | null>;
  join(text: string): Promise<JoinResult>;
  syncNow(listId: string): Promise<void>;
  showMessage(text: string, tone?: 'info' | 'error', undo?: UndoToken): void;
  dismissMessage(): void;
}

export type UiStore = StoreApi<UiState> & { actions: UiActions; app: BootschapApp };

export interface UiDeps {
  alert: AlertFn;
  timers: Timers;
  /** Snackbar-duur (F-07: 10 s). */
  messageMs?: number;
}

function errorText(e: unknown): string {
  if (e instanceof InputError) return strings.inputErrors[e.code] ?? strings.genericError;
  return strings.genericError;
}

export function createUiStore(app: BootschapApp, deps: UiDeps): UiStore {
  const store = createStore<UiState>()(() => ({ lists: app.lists(), version: 0, status: {}, message: null }));
  let msgSeq = 0;
  let msgTimer: unknown = null;

  const refresh = () => store.setState((s) => ({ lists: app.lists(), version: s.version + 1 }));

  const showMessage = (text: string, tone: 'info' | 'error' = 'info', undo?: UndoToken) => {
    if (msgTimer !== null) deps.timers.clearTimeout(msgTimer);
    const id = ++msgSeq;
    store.setState({ message: { id, text, undo, tone } });
    msgTimer = deps.timers.setTimeout(() => {
      if (store.getState().message?.id === id) store.setState({ message: null });
    }, deps.messageMs ?? 10_000);
  };

  /** Commitfouten worden door onError gemeld; hier alleen voorkomen dat ze onbehandeld blijven. */
  const watch = (p: Promise<void>) => {
    p.catch(() => {});
  };

  /** Voert een synchroon commando uit; validatiefouten worden een melding (geen crash). */
  const guarded = <T>(f: () => T): T | null => {
    try {
      return f();
    } catch (e) {
      showMessage(errorText(e), 'error');
      return null;
    }
  };

  app.onChange(() => refresh());
  app.onSyncStatus((listId, s) => store.setState((st) => ({ status: { ...st.status, [listId]: s } })));
  app.onError((e) => showMessage(strings.errors[e.code] ?? strings.genericError, 'error'));

  const actions: UiActions = {
    refresh,
    createList(name) {
      const r = guarded(() => app.createList(name));
      if (!r) return null;
      watch(r.committed);
      return r.result.listId;
    },
    renameList(listId, name) {
      const r = guarded(() => app.renameList(listId, name));
      if (r) watch(r.committed);
      return !!r;
    },
    addItem(listId, text, extra) {
      const input = { text, ...(extra?.category ? { category: extra.category } : {}), ...(extra?.unit ? { unit: extra.unit, quantity: null } : {}) };
      const r = guarded(() => app.addItem(listId, input));
      if (!r) return;
      watch(r.committed);
      const res: AddResult = r.result;
      if (res.kind === 'duplicate') {
        // F-17: niet stil dubbel toevoegen — vraag het.
        deps.alert(strings.duplicateTitle, strings.duplicateBody(text.trim()), [
          { text: strings.cancel, style: 'cancel' },
          { text: strings.duplicateIncrease, onPress: () => { const p = guarded(() => app.increaseQuantity(listId, res.existingItemId)); if (p) watch(p.committed); } },
          { text: strings.duplicateAddAnyway, onPress: () => { const p = guarded(() => app.addItem(listId, input, { force: true })); if (p) watch(p.committed); } },
        ]);
      }
    },
    toggle(listId, itemId) {
      const r = guarded(() => app.toggleChecked(listId, itemId));
      if (r) watch(r.committed);
    },
    updateItem(listId, itemId, patch) {
      const r = guarded(() => app.updateItem(listId, itemId, patch));
      if (r) watch(r.committed);
      return !!r;
    },
    deleteItem(listId, itemId, name) {
      const r = guarded(() => app.deleteItem(listId, itemId));
      if (!r) return;
      watch(r.committed);
      showMessage(strings.itemDeleted(name), 'info', r.result);
    },
    clearChecked(listId) {
      // §12.1: direct uitvoeren + snackbar "Ongedaan maken" (F-07 is gebouwd).
      const r = guarded(() => app.clearChecked(listId));
      if (!r) return;
      watch(r.committed);
      if (r.result.itemIds.length > 0) showMessage(strings.itemsCleared(r.result.itemIds.length), 'info', r.result);
    },
    undo() {
      const m = store.getState().message;
      if (!m?.undo) return;
      const r = guarded(() => app.undo(m.undo!));
      if (r) watch(r.committed);
      store.setState({ message: null });
    },
    async deleteList(listId) {
      const l = app.lists().find((x) => x.id === listId);
      if (!l) return false;
      const choice = await confirmDestructive(deps.alert, l.shared ? 'delete-list-shared' : 'delete-list-local', { name: l.name });
      if (choice === 'cancel') return false;
      if (choice === 'leave') return actions.leaveList(listId);
      await app.deleteList(listId).catch(() => showMessage(strings.genericError, 'error'));
      refresh();
      return true;
    },
    async leaveList(listId) {
      const l = app.lists().find((x) => x.id === listId);
      if (!l) return false;
      const choice = await confirmDestructive(deps.alert, 'leave', { name: l.name });
      if (choice !== 'leave-keep' && choice !== 'leave-delete') return false;
      await app.leave(listId, choice === 'leave-keep').catch(() => showMessage(strings.genericError, 'error'));
      refresh();
      return choice === 'leave-delete';
    },
    async share(listId) {
      try {
        return await app.share(listId);
      } catch {
        showMessage(strings.genericError, 'error');
        return null;
      }
    },
    async join(text) {
      const r = await app.join(text);
      refresh();
      return r;
    },
    async syncNow(listId) {
      await app.syncNow(listId).catch(() => {});
    },
    showMessage,
    dismissMessage() {
      store.setState({ message: null });
    },
  };

  return Object.assign(store, { actions, app });
}
