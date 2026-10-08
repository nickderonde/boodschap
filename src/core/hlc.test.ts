import { HlcClock, formatHlc, isHlc, parseHlc, succ, maxHlc, DRIFT_LIMIT_MS } from './hlc';

const A = 'a1b2c3d4e5f60718';
const B = 'ffffffffffffffff';

describe('HLC (§5.2)', () => {
  it('S-06: formaat is 32 hex en stringvergelijking = (ms, c, node)', () => {
    const h1 = formatHlc(1000, 0, A);
    const h2 = formatHlc(1000, 0, B);
    const h3 = formatHlc(1000, 1, A);
    const h4 = formatHlc(1001, 0, A);
    expect(h1).toMatch(/^[0-9a-f]{32}$/);
    expect(h1 < h2).toBe(true); // gelijk (ms,c) → node beslist
    expect(h2 < h3).toBe(true);
    expect(h3 < h4).toBe(true);
    expect(parseHlc(h3)).toEqual({ ms: 1000, c: 1, node: A });
  });

  it('S-14: validatie van HLC bij ontvangst', () => {
    expect(isHlc(formatHlc(5, 5, A))).toBe(true);
    expect(isHlc('xyz')).toBe(false);
    expect(isHlc('F'.repeat(32))).toBe(false);
    expect(isHlc(42)).toBe(false);
    expect(() => formatHlc(2 ** 48, 0, A)).toThrow();
    expect(() => formatHlc(1, 0x10000, A)).toThrow();
    expect(() => formatHlc(1, 0, 'zz')).toThrow();
  });

  it('now() is strikt stijgend, ook als de klok stilstaat of terugloopt', () => {
    const c = new HlcClock(A);
    const a = c.now(5000);
    const b = c.now(5000);
    const d = c.now(4000);
    expect(a < b && b < d).toBe(true);
    expect(c.now(6000)).toBe(formatHlc(6000, 0, A));
  });

  it('teller-overloop gaat naar ms+1', () => {
    const c = new HlcClock(A, { l: 10, c: 0xffff });
    expect(c.now(5)).toBe(formatHlc(11, 0, A));
    expect(succ(formatHlc(7, 0xffff, B), A)).toBe(formatHlc(8, 0, A));
    expect(succ(formatHlc(7, 3, B), A)).toBe(formatHlc(7, 4, A));
  });

  it('restore: max(opgeslagen, nu)', () => {
    expect(HlcClock.restore(A, { l: 100, c: 3 }, 50).state()).toEqual({ l: 100, c: 3 });
    expect(HlcClock.restore(A, { l: 100, c: 3 }, 500).state()).toEqual({ l: 500, c: 0 });
    expect(HlcClock.restore(A, null, 7).state()).toEqual({ l: 7, c: 0 });
  });

  it('S-16: remote > 24 u in de toekomst laat de klok niet meelopen (drift-bescherming), geen crash', () => {
    const c = new HlcClock(A);
    const now = 1_000_000;
    const far = formatHlc(now + DRIFT_LIMIT_MS + 3_600_000, 0, B);
    expect(c.observe(far, now)).toBe(false);
    expect(c.now(now) < far).toBe(true);
    const near = formatHlc(now + 3_600_000, 2, B);
    expect(c.observe(near, now)).toBe(true);
    expect(c.now(now) > near).toBe(true);
  });

  it('S-16: stamp is hoger dan alles wat van het item gezien is, ook met een achterlopende klok (±1 u)', () => {
    const hour = 3_600_000;
    const behind = new HlcClock(A);
    const seenFromAhead = formatHlc(10 * hour + hour, 0, B); // ander apparaat loopt 1 u voor
    const s = behind.stamp(10 * hour, seenFromAhead);
    expect(s > seenFromAhead).toBe(true);
    // Een HLC van ver in de toekomst sleept de globale klok niet mee.
    const far = formatHlc(10 * hour + 48 * hour, 0, B);
    const s2 = behind.stamp(10 * hour, far);
    expect(s2 > far).toBe(true);
    expect(behind.now(10 * hour) < far).toBe(true);
    expect(behind.stamp(10 * hour, null) > s).toBe(false);
  });

  it('maxHlc', () => {
    expect(maxHlc(null, null)).toBeNull();
    expect(maxHlc('b', 'a')).toBe('b');
    expect(maxHlc(undefined, 'a')).toBe('a');
    expect(maxHlc('a', null)).toBe('a');
  });

  it('ongeldige node in de constructor', () => {
    expect(() => new HlcClock('nope')).toThrow();
  });
});
