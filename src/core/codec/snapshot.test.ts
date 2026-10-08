import { deflateSync } from 'fflate';
import { decodeShard, encodeShard, boundedInflate, PayloadError } from './snapshot';
import { splitShards, shardOf, fnv1a32, isShardCount } from './shard';
import { canonicalList } from '../canonical';
import { formatHlc } from '../hlc';
import { utf8 } from '../bytes';
import { buildAad, seal, ENVELOPE_OVERHEAD } from '../crypto/aead';
import { newItemId } from '../ids';
import { SeededRandom } from '../../../test/support/SeededRandom';
import type { ItemState, ListState, MutableRegs } from '../types';

const NODES = ['00000000000000a1', '00000000000000b2', '00000000000000c3'];
const T = 1_759_740_000_000;

function bigList(n: number, tombstoneRatio: number, rnd: SeededRandom): ListState {
  const items = new Map<string, ItemState>();
  const words = ['halfvolle melk', 'volkorenbrood', 'jonge kaas', 'tomaten', 'appels', 'pindakaas', 'koffiebonen', 'wc papier'];
  for (let i = 0; i < n; i++) {
    const id = newItemId(rnd);
    const node = NODES[i % 3];
    const h = formatHlc(T + i * 1000, 0, node);
    const h2 = formatHlc(T + i * 1000 + 500, 1, NODES[(i + 1) % 3]);
    const regs: MutableRegs = {
      n: [`${words[i % words.length]} ${i}`, h], k: ['zuivel-eieren', h], x: [i % 4 === 0, h2], a: [T + i * 1000, h],
    };
    if (i % 3 === 0) regs.q = [2, h2];
    const del = rnd.int(100) < tombstoneRatio * 100 ? formatHlc(T + i * 1000 + 900, 2, node) : null;
    items.set(id, { id, regs, del });
  }
  return { regs: { n: ['Boodschappen', formatHlc(T, 0, NODES[0])] }, items };
}

const meta = (shard = 0, shardCount = 1) => ({ dev: NODES[0], rev: 7, shard, shardCount });

