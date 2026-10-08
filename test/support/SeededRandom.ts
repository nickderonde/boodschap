// Geseede, herhaalbare Random voor tests (alleen tests!). xoshiro128** met splitmix32-seeding.
import type { Random } from '../../src/core/types';

export class SeededRandom implements Random {
  private s: Uint32Array;
  draws = 0;

  constructor(seed: number) {
    let x = seed >>> 0;
    const next = () => {
      x = (x + 0x9e3779b9) >>> 0;
      let z = x;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
      return (z ^ (z >>> 16)) >>> 0;
    };
    this.s = Uint32Array.of(next(), next(), next(), next());
  }

  private nextU32(): number {
    const s = this.s;
    const result = Math.imul(((Math.imul(s[1], 5) << 7) | (Math.imul(s[1], 5) >>> 25)) >>> 0, 9) >>> 0;
    const t = (s[1] << 9) >>> 0;
    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];
    s[2] ^= t;
    s[3] = ((s[3] << 11) | (s[3] >>> 21)) >>> 0;
    return result;
  }

  bytes(n: number): Uint8Array {
    this.draws++;
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i += 4) {
      const v = this.nextU32();
      for (let j = 0; j < 4 && i + j < n; j++) out[i + j] = (v >>> (8 * j)) & 255;
    }
    return out;
  }

  /** Geheel getal in [0, max). */
  int(max: number): number {
    return this.nextU32() % max;
  }
}
