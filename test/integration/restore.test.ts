// §19 / review CR-03 C-2: herstel uit een iOS-back-up of migratie naar een ander toestel kopieert database én Keychain.
// Zonder maatregel delen twee toestellen dan device-ID (HLC-node) en Nostr-sleutels: ze negeren elkaars events (D-17)
// en overschrijven elkaars slot. De install_id (deviceOnly, gaat niet mee) laat de kopie zichzelf herkennen.
import fs from 'node:fs';
import { addDevice, makeWorld, names, shareAndJoin, type World } from '../sim/hub';
import { tmpDbFile } from '../support/single';
import { MemoryKeyStore } from '../support/MemoryKeyStore';
import { MemoryDeviceMarker } from '../support/MemoryDeviceMarker';
import * as dao from '../../src/storage/dao';
import { keyNames } from '../../src/storage/KeyStore';
import type { TestDevice } from '../sim/device';

/** Kopie van het databasebestand zoals een back-up die maakt (inclusief WAL), terwijl het toestel blijft draaien. */
function backupDb(file: string): string {
  const copy = tmpDbFile('herstel');
  for (const suffix of ['', '-wal', '-shm']) if (fs.existsSync(file + suffix)) fs.copyFileSync(file + suffix, copy + suffix);
  return copy;
}

const pubkeyOf = (d: TestDevice, listId: string) => d.app.repo.read(async (r) => (await dao.getList(r, listId))?.nostrPubkey ?? null);
const meta = (d: TestDevice, key: string) => d.app.repo.read((r) => dao.getMeta(r, key));

async function sharedWorld(): Promise<{ w: World; a: TestDevice; b: TestDevice; la: string; lb: string; fileA: string }> {
  const w = await makeWorld();
  const fileA = tmpDbFile('a');
  const a = await addDevice(w, 'A', { dbFile: fileA });
  const b = await addDevice(w, 'B');
  const ids = await shareAndJoin(w, a, [b]);
  const la = ids.get(a)!;
  const lb = ids.get(b)!;
  for (const n of ['melk', 'brood']) a.app.addItem(la, { text: n });
  await w.settle(30_000);
  return { w, a, b, la, lb, fileA };
}

