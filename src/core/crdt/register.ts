// LWW-register (§5.3): de hoogste HLC wint; bij gelijke HLC de grootste canonieke waarde (totale orde).
import { canonicalJSON } from '../canonical';
import type { MutableRegs, Register, Regs } from '../types';

export function compareRegister(a: Register, b: Register): number {
  if (a[1] !== b[1]) return a[1] > b[1] ? 1 : -1;
  const ca = canonicalJSON(a[0]);
  const cb = canonicalJSON(b[0]);
  return ca === cb ? 0 : ca > cb ? 1 : -1;
}

export function mergeRegister(a: Register | undefined, b: Register | undefined): Register | undefined {
  if (!a) return b;
  if (!b) return a;
  return compareRegister(a, b) >= 0 ? a : b;
}

/** Puntsgewijze unie+join van registermaps. Geeft `a` terug (zelfde referentie) als er niets verandert. */
export function mergeRegs(a: Regs, b: Regs): Regs {
  let out: MutableRegs | null = null;
  for (const k of Object.keys(b)) {
    const m = mergeRegister(a[k], b[k])!;
    if (m !== a[k]) {
      if (!out) out = { ...a };
      out[k] = m;
    }
  }
  return out ?? a;
}

/** Hoogste HLC over alle registers (ook onbekende sleutels). */
export function maxRegHlc(regs: Regs): string | null {
  let m: string | null = null;
  for (const k of Object.keys(regs)) {
    const h = regs[k][1];
    if (m === null || h > m) m = h;
  }
  return m;
}
