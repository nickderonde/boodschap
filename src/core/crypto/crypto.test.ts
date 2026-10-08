import { buildAad, open, seal, ENVELOPE_OVERHEAD } from './aead';
import { deriveListKeys, sha256Hex } from './kdf';
import { toHex, utf8, fromUtf8 } from '../bytes';
import { SeededRandom } from '../../../test/support/SeededRandom';

describe('NF-01 (crypto): end-to-end encryptie', () => {
  const rnd = new SeededRandom(42);
  const S = rnd.bytes(32);
  const { listTag, encKey } = deriveListKeys(S);

  it('NF-01: HKDF levert een listTag van 32 hex en een 256-bit sleutel; deterministisch per geheim', () => {
    expect(listTag).toMatch(/^[0-9a-f]{32}$/);
    expect(encKey).toHaveLength(32);
    expect(deriveListKeys(S).listTag).toBe(listTag);
    expect(deriveListKeys(rnd.bytes(32)).listTag).not.toBe(listTag);
    expect(() => deriveListKeys(new Uint8Array(5))).toThrow();
  });

  it('NF-01: envelop = 0x01 ‖ nonce(24) ‖ ciphertext; roundtrip; geen leesbare tekst', () => {
    const aad = buildAad('pub', listTag, 0);
    const env = seal(encKey, aad, utf8('halfvolle melk'), rnd);
    expect(env[0]).toBe(1);
    expect(env.length).toBe(ENVELOPE_OVERHEAD + 'halfvolle melk'.length);
    expect(Buffer.from(env).toString('latin1')).not.toContain('melk');
    expect(fromUtf8(open(encKey, aad, env))).toBe('halfvolle melk');
  });

  it('NF-01: unieke nonce over 10.000 berichten', () => {
    const r = new SeededRandom(99);
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) seen.add(toHex(seal(encKey, new Uint8Array(0), new Uint8Array(1), r).subarray(1, 25)));
    expect(seen.size).toBe(10_000);
  });

  it('NF-02 (a,b,c): verkeerde sleutel, bitflip of andere AAD (afzender/slot) faalt', () => {
    const aad = buildAad('pubA', listTag, 3);
    const env = seal(encKey, aad, utf8('kaas'), rnd);
    expect(() => open(deriveListKeys(rnd.bytes(32)).encKey, aad, env)).toThrow();
    const flipped = env.slice();
    flipped[30] ^= 1;
    expect(() => open(encKey, aad, flipped)).toThrow();
    expect(() => open(encKey, buildAad('pubB', listTag, 3), env)).toThrow();
    expect(() => open(encKey, buildAad('pubA', listTag, 4), env)).toThrow();
    expect(() => open(encKey, aad, env.subarray(0, 10))).toThrow();
    const v2 = env.slice();
    v2[0] = 2;
    expect(() => open(encKey, aad, v2)).toThrow();
  });

  it('sha256Hex', () => {
    expect(sha256Hex(utf8(''))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});
