import { decodeSharePayload, encodeSharePayload, parseShareText, shareText, toLink, toTextCode, ShareCodeParseError, LINK_PREFIX, LEGACY_LINK_PREFIX } from './sharecode';
import { SeededRandom } from '../../../test/support/SeededRandom';
import { sha256 } from '@noble/hashes/sha2.js';

const rnd = new SeededRandom(7);
const secret = rnd.bytes(32);
const payload = { secret, relayHints: [] as string[] };

function errCode(f: () => unknown): string | undefined {
  try {
    f();
  } catch (e) {
    return e instanceof ShareCodeParseError ? e.code : 'other';
  }
  return undefined;
}

describe('F-13 / F-15: deelcode', () => {
  it('F-13: roundtrip van de binaire payload; zonder hints 36 bytes', () => {
    const b = encodeSharePayload(payload);
    expect(b.length).toBe(36);
    expect(decodeSharePayload(b)).toEqual(payload);
  });

  it('F-13: relay-hints (wss:// weggelaten, ws:// voluit) gaan mee', () => {
    const p = { secret, relayHints: ['wss://relay.example.org', 'ws://127.0.0.1:7777'] };
    expect(decodeSharePayload(encodeSharePayload(p))).toEqual(p);
    expect(parseShareText(toTextCode(p))).toEqual(p);
  });

  it('F-13 / ST-10: link en QR-inhoud = boodschap://join#<base64url>', () => {
    const link = toLink(payload);
    expect(link.startsWith(LINK_PREFIX)).toBe(true);
    expect(link).toMatch(/^boodschap:\/\/join#[A-Za-z0-9_-]+$/);
    expect(parseShareText(link)).toEqual(payload);
  });

  it('F-15: tekstcode "BS1-" + Crockford-base32 in groepjes van 4 (58 tekens zonder hints)', () => {
    const code = toTextCode(payload);
    expect(code).toMatch(/^BS1-([0-9A-Z]{1,4}-)*[0-9A-Z]{1,4}$/);
    expect(code.slice(4).replace(/-/g, '')).toHaveLength(58);
    expect(parseShareText(code)).toEqual(payload);
  });

  it('F-15: de parser accepteert de hele deeltekst, de link of alleen de code', () => {
    const text = shareText(payload, 'Deel deze code alleen met mensen die je vertrouwt.');
    expect(parseShareText(text)).toEqual(payload);
    const code = toTextCode(payload);
    expect(parseShareText(`hoi! ${code} groetjes`)).toEqual(payload);
  });

  it('F-15: Crockford-normalisatie — kleine letters, O→0, I/L→1', () => {
    const code = toTextCode(payload);
    const body = code.slice(4);
    const messy = 'bs1-' + body.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'l');
    expect(parseShareText(messy)).toEqual(payload);
  });

  it('F-15: een tikfout geeft een controlesomfout', () => {
    const code = toTextCode(payload);
    const i = 10;
    const ch = code[i] === 'A' ? 'B' : 'A';
    expect(errCode(() => parseShareText(code.slice(0, i) + ch + code.slice(i + 1)))).toBe('controlesom');
  });

  it('F-14: foutcodes: geen-code, beschadigd, nieuwere-versie', () => {
    expect(errCode(() => parseShareText('zomaar wat tekst'))).toBe('geen-code');
    expect(errCode(() => parseShareText('bootschap://join#AAAA'))).toBe('beschadigd');
    expect(errCode(() => parseShareText('BS1-UUUU'))).toBe('beschadigd');
    // Versie 2 met een geldige controlesom → nieuwere-versie.
    const b = encodeSharePayload(payload);
    b[0] = 2;
    b.set(sha256(b.subarray(0, b.length - 2)).subarray(0, 2), b.length - 2);
    expect(errCode(() => decodeSharePayload(b))).toBe('nieuwere-versie');
    // Review bevinding 9: een tikfout in het versiebyte (controlesom klopt niet) → controlesom, niet "werk de app bij".
    const typo = encodeSharePayload(payload);
    typo[0] = 2;
    expect(errCode(() => decodeSharePayload(typo))).toBe('controlesom');
    const code = toTextCode(payload);
    expect(errCode(() => parseShareText('BS1-Z' + code.slice(5)))).toBe('controlesom');
    expect(errCode(() => decodeSharePayload(new Uint8Array(0)))).toBe('beschadigd');
  });

  it('ST-10: oude bootschap://-links, nieuwe boodschap://-links en de tekstcode BS1- geven hetzelfde geheim', () => {
    const p = { secret: new Uint8Array(32).map((_, i) => (i * 7 + 3) & 255), relayHints: ['wss://relay.example'] };
    const link = toLink(p);
    expect(link.startsWith(LINK_PREFIX)).toBe(true);
    const legacy = LEGACY_LINK_PREFIX + link.slice(LINK_PREFIX.length);
    for (const t of [link, legacy, toTextCode(p), `Doe mee: ${legacy} (oud)`]) expect(parseShareText(t)).toEqual(p);
    expect(toTextCode(p).startsWith('BS1-')).toBe(true);
    expect(shareText(p, 'w')).toContain('BOODSCHAP!');
  });
});
