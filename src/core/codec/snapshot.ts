// Payload van een snapshot-deel (§6.4) met compacte HLC's, deflate en een begrensde inflate (§6.2, E-16).
import { deflateSync, Inflate } from 'fflate';
import { fromUtf8, utf8 } from '../bytes';
import { formatHlc, isHlc, parseHlc } from '../hlc';
import { isItemId } from '../ids';
import { isJsonValue, validItemRegValue, validListRegValue } from '../validate';
import type { Hlc, ItemState, ListState, MutableRegs, Register, Regs } from '../types';
import { isShardCount } from './shard';

export const SCHEMA_VERSION = 1;
export const INFLATE_LIMIT = 4 * 1024 * 1024;

export interface ShardMeta {
  dev: string;
  rev: number;
  shard: number;
  shardCount: number;
}

export type DecodedShard =
  | { kind: 'ok'; meta: ShardMeta; state: ListState; invalidRecords: number }
  | { kind: 'future'; version: number };

export class PayloadError extends Error {}

function collectHlcs(state: ListState): Hlc[] {
  const out: Hlc[] = [];
  for (const k of Object.keys(state.regs)) out.push(state.regs[k][1]);
  for (const it of state.items.values()) {
    for (const k of Object.keys(it.regs)) out.push(it.regs[k][1]);
    if (it.del) out.push(it.del);
  }
  return out;
}

/** Codeert een deelstaat naar gecomprimeerde bytes (plaintext van de envelop). */
export function encodeShard(state: ListState, meta: ShardMeta): Uint8Array {
  const hlcs = collectHlcs(state);
  let b = Number.MAX_SAFE_INTEGER;
  for (const h of hlcs) b = Math.min(b, parseHlc(h).ms);
  if (hlcs.length === 0) b = 0;
  const nodes: string[] = [];
  const nodeIdx = new Map<string, number>();
  const ch = (h: Hlc): string => {
    const p = parseHlc(h);
    let i = nodeIdx.get(p.node);
    if (i === undefined) {
      i = nodes.length;
      nodes.push(p.node);
      nodeIdx.set(p.node, i);
    }
    return `${(p.ms - b).toString(36)}.${p.c.toString(36)}.${i}`;
  };
  const regsOut = (regs: Regs) => {
    const o: Record<string, [unknown, string]> = {};
    for (const k of Object.keys(regs).sort()) o[k] = [regs[k][0], ch(regs[k][1])];
    return o;
  };
  const items = [...state.items.values()].sort((x, y) => (x.id < y.id ? -1 : 1));
  const it = items.map((x) => {
    const rec: unknown[] = [x.id, regsOut(x.regs)];
    if (x.del) rec.push(ch(x.del));
    return rec;
  });
  const payload = { v: SCHEMA_VERSION, dev: meta.dev, rev: meta.rev, sh: [meta.shard, meta.shardCount], b, nodes, l: regsOut(state.regs), it };
  return deflateSync(utf8(JSON.stringify(payload)), { level: 6 });
}

/** Inflate met een teller per chunk; breekt af boven `limit` bytes (bescherming tegen een zip-bom). */
export function boundedInflate(data: Uint8Array, limit = INFLATE_LIMIT): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;
  let done = false;
  const inf = new Inflate((chunk, final) => {
    total += chunk.length;
    if (total > limit) throw new PayloadError('inflate.limit');
    chunks.push(chunk);
    if (final) done = true;
  });
  inf.push(data, true);
  if (!done) throw new PayloadError('inflate.incomplete');
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Decodeert en valideert een payload. Envelopvelden streng; itemrecords per record (E-16). */
export function decodeShard(compressed: Uint8Array, limit = INFLATE_LIMIT): DecodedShard {
  let json: unknown;
  try {
    json = JSON.parse(fromUtf8(boundedInflate(compressed, limit)));
  } catch (e) {
    if (e instanceof PayloadError) throw e;
    throw new PayloadError('payload.parse');
  }
  if (!isObj(json)) throw new PayloadError('payload.shape');
  const v = json.v;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) throw new PayloadError('payload.v');
  if (v > SCHEMA_VERSION) return { kind: 'future', version: v };

  const sh = json.sh;
  if (!Array.isArray(sh) || sh.length !== 2 || !isShardCount(sh[1]) || !Number.isInteger(sh[0]) || sh[0] < 0 || sh[0] >= sh[1]) {
    throw new PayloadError('payload.sh');
  }
  const b = json.b;
  if (typeof b !== 'number' || !Number.isInteger(b) || b < 0 || b >= 2 ** 48) throw new PayloadError('payload.b');
  const nodes = json.nodes;
  if (!Array.isArray(nodes) || nodes.length > 4096 || !nodes.every((n) => typeof n === 'string' && /^[0-9a-f]{16}$/.test(n))) {
    throw new PayloadError('payload.nodes');
  }
  const dev = typeof json.dev === 'string' ? json.dev : '';
  const rev = typeof json.rev === 'number' && Number.isFinite(json.rev) ? json.rev : 0;

  const hlc = (c: unknown): Hlc => {
    if (typeof c !== 'string') throw new PayloadError('hlc');
    const m = /^([0-9a-z]{1,10})\.([0-9a-z]{1,4})\.(\d{1,4})$/.exec(c);
    if (!m) throw new PayloadError('hlc');
    const ms = b + parseInt(m[1], 36);
    const cc = parseInt(m[2], 36);
    const node = nodes[Number(m[3])] as string | undefined;
    if (node === undefined || cc > 0xffff || ms >= 2 ** 48) throw new PayloadError('hlc');
    const h = formatHlc(ms, cc, node);
    if (!isHlc(h)) throw new PayloadError('hlc');
    return h;
  };
  const regsIn = (o: unknown, valid: (k: string, v: unknown) => boolean): Regs => {
    if (!isObj(o)) throw new PayloadError('regs');
    const out: MutableRegs = {};
    for (const k of Object.keys(o)) {
      const r = o[k];
      if (!Array.isArray(r) || r.length !== 2) throw new PayloadError('reg');
      if (!valid(k, r[0]) || !isJsonValue(r[0])) throw new PayloadError('reg.value');
      out[k] = [r[0], hlc(r[1])] as Register;
    }
    return out;
  };

  // Envelopvelden: lijstregisters streng.
  const listRegs = regsIn(json.l, validListRegValue);

  const items = new Map<string, ItemState>();
  let invalidRecords = 0;
  const it = json.it;
  if (!Array.isArray(it)) throw new PayloadError('payload.it');
  for (const rec of it) {
    try {
      if (!Array.isArray(rec) || rec.length < 2 || rec.length > 3 || !isItemId(rec[0])) throw new PayloadError('rec');
      const regs = regsIn(rec[1], validItemRegValue);
      const del = rec.length === 3 ? hlc(rec[2]) : null;
      const prev = items.get(rec[0]);
      if (prev) throw new PayloadError('rec.dup');
      items.set(rec[0], { id: rec[0], regs, del });
    } catch {
      invalidRecords++;
    }
  }
  return { kind: 'ok', meta: { dev, rev, shard: sh[0], shardCount: sh[1] }, state: { regs: listRegs, items }, invalidRecords };
}
