// Willekeurige scenario's (§13.4): 2, 3 of 5 apparaten, 1–60 acties, met offline-periodes, kill+restart, klokstappen en
// relayfouten. Oracle: elke operatie waarvan `committed` is opgelost, is in de eindstaat van élk apparaat terug te zien
// (het register heeft een HLC ≥ die van de operatie; R-DEL en LWW bepalen dan de zichtbare waarde).
import fc from 'fast-check';
import { canonicalList } from '../../src/core/canonical';
import { isItemDeleted } from '../../src/core/crdt/item';
import type { Hlc } from '../../src/core/types';
import { addDevice, makeWorld, shareAndJoin, type World } from './hub';
import type { TestDevice } from './device';

export type Action =
  | { t: 'add'; d: number; name: number }
  | { t: 'edit'; d: number; pick: number; field: 'n' | 'q' | 'o' | 'k'; v: number }
  | { t: 'toggle'; d: number; pick: number }
  | { t: 'delete'; d: number; pick: number }
  | { t: 'clearChecked'; d: number }
  | { t: 'undo'; d: number }
  | { t: 'rename'; d: number; v: number }
  | { t: 'offline'; d: number }
  | { t: 'online'; d: number }
  | { t: 'killRestart'; d: number }
  | { t: 'advanceClock'; ms: number }
  | { t: 'relayFault'; r: number; kind: 'delay' | 'dup' | 'reorder' | 'wipe' | 'down' };

export const actionArb = (devices: number): fc.Arbitrary<Action> => {
  const d = fc.integer({ min: 0, max: devices - 1 });
  return fc.oneof(
    { weight: 6, arbitrary: fc.record({ t: fc.constant('add' as const), d, name: fc.integer({ min: 0, max: 30 }) }) },
    { weight: 4, arbitrary: fc.record({ t: fc.constant('edit' as const), d, pick: fc.nat(), field: fc.constantFrom('n' as const, 'q' as const, 'o' as const, 'k' as const), v: fc.integer({ min: 0, max: 9 }) }) },
    { weight: 4, arbitrary: fc.record({ t: fc.constant('toggle' as const), d, pick: fc.nat() }) },
    { weight: 3, arbitrary: fc.record({ t: fc.constant('delete' as const), d, pick: fc.nat() }) },
    { weight: 1, arbitrary: fc.record({ t: fc.constant('clearChecked' as const), d }) },
    { weight: 1, arbitrary: fc.record({ t: fc.constant('undo' as const), d }) },
    { weight: 1, arbitrary: fc.record({ t: fc.constant('rename' as const), d, v: fc.integer({ min: 0, max: 9 }) }) },
    { weight: 2, arbitrary: fc.record({ t: fc.constant('offline' as const), d }) },
    { weight: 2, arbitrary: fc.record({ t: fc.constant('online' as const), d }) },
    { weight: 1, arbitrary: fc.record({ t: fc.constant('killRestart' as const), d }) },
    { weight: 3, arbitrary: fc.record({ t: fc.constant('advanceClock' as const), ms: fc.integer({ min: 0, max: 5000 }) }) },
    { weight: 1, arbitrary: fc.record({ t: fc.constant('relayFault' as const), r: fc.integer({ min: 0, max: 2 }), kind: fc.constantFrom('delay' as const, 'dup' as const, 'reorder' as const, 'wipe' as const, 'down' as const) }) },
  );
};

interface Expectation {
  itemId: string | null; // null = lijstregister
  key: string; // registersleutel, of '#del'
  hlc: Hlc;
  committed: boolean;
}

export interface ScenarioResult {
  world: World;
  devices: TestDevice[];
  listIds: Map<TestDevice, string>;
  expectations: Expectation[];
}

