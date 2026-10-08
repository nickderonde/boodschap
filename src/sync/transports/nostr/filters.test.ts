// Review CR-03 R-1: het authors-filter laat alleen geldige pubkeys (64 kleine hex-tekens) door.
import { buildFilters, VALID_PUBKEY } from './NostrTransport';

describe('R-1: buildFilters', () => {
  it('R-1: lege, te korte, hoofdletter- en niet-hex-pubkeys gaan niet in authors; geldige wel', () => {
    const good = 'ab'.repeat(32);
    const f = buildFilters([{ channel: 'c'.repeat(32), knownSenders: ['', 'abc', 'AB'.repeat(32), 'zz'.repeat(32), good] }])!;
    expect(f).toHaveLength(2);
    expect((f[1] as { authors: string[] }).authors).toEqual([good]);
    for (const a of (f[1] as { authors: string[] }).authors) expect(VALID_PUBKEY.test(a)).toBe(true);
  });

  it('R-1: alleen ongeldige leden → alleen het filter op #d, zonder authors', () => {
    const f = buildFilters([{ channel: 'c'.repeat(32), knownSenders: [''] }])!;
    expect(f).toHaveLength(1);
    expect(JSON.stringify(f)).not.toMatch(/authors/);
  });
});
