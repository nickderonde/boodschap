// Opsplitsen in delen (§6.5, S-15): item → deel fnv1a32(utf8(id)) & (S−1); lijstregisters in elk deel.
import { utf8 } from '../bytes';
import type { ItemState, ListState } from '../types';

export const MAX_SHARDS = 16;
export const SHARD_COUNTS = [1, 2, 4, 8, 16] as const;

export function isShardCount(n: unknown): n is number {
  return typeof n === 'number' && (SHARD_COUNTS as readonly number[]).includes(n);
}

export function fnv1a32(data: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    h ^= data[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function shardOf(itemId: string, shardCount: number): number {
  return fnv1a32(utf8(itemId)) & (shardCount - 1);
}

/** Verdeelt een lijststaat over `shardCount` delen; elk deel bevat alle lijstregisters. */
export function splitShards(list: ListState, shardCount: number): ListState[] {
  const parts: Map<string, ItemState>[] = Array.from({ length: shardCount }, () => new Map());
  for (const it of list.items.values()) parts[shardOf(it.id, shardCount)].set(it.id, it);
  return parts.map((items) => ({ regs: list.regs, items }));
}
