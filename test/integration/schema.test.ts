// S-20: schemaversie in de payload. v = 2 → bewaard, niet gemerged, status fout + tekst. Onbekende registers blijven
// bewaard en worden doorgegeven.
import { deflateSync } from 'fflate';
import { addDevice, makeWorld, names, shareAndJoin } from '../sim/hub';
import { buildAad, seal } from '../../src/core/crypto/aead';
import { toBase64, utf8 } from '../../src/core/bytes';
import { encodeShard } from '../../src/core/codec/snapshot';
import { formatHlc } from '../../src/core/hlc';
import { sha256Hex } from '../../src/core/crypto/kdf';
import { SeededRandom } from '../support/SeededRandom';
import type { ListState } from '../../src/core/types';

function injected(w: Awaited<ReturnType<typeof makeWorld>>, listTag: string, encKey: Uint8Array, plaintext: Uint8Array, sender: string, version: number) {
  const env = seal(encKey, buildAad(sender, listTag, 0), plaintext, new SeededRandom(5));
  const raw = JSON.stringify({ c: listTag, s: 0, f: sender, v: version, e: toBase64(env) });
  const m = { id: sha256Hex(utf8(raw)), raw, channel: listTag, slot: 0, sender, version, envelopeB64: toBase64(env) };
  for (const r of w.hub.relays.values()) r.store.set(`${listTag}|0|${sender}`, m);
}

describe('S-20: schemaversie', () => {
  it('S-20: payload met v = 2 → bewaard in future_events, niet gemerged, status fout "nieuwere-versie"', async () => {
    const w = await makeWorld();
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B');
    const ids = await shareAndJoin(w, a, [b]);
    const listB = ids.get(b)!;
    const { listTag, encKey } = a.app.sharedLists()[0];
    injected(w, listTag, encKey, deflateSync(utf8(JSON.stringify({ v: 2, nieuw: 'formaat' }))), 'ee'.repeat(32), Math.floor(w.sched.now() / 1000));
    b.app.foreground();
    await w.settle(10_000);
    expect(b.app.syncStatus(listB)).toMatchObject({ kind: 'fout', reason: 'nieuwere-versie' });
    const n = await b.app.repo.read((r) => r.get<{ n: number }>('SELECT COUNT(*) AS n FROM future_events WHERE list_id=?', [listB]));
    expect(n?.n).toBe(1);
    expect(names(b, listB)).toEqual([]);
    // De eigen v1-snapshots worden gewoon verder gepubliceerd.
    b.app.addItem(listB, { text: 'gaat door' });
    await w.settle(10_000);
    expect(names(a, ids.get(a)!)).toEqual(['Gaat door']);
  });

  it('S-20: onbekende registers (nieuwere minor-versie) blijven bewaard en worden doorgegeven', async () => {
    const w = await makeWorld();
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B');
    const c = await addDevice(w, 'C');
    const ids = await shareAndJoin(w, a, [b]);
    const { listTag, encKey } = a.app.sharedLists()[0];
    const h = formatHlc(w.sched.now(), 0, '00000000000000ff');
    const st: ListState = { regs: {}, items: new Map([['ZZZZZZZZZZZZZZZZ', { id: 'ZZZZZZZZZZZZZZZZ', regs: { n: ['met prijs', h], k: ['overig', h], x: [false, h], a: [1, h], prijs: [2.49, h] }, del: null }]]) };
    injected(w, listTag, encKey, encodeShard(st, { dev: '00000000000000ff', rev: 1, shard: 0, shardCount: 1 }), 'dd'.repeat(32), Math.floor(w.sched.now() / 1000));
    a.app.foreground();
    await w.settle(10_000);
    expect(a.app.stateOf(ids.get(a)!).items.get('ZZZZZZZZZZZZZZZZ')?.regs.prijs?.[0]).toBe(2.49);
    // Haal de injectie weg: C kan het onbekende register alleen nog via de herpublicatie van A of B krijgen.
    for (const r of w.hub.relays.values()) r.store.delete(`${listTag}|0|${'dd'.repeat(32)}`);
    const info = await a.app.shareInfo(ids.get(a)!);
    const j = await c.app.join(info.text);
    await w.settle(20_000);
    if (j.kind === 'error') throw new Error();
    expect(c.app.stateOf(j.listId).items.get('ZZZZZZZZZZZZZZZZ')?.regs.prijs?.[0]).toBe(2.49);
  });
});