export async function runScenario(nDevices: number, actions: Action[], seed: number): Promise<ScenarioResult> {
  const w = await makeWorld({ seed });
  const devs: TestDevice[] = [];
  for (let i = 0; i < nDevices; i++) devs.push(await addDevice(w, `D${i}`, { seed: seed * 31 + i, clockOffsetMs: (i % 3) * 1500 - 1500 }));
  const ids = await shareAndJoin(w, devs[0], devs.slice(1));
  const exps: Expectation[] = [];
  const undo = new Map<TestDevice, unknown>();
  const record = (dev: TestDevice, listId: string, itemId: string | null, keys: string[], committed: Promise<void>) => {
    const st = dev.app.stateOf(listId);
    const es: Expectation[] = [];
    for (const key of keys) {
      let h: Hlc | null | undefined;
      if (itemId === null) h = st.regs[key]?.[1];
      else if (key === '#del') h = st.items.get(itemId)?.del;
      else h = st.items.get(itemId)?.regs[key]?.[1];
      if (h) es.push({ itemId, key, hlc: h, committed: false });
    }
    exps.push(...es);
    committed.then(() => es.forEach((e) => (e.committed = true))).catch(() => {});
  };
  const liveIds = (dev: TestDevice, listId: string) => {
    const st = dev.app.stateOf(listId);
    return [...st.items.values()].filter((i) => !isItemDeleted(i) && i.regs.n).map((i) => i.id).sort();
  };

  for (const a of actions) {
    try {
      if (a.t === 'advanceClock') {
        await w.sched.advance(a.ms);
        continue;
      }
      if (a.t === 'relayFault') {
        const r = [...w.hub.relays.values()][a.r];
        if (a.kind === 'delay') r.faults.latencyMs = r.faults.latencyMs ? 0 : 700;
        if (a.kind === 'dup') r.faults.duplicate = r.faults.duplicate > 1 ? 1 : 3;
        if (a.kind === 'reorder') r.faults.reorder = !r.faults.reorder;
        if (a.kind === 'wipe') r.wipe();
        if (a.kind === 'down') r.setDown(!r.faults.down);
        continue;
      }
      const dev = devs[a.d];
      const listId = ids.get(dev)!;
      if (!dev.app.lists().some((l) => l.id === listId)) continue;
      switch (a.t) {
        case 'add': {
          const r = dev.app.addItem(listId, { text: `item${a.name}` }, { force: true });
          if (r.result.kind === 'added') record(dev, listId, r.result.itemId, ['n', 'k', 'x', 'a'], r.committed);
          break;
        }
        case 'edit': {
          const live = liveIds(dev, listId);
          if (live.length === 0) break;
          const id = live[a.pick % live.length];
          const patch = a.field === 'n' ? { name: `naam${a.v}` } : a.field === 'q' ? { quantity: a.v } : a.field === 'o' ? { note: `notitie ${a.v}` } : { category: (['dranken', 'diepvries', 'overig'] as const)[a.v % 3] };
          const r = dev.app.updateItem(listId, id, patch);
          record(dev, listId, id, [a.field], r.committed);
          break;
        }
        case 'toggle': {
          const live = liveIds(dev, listId);
          if (live.length === 0) break;
          const id = live[a.pick % live.length];
          record(dev, listId, id, ['x'], dev.app.toggleChecked(listId, id).committed);
          break;
        }
        case 'delete': {
          const live = liveIds(dev, listId);
          if (live.length === 0) break;
          const id = live[a.pick % live.length];
          const r = dev.app.deleteItem(listId, id);
          undo.set(dev, r.result);
          record(dev, listId, id, ['#del'], r.committed);
          break;
        }
        case 'clearChecked': {
          const r = dev.app.clearChecked(listId);
          undo.set(dev, r.result);
          for (const id of r.result.itemIds) record(dev, listId, id, ['#del'], r.committed);
          break;
        }
        case 'undo': {
          const tok = undo.get(dev) as Parameters<typeof dev.app.undo>[0] | undefined;
          if (!tok) break;
          undo.delete(dev);
          try {
            const r = dev.app.undo(tok);
            for (const id of tok.itemIds) record(dev, listId, id, ['r'], r.committed);
          } catch {
            // verlopen
          }
          break;
        }
        case 'rename': {
          const r = dev.app.renameList(listId, `Lijst ${a.v}`);
          record(dev, listId, null, ['n'], r.committed);
          break;
        }
        case 'offline':
          dev.net.online(false);
          break;
        case 'online':
          dev.net.online(true);
          break;
        case 'killRestart':
          await w.sched.advance(10);
          await dev.restart();
          break;
      }
    } catch (e) {
      if ((e as Error).name === 'SimulatedCrash') continue;
      throw e;
    }
  }
  // Afsluiting: alles online, foutloos, en laten lopen tot het stil is.
  for (const r of w.hub.relays.values()) {
    r.setDown(false);
    r.faults.latencyMs = 0;
    r.faults.duplicate = 1;
    r.faults.reorder = false;
  }
  for (const d of devs) d.net.online(true);
  await w.sched.advance(2 * 60_000);
  for (const d of devs) d.app.foreground();
  await w.sched.advance(5 * 60_000);
  // Review bevinding 12: alle apparaten herstarten, zodat de vergelijking op de duurzaam opgeslagen staat gebeurt
  // (de cache wordt bij het opstarten uit de database geladen).
  for (const d of devs) await d.restart();
  await w.sched.advance(60_000);
  return { world: w, devices: devs, listIds: ids, expectations: exps };
}

/** Eindcontroles: gelijke canonieke staat en de oracle. */
export function assertConverged(res: ScenarioResult): void {
  const [first, ...rest] = res.devices;
  const ref = canonicalList(first.app.stateOf(res.listIds.get(first)!));
  for (const d of rest) expect(canonicalList(d.app.stateOf(res.listIds.get(d)!))).toBe(ref);
  const st = first.app.stateOf(res.listIds.get(first)!);
  for (const e of res.expectations) {
    if (!e.committed) continue;
    let h: Hlc | null | undefined;
    if (e.itemId === null) h = st.regs[e.key]?.[1];
    else if (e.key === '#del') h = st.items.get(e.itemId)?.del;
    else h = st.items.get(e.itemId)?.regs[e.key]?.[1];
    expect([e, h !== undefined && h !== null && h >= e.hlc]).toEqual([e, true]);
  }
}