describe('§19: toestelherstel (install_id)', () => {
  it('§19: een gewone herstart en een installatie van vóór §19 houden hun identiteit', async () => {
    const { w, a, la } = await sharedWorld();
    const dev = a.app.deviceId;
    const pk = await pubkeyOf(a, la);
    expect(await meta(a, 'install_id')).toBe(await a.keys.get(keyNames.installId));
    expect(a.keys.deviceOnly.has(keyNames.installId)).toBe(true);
    await a.restart();
    expect(a.app.deviceId).toBe(dev);
    expect(await pubkeyOf(a, la)).toBe(pk);
    // Installatie van vóór §19: nog geen install_id in database of KeyStore → alleen vastleggen, niet roteren.
    await a.app.repo.tx((tx) => tx.run("DELETE FROM meta WHERE key='install_id'", []));
    await a.keys.delete(keyNames.installId);
    await a.restart();
    await w.settle(5_000);
    expect(a.app.deviceId).toBe(dev);
    expect(await pubkeyOf(a, la)).toBe(pk);
    expect(await meta(a, 'install_id')).toBeTruthy();
  });

  it('§19: een kopie uit de back-up krijgt een nieuwe device-ID en Nostr-sleutel; lijsten, items en geheim blijven; niets dubbel gepubliceerd', async () => {
    const { w, a, la, fileA } = await sharedWorld();
    const oldPk = await pubkeyOf(a, la);
    const restoredKeys = a.keys.restoredCopy();
    expect(await restoredKeys.get(keyNames.installId)).toBeNull(); // deviceOnly gaat niet mee
    expect(await restoredKeys.get(keyNames.secret(la))).toBeTruthy(); // lijstgeheim wel
    const a2 = await addDevice(w, 'A-hersteld', { dbFile: backupDb(fileA), keys: restoredKeys });
    expect(a2.app.deviceId).not.toBe(a.app.deviceId);
    const newPk = await pubkeyOf(a2, la);
    expect(newPk).toBeTruthy();
    expect(newPk).not.toBe(oldPk);
    expect(await restoredKeys.get(keyNames.nostr(la))).not.toBe(await a.keys.get(keyNames.nostr(la)));
    expect(names(a2, la)).toEqual(['Brood', 'Melk']);
    // R-1: geen lege of ongeldige pubkey in de eigen sync-tabellen van de kopie (die zou in het REQ-filter belanden).
    const rows = await a2.app.repo.read(async (r) => ({
      members: await r.all<{ pubkey: string }>('SELECT pubkey FROM members WHERE list_id=?', [la]),
      own: (await dao.getList(r, la))?.nostrPubkey,
    }));
    for (const m of rows.members) expect([m.pubkey, /^[0-9a-f]{64}$/.test(m.pubkey)]).toEqual([m.pubkey, true]);
    expect(rows.own).toMatch(/^[0-9a-f]{64}$/);
    expect(rows.members.map((m) => m.pubkey)).toContain(newPk);
    // Nooit dubbel publiceren: de kopie publiceert alleen onder de nieuwe sleutel; de slots van de oude sleutel blijven
    // precies wat het origineel heeft gepubliceerd.
    await w.settle(30_000);
    const fromOld = [...w.hub.relays.values()].flatMap((r) => [...r.store.values()]).filter((m) => m.sender === oldPk);
    const fromNew = [...w.hub.relays.values()].flatMap((r) => [...r.store.values()]).filter((m) => m.sender === newPk);
    expect(fromNew.length).toBeGreaterThan(0);
    const aVersions = await a.app.repo.read((r) => r.all<{ shard: number; last_version: number }>('SELECT shard, last_version FROM shard_state WHERE list_id=?', [la]));
    for (const m of fromOld) expect(aVersions.map((v) => v.last_version)).toContain(m.version);
    expect(await meta(a2, 'install_id')).toBe(await restoredKeys.get(keyNames.installId));
    expect(a2.log.codes()).toContain('install.restored');
    // Een tweede start van de kopie roteert niet opnieuw.
    const dev2 = a2.app.deviceId;
    await a2.restart();
    expect(a2.app.deviceId).toBe(dev2);
    expect(await pubkeyOf(a2, la)).toBe(newPk);
  });

  it('§19: origineel en kopie uit dezelfde back-up blijven allebei in gebruik en convergeren met elkaar en met B', async () => {
    const { w, a, b, la, lb, fileA } = await sharedWorld();
    const a2 = await addDevice(w, 'A-hersteld', { dbFile: backupDb(fileA), keys: a.keys.restoredCopy() });
    await w.settle(30_000);
    a.app.addItem(la, { text: 'kaas' });
    a2.app.addItem(la, { text: 'eieren' });
    b.app.addItem(lb, { text: 'appels' });
    await w.settle(60_000);
    const expected = ['Appels', 'Brood', 'Eieren', 'Kaas', 'Melk'];
    // De kopie doet mee als nieuw lid: B kent nu drie verschillende afzenders (A, de kopie en zichzelf).
    const members = await b.app.repo.read((r) => r.all<{ pubkey: string }>('SELECT pubkey FROM members WHERE list_id=?', [lb]));
    expect(new Set(members.map((m) => m.pubkey)).size).toBe(3);
    expect(members.map((m) => m.pubkey)).toEqual(expect.arrayContaining([await pubkeyOf(a, la), await pubkeyOf(a2, la), await pubkeyOf(b, lb)]));
    expect(names(a, la)).toEqual(expected);
    expect(names(a2, la)).toEqual(expected);
    expect(names(b, lb)).toEqual(expected);
    // Afvinken op de kopie komt aan bij het origineel (en omgekeerd: verwijderen op het origineel bij de kopie).
    const melk = a2.app.view(la).sections.flatMap((s) => s.items).find((i) => i.name === 'Melk')!;
    a2.app.toggleChecked(la, melk.id);
    const brood = a.app.view(la).sections.flatMap((s) => s.items).find((i) => i.name === 'Brood')!;
    a.app.deleteItem(la, brood.id);
    await w.settle(60_000);
    for (const [d, l] of [[a, la], [a2, la], [b, lb]] as const) {
      expect(names(d, l)).toEqual(['Appels', 'Eieren', 'Kaas', 'Melk']);
      expect(d.app.view(l).sections.flatMap((s) => s.items).find((i) => i.name === 'Melk')?.checked).toBe(true);
    }
  });

  it('R-1: migratie 2 ruimt lege en ongeldige ledenrijen en eigen pubkeys op', async () => {
    const { a, la, fileA } = await sharedWorld();
    const good = await pubkeyOf(a, la);
    await a.app.repo.tx(async (tx) => {
      await tx.run('INSERT INTO members(list_id, pubkey, last_seen_ms) VALUES (?,?,?)', [la, '', 1]);
      await tx.run('INSERT INTO members(list_id, pubkey, last_seen_ms) VALUES (?,?,?)', [la, 'xyz', 1]);
      await tx.run("UPDATE meta SET value='1' WHERE key='schema_version'", []);
    });
    void fileA;
    await a.restart();
    const members = await a.app.repo.read((r) => r.all<{ pubkey: string }>('SELECT pubkey FROM members WHERE list_id=?', [la]));
    expect(members.every((m) => /^[0-9a-f]{64}$/.test(m.pubkey))).toBe(true);
    expect(members.map((m) => m.pubkey)).toContain(good);
  });

  it('K-6: faalt het schrijven van de install_id in de KeyStore structureel, dan geen startfout en geen rotatie bij elke start', async () => {
    const w = await makeWorld();
    const keys = new FailingInstallKeys();
    const a = await addDevice(w, 'A', { dbFile: tmpDbFile('k6'), keys });
    const b = await addDevice(w, 'B');
    const ids = await shareAndJoin(w, a, [b]);
    const la = ids.get(a)!;
    const dev = a.app.deviceId;
    const pk = await pubkeyOf(a, la);
    expect(a.log.codes()).toContain('install.keystore-failed');
    for (let i = 0; i < 3; i++) {
      await a.restart();
      await w.settle(5_000);
      expect(a.app.deviceId).toBe(dev);
      expect(await pubkeyOf(a, la)).toBe(pk);
    }
    expect(a.log.codes()).not.toContain('install.restored');
    // Werkt de KeyStore weer, dan wordt de install_id alsnog vastgelegd (en daarna gewoon herkend).
    keys.failing = false;
    await a.restart();
    expect(await keys.get(keyNames.installId)).toBe(await meta(a, 'install_id'));
    expect(await meta(a, 'install_id_unsaved')).toBeNull();
    await a.restart();
    expect(a.app.deviceId).toBe(dev);
  });

  it('R-2 / D-50: faalt de KeyStore op het origineel, dan herkent een kopie uit de back-up zich toch (device-only merkteken) en roteert; het origineel niet', async () => {
    const w = await makeWorld();
    const keys = new FailingInstallKeys();
    const marker = new MemoryDeviceMarker();
    const fileA = tmpDbFile('r2');
    const a = await addDevice(w, 'A', { dbFile: fileA, keys, deviceMarker: marker });
    const b = await addDevice(w, 'B');
    const ids = await shareAndJoin(w, a, [b]);
    const la = ids.get(a)!;
    const lb = ids.get(b)!;
    a.app.addItem(la, { text: 'Melk' });
    await w.settle(30_000);
    expect(await meta(a, 'install_id_unsaved')).toBe(await meta(a, 'install_id'));
    expect(marker.value).toBe(await meta(a, 'install_id'));
    const dev = a.app.deviceId;
    const pk = await pubkeyOf(a, la);
    // Kopie uit de back-up: database (met install_id_unsaved) en Keychain mee, Caches niet (nieuw, leeg merkteken).
    const a2 = await addDevice(w, 'A-hersteld', { dbFile: backupDb(fileA), keys: keys.restoredCopy(), deviceMarker: new MemoryDeviceMarker() });
    expect(a2.log.codes()).toContain('install.restored-unsaved');
    expect(a2.app.deviceId).not.toBe(dev);
    expect(await pubkeyOf(a2, la)).not.toBe(pk);
    // Het origineel blijft wie het was, ook na herstarts.
    for (let i = 0; i < 2; i++) {
      await a.restart();
      expect(a.app.deviceId).toBe(dev);
      expect(await pubkeyOf(a, la)).toBe(pk);
    }
    // En alle drie convergeren.
    a.app.addItem(la, { text: 'Kaas' });
    a2.app.addItem(la, { text: 'Brood' });
    await w.settle(60_000);
    for (const [d, l] of [[a, la], [a2, la], [b, lb]] as const) expect(names(d, l)).toEqual(['Brood', 'Kaas', 'Melk']);
  });

  it('D-50: wordt de cache opgeruimd op het origineel, dan hooguit één (veilige) rotatie en daarna niet bij elke start; zonder werkend merkteken nooit', async () => {
    const w = await makeWorld();
    const keys = new FailingInstallKeys();
    const marker = new MemoryDeviceMarker();
    const a = await addDevice(w, 'A', { dbFile: tmpDbFile('d50'), keys, deviceMarker: marker });
    const b = await addDevice(w, 'B');
    const ids = await shareAndJoin(w, a, [b]);
    const la = ids.get(a)!;
    a.app.addItem(la, { text: 'Melk' });
    await w.settle(30_000);
    marker.purge();
    await a.restart();
    const dev = a.app.deviceId;
    const pk = await pubkeyOf(a, la);
    for (let i = 0; i < 3; i++) {
      await a.restart();
      expect(a.app.deviceId).toBe(dev);
      expect(await pubkeyOf(a, la)).toBe(pk);
    }
    expect(names(a, la)).toEqual(['Melk']); // geen dataverlies
    // Merkteken kan niet geschreven worden (bijv. schijf vol): terug naar K-6, nooit roteren.
    marker.failing = true;
    marker.purge();
    await a.restart(); // roteert één keer (merkteken weg), schrijven mislukt → install_marker_failed
    const dev2 = a.app.deviceId;
    for (let i = 0; i < 3; i++) {
      await a.restart();
      expect(a.app.deviceId).toBe(dev2);
    }
    expect(await meta(a, 'install_marker_failed')).toBe(await meta(a, 'install_id'));
  });
});

/** KeyStore waarin het schrijven van de install_id (deviceOnly) structureel faalt (K-6). */
class FailingInstallKeys extends MemoryKeyStore {
  failing = true;
  override async set(key: string, value: string, opts?: { deviceOnly?: boolean }): Promise<void> {
    if (this.failing && key === keyNames.installId) throw new Error('errSecMissingEntitlement');
    return super.set(key, value, opts);
  }
}