describe('Snapshot-codec (§6.4) en opsplitsen (§6.5)', () => {
  it('roundtrip: decode(encode(staat)) = staat, met compacte HLC', () => {
    const rnd = new SeededRandom(1);
    const l = bigList(50, 0.3, rnd);
    const d = decodeShard(encodeShard(l, meta()));
    expect(d.kind).toBe('ok');
    if (d.kind !== 'ok') return;
    expect(canonicalList(d.state)).toBe(canonicalList(l));
    expect(d.meta).toEqual(meta());
    expect(d.invalidRecords).toBe(0);
  });

  it('S-15 (core): 1000 items met 30% tombstones → elk event-deel ≤ 48 KiB bij de gekozen S', () => {
    const rnd = new SeededRandom(2);
    const l = bigList(1000, 0.3, rnd);
    const maxEnvelope = Math.floor(((49152 - 450) * 3) / 4) - ENVELOPE_OVERHEAD;
    let S = 1;
    for (;;) {
      const parts = splitShards(l, S);
      const sizes = parts.map((p, i) => seal(new Uint8Array(32), buildAad('x', 'y', i), encodeShard(p, meta(i, S)), rnd).length);
      if (sizes.every((s) => s <= maxEnvelope)) {
        // event = JSON met base64-content + ±450 bytes overhead
        for (const s of sizes) expect(Math.ceil(s / 3) * 4 + 450).toBeLessThanOrEqual(49152);
        break;
      }
      S *= 2;
      expect(S).toBeLessThanOrEqual(16);
    }
    // de delen samen zijn weer de hele lijst
    const parts = splitShards(l, S);
    const merged = new Map<string, ItemState>();
    for (const p of parts) for (const [k, v] of p.items) merged.set(k, v);
    expect(merged.size).toBe(1000);
    expect(S).toBeLessThanOrEqual(4);
  });

  it('opsplitsen is deterministisch: fnv1a32 & (S−1)', () => {
    expect(fnv1a32(utf8(''))).toBe(0x811c9dc5);
    expect(fnv1a32(utf8('a'))).toBe(0xe40c292c);
    expect(shardOf('AAAAAAAAAAAAAAAA', 1)).toBe(0);
    for (const S of [2, 4, 8, 16]) expect(shardOf('AAAAAAAAAAAAAAAA', S)).toBe(shardOf('AAAAAAAAAAAAAAAA', 16) & (S - 1));
    expect(isShardCount(4)).toBe(true);
    expect(isShardCount(3)).toBe(false);
  });

  it('S-14 / E-16: een ongeldig itemrecord wordt overgeslagen, de rest wordt gemerged', () => {
    const payload = {
      v: 1, dev: 'x', rev: 1, sh: [0, 1], b: T, nodes: [NODES[0]], l: { n: ['L', '0.0.0'] },
      it: [
        ['AAAAAAAAAAAAAAAA', { n: ['goed', '1.0.0'] }],
        ['BBBBBBBBBBBBBBBB', { x: ['geen boolean', '1.0.0'] }],
        ['te-kort', { n: ['id fout', '1.0.0'] }],
        ['CCCCCCCCCCCCCCCC', { n: ['slechte hlc', '1.0.9'] }],
        ['DDDDDDDDDDDDDDDD', { n: ['ok met del', '1.0.0'] }, '2.0.0'],
        'geen array',
      ],
    };
    const d = decodeShard(deflateSync(utf8(JSON.stringify(payload))));
    expect(d.kind).toBe('ok');
    if (d.kind !== 'ok') return;
    expect([...d.state.items.keys()].sort()).toEqual(['AAAAAAAAAAAAAAAA', 'DDDDDDDDDDDDDDDD']);
    expect(d.invalidRecords).toBe(4);
    expect(d.state.items.get('DDDDDDDDDDDDDDDD')!.del).toBe(formatHlc(T + 2, 0, NODES[0]));
  });

  it('S-14: ongeldige envelopvelden → het hele event is ongeldig', () => {
    const bad = (p: unknown) => () => decodeShard(deflateSync(utf8(JSON.stringify(p))));
    const ok = { v: 1, sh: [0, 1], b: 0, nodes: [], l: {}, it: [] };
    expect(decodeShard(deflateSync(utf8(JSON.stringify(ok)))).kind).toBe('ok');
    expect(bad({ ...ok, sh: [1, 1] })).toThrow(PayloadError);
    expect(bad({ ...ok, sh: [0, 3] })).toThrow(PayloadError);
    expect(bad({ ...ok, b: -1 })).toThrow(PayloadError);
    expect(bad({ ...ok, nodes: ['xyz'] })).toThrow(PayloadError);
    expect(bad({ ...ok, l: { n: [5, '0.0.0'] } })).toThrow(PayloadError);
    expect(bad({ ...ok, it: 'x' })).toThrow(PayloadError);
    expect(bad({ ...ok, v: 0 })).toThrow(PayloadError);
    expect(bad([1, 2])).toThrow(PayloadError);
    expect(() => decodeShard(utf8('geen deflate'))).toThrow(PayloadError);
  });

  it('S-20: payload met v > 1 → future (niet mergen)', () => {
    const d = decodeShard(deflateSync(utf8(JSON.stringify({ v: 2, alles: 'anders' }))));
    expect(d).toEqual({ kind: 'future', version: 2 });
  });

  it('S-20: onbekende registers blijven bewaard en worden doorgegeven', () => {
    const h = formatHlc(T, 0, NODES[0]);
    const l: ListState = { regs: { n: ['L', h], zz: [{ toekomst: 1 }, h] }, items: new Map([['AAAAAAAAAAAAAAAA', { id: 'AAAAAAAAAAAAAAAA', regs: { n: ['x', h], prijs: [1.25, h] }, del: null }]]) };
    const d = decodeShard(encodeShard(l, meta()));
    expect(d.kind === 'ok' && canonicalList(d.state)).toBe(canonicalList(l));
  });

  it('E-16: inflate met limiet (zip-bom)', () => {
    const bomb = deflateSync(new Uint8Array(5 * 1024 * 1024));
    expect(() => boundedInflate(bomb)).toThrow('inflate.limit');
    expect(boundedInflate(deflateSync(utf8('abc'))).length).toBe(3);
    expect(() => decodeShard(bomb)).toThrow(PayloadError);
  });
});
