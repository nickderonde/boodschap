// S-14: ongeldige of vreemde berichten worden genegeerd — staat ongewijzigd, geen crash, gedempt log, zonder inhoud.
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import { addWsDevice, makeWsWorld, names, sleep, waitFor, wsShareAndJoin, type WsWorld } from '../sim/ws';
import { canonicalList } from '../../src/core/canonical';
import { buildAad, seal } from '../../src/core/crypto/aead';
import { deriveListKeys } from '../../src/core/crypto/kdf';
import { toBase64, utf8 } from '../../src/core/bytes';
import { SeededRandom } from '../support/SeededRandom';
import type { NEvent } from '../relay/RelayCore';

let w: WsWorld;
afterEach(async () => {
  await w?.stop();
});

describe('S-14: ruis en vreemde berichten (WS)', () => {
  it('S-14: ruis, slechte JSON, verkeerde sleutel, gewijzigde ciphertext, slechte handtekening, onbekend kind, > 100 KB, onbekende d-tag', async () => {
    w = await makeWsWorld(1);
    const a = await addWsDevice(w, 'A');
    const b = await addWsDevice(w, 'B');
    const ids = await wsShareAndJoin(a, [b]);
    a.app.addItem(ids.get(a)!, { text: 'echt' });
    await waitFor(() => names(b, ids.get(b)!).includes('Echt'));
    const before = canonicalList(b.app.stateOf(ids.get(b)!));
    const { listTag, encKey } = a.app.sharedLists()[0];
    const rnd = new SeededRandom(66);
    const attacker = rnd.bytes(32);
    const now = Math.floor(Date.now() / 1000);
    const mk = (content: string, opts: { kind?: number; d?: string; sk?: Uint8Array } = {}) =>
      finalizeEvent({ kind: opts.kind ?? 30078, created_at: now, tags: [['d', opts.d ?? `${listTag}:3`]], content }, opts.sk ?? attacker) as NEvent;
    const realEnv = (key: Uint8Array, sender: string, plain: Uint8Array) => toBase64(seal(key, buildAad(sender, listTag, 3), plain, rnd));
    const atkPub = getPublicKey(attacker);
    const junk: NEvent[] = [];
    junk.push(mk('dit is geen base64 !!!'));
    junk.push(mk(toBase64(utf8('{"geen":"envelop"}'))));
    junk.push(mk(realEnv(encKey, atkPub, utf8('geen deflate'))));
    junk.push(mk(realEnv(deriveListKeys(rnd.bytes(32)).encKey, atkPub, utf8('verkeerde sleutel'))));
    const ok = mk(realEnv(encKey, atkPub, utf8('x')));
    const flipped = { ...ok, content: ok.content.slice(0, 10) + (ok.content[10] === 'A' ? 'B' : 'A') + ok.content.slice(11) };
    junk.push(flipped as NEvent); // gewijzigde ciphertext → handtekening klopt niet meer
    junk.push({ ...mk(realEnv(encKey, atkPub, utf8('y'))), sig: '00'.repeat(64) } as NEvent);
    junk.push(mk('x', { kind: 1 }));
    junk.push(mk('A'.repeat(120_000)));
    junk.push(mk('x', { d: 'ff'.repeat(16) + ':0' }));
    junk.push(mk('x', { d: 'niet-geldig' }));
    // Rechtstreeks in de relay-opslag (langs de relay-validatie heen), daarna een nieuwe REQ.
    for (const e of junk) w.relays[0].core.events.set(e.id, e);
    b.app.foreground();
    await sleep(800);
    b.app.foreground();
    await sleep(800);
    expect(canonicalList(b.app.stateOf(ids.get(b)!))).toBe(before);
    expect(names(b, ids.get(b)!)).toEqual(['Echt']);
    // Gedempt: één logregel per code per minuut, zonder inhoud.
    const warn = b.log.lines.filter((l) => l.level === 'warn' && l.code.startsWith('recv.'));
    const perCode = new Map<string, number>();
    for (const l of warn) perCode.set(l.code, (perCode.get(l.code) ?? 0) + 1);
    for (const [, n] of perCode) expect(n).toBe(1);
    expect(b.log.text()).not.toMatch(/verkeerde sleutel|geen deflate|echt/);
    // De app werkt gewoon door.
    a.app.addItem(ids.get(a)!, { text: 'daarna' });
    await waitFor(() => names(b, ids.get(b)!).includes('Daarna'));
  });
});
