// ST-10 (CR-03): nieuwe deellinks gebruiken `boodschap://`; oude links en codes uit de rooktest (`bootschap://join#…`, `BS1-…`)
// blijven koppelen. De "gouden" vectoren zijn gegenereerd met de implementatie van de eerste release (commit 2020b20,
// geheim = bytes (i*7+3) & 255), dus onafhankelijk van de huidige code.
import { addDevice, makeWorld } from '../sim/hub';
import { LINK_PREFIX, parseShareText, toLink, toTextCode, URL_SCHEMES } from '../../src/core/codec/sharecode';
import { redirectSystemPath } from '../../app/+native-intent';
import { takePendingJoin } from '../../src/ui/pendingJoin';
import { sortedNames } from './helpers';

const SECRET = Uint8Array.from({ length: 32 }, (_, i) => (i * 7 + 3) & 255);
const GOLD = {
  plain: {
    hints: [] as string[],
    link: 'bootschap://join#AQMKERgfJi00O0JJUFdeZWxzeoGIj5adpKuyucDHztXcAP2M',
    code: 'BS1-041G-M48R-3WK2-TD1V-894N-0NTY-CNP7-6YM1-H27S-D7D4-NESB-KG67-SVAX-R07X-HG',
  },
  hints: {
    hints: ['wss://relay.example.org', 'wss://r2.example.net/ws'],
    link: 'bootschap://join#AQMKERgfJi00O0JJUFdeZWxzeoGIj5adpKuyucDHztXcASNyZWxheS5leGFtcGxlLm9yZwpyMi5leGFtcGxlLm5ldC93cxoo',
    code: 'BS1-041G-M48R-3WK2-TD1V-894N-0NTY-CNP7-6YM1-H27S-D7D4-NESB-KG67-SVAX-R093-E9JP-RRBS-5SJQ-GRBD-E1P6-ABKF-E9KG-MWHJ-5SJQ-GRBD-E1P6-ABKE-CNT2-YXVK-38M0',
  },
};
const OLD_TEXT = (g: { link: string; code: string }) =>
  `Doe mee met mijn boodschappenlijst in Bootschap. Open de app → Lijst toevoegen → plak deze tekst.\n${g.link}\nCode: ${g.code}\n\nDeel deze code alleen met mensen die je vertrouwt.`;

describe('ST-10: schema boodschap:// met behoud van bootschap:// en BS1-', () => {
  it('ET-ST10-1: nieuwe deellinks beginnen met boodschap://join#; het schema van app.json bevat beide; de payload en de tekstcode zijn byte-voor-byte gelijk aan de oude', () => {
    expect(LINK_PREFIX).toBe('boodschap://join#');
    expect([...URL_SCHEMES].sort()).toEqual(['boodschap', 'bootschap']);
    for (const g of Object.values(GOLD)) {
      const p = { secret: SECRET, relayHints: g.hints };
      expect(toTextCode(p)).toBe(g.code); // codeformaat en voorvoegsel ongewijzigd
      expect(toLink(p)).toBe(g.link.replace('bootschap://', 'boodschap://')); // alleen het schema is anders
    }
  });

  it('ET-ST10-2: oude links, oude codes en de volledige oude deeltekst uit de rooktest worden nog herkend (geheim en relay-hints kloppen)', () => {
    for (const g of Object.values(GOLD)) {
      for (const input of [g.link, g.code, g.code.toLowerCase(), OLD_TEXT(g), g.link.replace('bootschap://', 'boodschap://')]) {
        const p = parseShareText(input);
        expect([input.slice(0, 30), Buffer.from(p.secret).toString('hex')]).toEqual([input.slice(0, 30), Buffer.from(SECRET).toString('hex')]);
        expect(p.relayHints).toEqual(g.hints);
      }
    }
  });

  it('ET-ST10-3: native-intent verwerkt beide schema\'s (link wordt naar het koppelscherm gestuurd, code via het geheugen); andere paden blijven ongemoeid', () => {
    for (const path of [GOLD.plain.link, GOLD.plain.link.replace('bootschap://', 'boodschap://'), `/--/join#${GOLD.plain.link.split('#')[1]}`]) {
      expect(redirectSystemPath({ path, initial: true })).toBe('/koppelen');
      expect(takePendingJoin()).toContain('join#');
    }
    expect(redirectSystemPath({ path: '/lijst/abc', initial: false })).toBe('/lijst/abc');
    expect(takePendingJoin()).toBeNull();
  });
});

describe('ST-10: koppelen met oude codes via de facade', () => {
  it('ET-ST10-4: een lijst gedeeld door de nieuwe app koppelt via nieuwe link, oude link (bootschap://), oude tekstcode (BS1-) en een volledige oude deeltekst', async () => {
    const w = await makeWorld();
    const a = await addDevice(w, 'A');
    const la = a.app.lists()[0].id;
    for (const n of ['melk', 'brood', 'kaas']) a.app.addItem(la, { text: n });
    const info = await a.app.share(la);
    await w.settle(10_000);
    expect(info.link.startsWith('boodschap://join#')).toBe(true);
    expect(info.text).toContain('boodschap://join#');
    expect(info.text).not.toContain('bootschap://');
    expect(info.code.startsWith('BS1-')).toBe(true);
    const payload = info.link.split('#')[1];
    const legacyLink = `bootschap://join#${payload}`;
    const forms: [string, string][] = [
      ['nieuwe link', info.link],
      ['oude link', legacyLink],
      ['oude tekstcode', info.code],
      ['volledige oude deeltekst', OLD_TEXT({ link: legacyLink, code: info.code })],
      ['nieuwe deeltekst', info.text],
    ];
    for (const [label, text] of forms) {
      const d = await addDevice(w, `dev-${label}`);
      const r = await d.app.join(text);
      expect([label, r.kind]).toEqual([label, 'joined']);
      if (r.kind === 'error') throw new Error();
      await w.settle(30_000);
      expect([label, sortedNames(d, r.listId)]).toEqual([label, ['brood', 'kaas', 'melk']]);
    }
  });

  it('ET-ST10-5: een oude code en een nieuwe link van dezelfde lijst openen dezelfde lijst (geen tweede kopie)', async () => {
    const w = await makeWorld();
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B');
    const info = await a.app.share(a.app.lists()[0].id);
    await w.settle(10_000);
    const r1 = await b.app.join(`bootschap://join#${info.link.split('#')[1]}`);
    await w.settle(20_000);
    const r2 = await b.app.join(info.code);
    const r3 = await b.app.join(info.link);
    expect(r1.kind).toBe('joined');
    expect(r2.kind).toBe('already-present');
    expect(r3.kind).toBe('already-present');
    expect(b.app.lists().filter((l) => l.shared)).toHaveLength(1);
  });
});
