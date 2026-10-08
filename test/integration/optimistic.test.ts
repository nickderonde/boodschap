// UX-05 (facade) en I-1: optimistisch via StateCache + WriteQueue; terugdraaien bij een commitfout; deltamerge.
import { singleDevice, tmpDbFile } from '../support/single';
import { CrashingSqlDriver } from '../support/CrashingSqlDriver';
import { formatHlc } from '../../src/core/hlc';
import { canonicalList } from '../../src/core/canonical';
import type { SqlDriver } from '../../src/storage/SqlDriver';
import type { ItemState } from '../../src/core/types';

describe('UX-05 / I-1: optimistische UI in de facade', () => {
  it('UX-05: view() is direct na een commando bijgewerkt, vóór committed', async () => {
    const d = await singleDevice();
    const listId = d.app.lists()[0].id;
    let resolved = false;
    const p = d.app.addItem(listId, { text: 'melk' });
    void p.committed.then(() => (resolved = true));
    expect(resolved).toBe(false);
    expect(d.app.view(listId).total).toBe(1);
    await p.committed;
    expect(resolved).toBe(true);
  });

  it('UX-05: een commitfout → cache herladen uit de DB, onError, latere taken van dezelfde lijst afgewezen', async () => {
    let crash!: CrashingSqlDriver;
    const d = await singleDevice({ wrap: (inner: SqlDriver) => (crash = new CrashingSqlDriver(inner)) });
    const listId = d.app.lists()[0].id;
    await d.app.addItem(listId, { text: 'brood' }).committed;
    const errors: string[] = [];
    d.app.onError((e) => errors.push(e.code));
    crash.failOnce = /INSERT INTO items/;
    const a = d.app.addItem(listId, { text: 'melk' });
    const b = d.app.addItem(listId, { text: 'kaas' });
    expect(d.app.view(listId).total).toBe(3); // optimistisch
    await expect(a.committed).rejects.toThrow();
    await expect(b.committed).rejects.toThrow();
    await d.app.flushWrites();
    expect(errors).toEqual(['opslaan-mislukt']);
    expect(d.app.view(listId).total).toBe(1); // teruggedraaid naar de database
    // daarna werkt alles weer
    await d.app.addItem(listId, { text: 'appels' }).committed;
    expect(d.app.view(listId).total).toBe(2);
  });

  it('I-1: lokale delta op X en remote merge op X en Y in de wachtrij → de database bevat beide', async () => {
    const file = tmpDbFile();
    let d = await singleDevice({ file });
    const listId = d.app.lists()[0].id;
    const x = d.app.addItem(listId, { text: 'brood' }).result;
    if (x.kind !== 'added') throw new Error();
    await d.app.flushWrites();
    const local = d.app.updateItem(listId, x.itemId, { quantity: 2 }); // in de wachtrij
    const remoteNode = 'ffffffffffffffff';
    const h = formatHlc(d.clock.nowMs() + 5_000, 0, remoteNode);
    const remote = d.app.mergeRemote(listId, {
      regs: {},
      items: new Map<string, ItemState>([
        [x.itemId, { id: x.itemId, regs: { o: ['van de partner', h] }, del: null }],
        ['YYYYYYYYYYYYYYYY', { id: 'YYYYYYYYYYYYYYYY', regs: { n: ['Kaas', h], k: ['vleeswaren-kaas', h], x: [false, h], a: [1, h] }, del: null }],
      ]),
    });
    await local.committed;
    expect(await remote).toBe(true);
    const cache = canonicalList(d.app.stateOf(listId));
    d = await d.restart();
    expect(canonicalList(d.app.stateOf(listId))).toBe(cache); // cache = database
    const items = d.app.view(listId).sections.flatMap((s) => s.items);
    expect(items.find((i) => i.name === 'Brood')).toMatchObject({ quantity: 2, note: 'van de partner' });
    expect(items.find((i) => i.name === 'Kaas')).toBeTruthy();
  });

  it('I-1: een mislukte lokale taak laat de remote merge intact; cache wordt gelijk aan de database', async () => {
    let crash!: CrashingSqlDriver;
    const file = tmpDbFile();
    let d = await singleDevice({ file, wrap: (inner: SqlDriver) => (crash = new CrashingSqlDriver(inner)) });
    const listId = d.app.lists()[0].id;
    const x = d.app.addItem(listId, { text: 'brood' }).result;
    if (x.kind !== 'added') throw new Error();
    await d.app.flushWrites();
    crash.failOnce = /UPDATE lists SET state_rev/;
    const local = d.app.updateItem(listId, x.itemId, { quantity: 7 });
    const h = formatHlc(d.clock.nowMs() + 5_000, 0, 'ffffffffffffffff');
    const remote = d.app.mergeRemote(listId, { regs: {}, items: new Map<string, ItemState>([[x.itemId, { id: x.itemId, regs: { o: ['remote', h] }, del: null }]]) });
    await expect(local.committed).rejects.toThrow();
    expect(await remote).toBe(true);
    await d.app.flushWrites();
    const v = d.app.view(listId).sections[0].items[0];
    expect(v).toMatchObject({ quantity: null, note: 'remote' });
    const cache = canonicalList(d.app.stateOf(listId));
    d = await d.restart();
    expect(canonicalList(d.app.stateOf(listId))).toBe(cache);
  });
});
