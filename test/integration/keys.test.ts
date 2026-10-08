// NF-04: sleutels alleen in de KeyStore; geen geheim of privésleutel in SQLite of de logs.
import { singleDevice } from '../support/single';
import { NodeSqliteDriver } from '../support/NodeSqliteDriver';

describe('NF-04: veilige sleutelopslag', () => {
  it('NF-04: na delen staan lijstgeheim en Nostr-sleutel in de KeyStore en nergens in SQLite of de logs', async () => {
    const d = await singleDevice();
    const listId = d.app.lists()[0].id;
    d.app.addItem(listId, { text: 'melk' });
    await d.app.share(listId);
    await d.app.flushWrites();
    const secret = d.keys.data.get(`bs.list.${listId}.secret`);
    const nostr = d.keys.data.get(`bs.list.${listId}.nostr`);
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(nostr).toMatch(/^[0-9a-f]{64}$/);
    // Dump van alle tabellen.
    const drv = d.driver as NodeSqliteDriver;
    const tables = await drv.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'");
    let dump = '';
    for (const t of tables) dump += JSON.stringify(await drv.all(`SELECT * FROM ${t.name}`));
    expect(dump).not.toContain(secret!);
    expect(dump).not.toContain(nostr!);
    expect(d.log.text()).not.toContain(secret!);
    expect(d.log.text()).not.toContain(nostr!);
    // Het apparaat-ID voor de HLC staat wél in SQLite (geen geheim).
    expect(dump).toContain(d.app.deviceId);
  });

  it('NF-04 / F-18: verlaten wist de sleutels uit de KeyStore', async () => {
    const d = await singleDevice();
    const listId = d.app.lists()[0].id;
    await d.app.share(listId);
    await d.app.leave(listId, true);
    expect([...d.keys.data.keys()].filter((k) => k.includes(listId))).toEqual([]);
    expect(d.app.lists()[0]).toMatchObject({ id: listId, shared: false });
  });
});
