// CR-03 store-publicatie: configuratie, iconen, website, storeteksten, documenten en geheimencontrole (ST-01..ST-22).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const json = (p: string) => JSON.parse(read(p));
const app = json('app.json').expo;
const eas = json('eas.json');
const pkg = json('package.json');
const ID = 'nl.derondeengineering.boodschap';

/** Draait ESM-code (scripts/*.mjs) in een apart Node-proces en geeft de JSON-uitvoer terug. */
function mjs<T>(code: string): T {
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', code], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
  return JSON.parse(out) as T;
}
const imp = (p: string) => JSON.stringify(path.join(ROOT, p));

interface Png {
  width: number;
  height: number;
  colorType: number;
  pixels?: Buffer;
}
/** Leest een PNG; met `decode` ook de pixels (alleen voor PNG's van scripts/lib/png.mjs: filter 0, 8 bit). */
function png(p: string, decode = false): Png {
  const buf = fs.readFileSync(path.isAbsolute(p) ? p : path.join(ROOT, p));
  expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  const info: Png = { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType: buf[25] };
  if (decode) {
    const idat: Buffer[] = [];
    for (let i = 8; i < buf.length; ) {
      const len = buf.readUInt32BE(i);
      const type = buf.toString('ascii', i + 4, i + 8);
      if (type === 'IDAT') idat.push(buf.subarray(i + 8, i + 8 + len));
      i += 12 + len;
    }
    info.pixels = zlib.inflateSync(Buffer.concat(idat));
  }
  return info;
}

describe('ST-01 / ST-02 / ST-03: identiteit en versies', () => {
  it('ST-01: bundle-ID en package zijn exact het App-ID; geen andere ID\'s in eas.json', () => {
    expect(app.ios.bundleIdentifier).toBe(ID);
    expect(app.android.package).toBe(ID);
    expect(JSON.stringify(eas)).not.toMatch(/bundleIdentifier|"package"|applicationId/); // EAS leest het ID uit app.json
    const ids = JSON.stringify(app).match(/\b(nl|com)\.[a-z0-9]+\.[a-z0-9.]+\b/g) ?? [];
    expect([...new Set(ids)].filter((x) => !x.startsWith('com.google.android.gms.permission'))).toEqual([ID]);
  });

  it('ST-02: weergavenaam BOODSCHAP!, slug en package-naam boodschap; terugvalnaam ≤ 30 tekens', () => {
    expect(app.name).toBe('BOODSCHAP!');
    expect(app.slug).toBe('boodschap');
    expect(pkg.name).toBe('boodschap');
    const listing = json('store/listing.json');
    expect(listing.fallbackName.length).toBeLessThanOrEqual(30);
  });

  it('ST-03: semver 1.0.0, remote versiebron, automatisch ophogen in production, release-notities NL en EN', () => {
    expect(app.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(app.version).toBe('1.0.0');
    expect(pkg.version).toBe(app.version);
    expect(eas.cli.appVersionSource).toBe('remote');
    expect(eas.build.production.autoIncrement).toBe(true);
    expect(eas.build.production.distribution).toBe('store');
    expect(eas.build.preview).toMatchObject({ distribution: 'internal', android: { buildType: 'apk' } });
    // Review CR-03 K-2: geen development-profiel zonder expo-dev-client (Expo Go en `preview` volstaan).
    expect(eas.build.development).toBeUndefined();
    expect(JSON.stringify(eas)).not.toMatch(/developmentClient/);
    const cl = read('docs/CHANGELOG.md');
    expect(cl).toContain(`## ${app.version}`);
    expect(cl).toMatch(/Wat is nieuw/);
    expect(cl).toMatch(/What's new/);
  });
});

describe('ST-04: iconen en opstartscherm', () => {
  it('ST-04: iOS-icoon 1024x1024 zonder alfa; alle verwijzingen in app.json bestaan', () => {
    const icon = png('assets/images/icon.png');
    expect([icon.width, icon.height, icon.colorType]).toEqual([1024, 1024, 2]); // 2 = RGB, geen alfa
    const refs = [
      app.icon,
      app.ios.icon.light,
      app.ios.icon.dark,
      app.ios.icon.tinted,
      app.android.adaptiveIcon.foregroundImage,
      app.android.adaptiveIcon.monochromeImage,
    ];
    const splash = app.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen')[1];
    refs.push(splash.image, splash.dark.image);
    for (const r of refs) expect([r, fs.existsSync(path.join(ROOT, r))]).toEqual([r, true]);
    expect(splash.backgroundColor).toBe('#F6F6F3'); // lightTheme.bg
    expect(splash.dark.backgroundColor).toBe('#111214'); // darkTheme.bg
    expect(app.android.adaptiveIcon.backgroundColor).toBe('#1F7A55'); // accent
  });

  it('ST-04: adaptive icon: voorgrond en monochroom 1024 met alfa; alles binnen de veilige zone (middelste 66%)', () => {
    for (const f of ['assets/images/adaptive-foreground.png', 'assets/images/adaptive-monochrome.png']) {
      const p = png(f, true);
      expect([p.width, p.height, p.colorType]).toEqual([1024, 1024, 6]);
      const stride = 1024 * 4 + 1;
      const r = (1024 * 66) / 108 / 2; // veilige cirkel: 66 dp van 108 dp
      let outside = 0;
      let inside = 0;
      for (let y = 0; y < 1024; y += 4) {
        for (let x = 0; x < 1024; x += 4) {
          const a = p.pixels![y * stride + 1 + x * 4 + 3];
          if (a === 0) continue;
          if (Math.hypot(x - 512, y - 512) > r) outside++;
          else inside++;
        }
      }
      expect([f, outside]).toEqual([f, 0]);
      expect(inside).toBeGreaterThan(1000);
    }
  });

  it('ST-04: Play-icoon 512x512 (32-bit) en feature graphic 1024x500 zonder alfa; SVG-bron in de repo', () => {
    expect(png('store/graphics/play-icon-512.png')).toMatchObject({ width: 512, height: 512, colorType: 6 });
    expect(png('store/graphics/feature-graphic-1024x500.png')).toMatchObject({ width: 1024, height: 500, colorType: 2 });
    for (const f of ['glyph.svg.part', 'icon.svg', 'adaptive-foreground.svg', 'splash-icon.svg', 'feature-graphic.svg']) expect(fs.existsSync(path.join(ROOT, 'assets/source', f))).toBe(true);
    expect(fs.statSync(path.join(ROOT, 'store/graphics/play-icon-512.png')).size).toBeLessThan(1024 * 1024);
  });
});

describe('ST-05 / ST-12 / ST-18 / ST-22: permissies en storeconfiguratie', () => {
  const camera = app.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-camera')[1];

  it('ST-05: alleen camera en internet; geen microfoon, geen advertentie-ID; geen tablet; geen back-up', () => {
    expect(camera.microphonePermission).toBe(false);
    expect(camera.recordAudioAndroid).toBe(false);
    expect(camera.cameraPermission).toMatch(/QR-code/);
    expect([...app.android.permissions].sort()).toEqual(['android.permission.CAMERA', 'android.permission.INTERNET']);
    expect(app.android.blockedPermissions).toEqual(expect.arrayContaining(['com.google.android.gms.permission.AD_ID', 'android.permission.RECORD_AUDIO']));
    expect(app.ios.supportsTablet).toBe(false);
    expect(app.android.blockedPermissions).toContain('android.permission.VIBRATE');
    const secure = app.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-secure-store')[1];
    expect(secure.faceIDPermission).toBe(false); // geen Face ID-tekst in Info.plist
    expect(app.android.allowBackup).toBe(false);
    expect(app.plugins).toContain('./plugins/withOptionalCamera');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(require(path.join(ROOT, 'plugins/withOptionalCamera')).FEATURES).toContain('android.hardware.camera');
  });

  it('ST-12 / D-49: geen encryptiesleutel in app.json (afwijzing ITMS-90592); de exportvragen per build staan beschreven', () => {
    expect(app.ios.config?.usesNonExemptEncryption).toBeUndefined();
    expect(JSON.stringify(app)).not.toMatch(/ITSAppUsesNonExemptEncryption|ITSEncryptionExportComplianceCode/);
    const md = read('docs/store/export-compliance.md');
    expect(md).toMatch(/D-49/);
    expect(md).toMatch(/ITMS-90592/);
    const gids = read('docs/STORE_INVULLEN.md');
    expect(gids).toMatch(/per build/i);
    expect(gids).toMatch(/standard encryption algorithms/i);
    expect(gids).toMatch(/France[\s\S]{0,80}No/);
  });

  it('ST-18 / NF-06: geen expo-updates en geen analytics-, crash- of advertentie-SDK', () => {
    const all = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(all).not.toContain('expo-updates');
    expect(all.filter((n) => /analytics|sentry|crashlytics|firebase|admob|ads|appsflyer|adjust|segment|mixpanel/i.test(n))).toEqual([]);
  });

  it('ST-22 / ST-10: ontwikkelregio nl, lokalisaties nl en en (cameratekst in beide), beide URL-schema\'s', () => {
    expect(app.ios.infoPlist.CFBundleDevelopmentRegion).toBe('nl');
    expect(app.ios.infoPlist.CFBundleLocalizations).toEqual(['nl', 'en']);
    for (const l of ['nl', 'en']) expect(json(app.locales[l]).ios.NSCameraUsageDescription).toMatch(/QR/);
    expect(app.scheme).toEqual(['boodschap', 'bootschap']);
  });
});

describe('ST-06 / ST-21: website met privacybeleid en support (NL en EN)', () => {
  const pages = { nl: read('site/privacy/index.html'), en: read('site/en/privacy/index.html') };

  it('ST-06: beide talen, taalwissel, datum, contactadres en uitgever', () => {
    expect(pages.nl).toMatch(/lang="nl"/);
    expect(pages.en).toMatch(/lang="en"/);
    expect(pages.nl).toMatch(/href="\.\.\/en\/privacy\/"/);
    expect(pages.en).toMatch(/href="\.\.\/\.\.\/privacy\/"/);
    expect(pages.nl).toMatch(/Laatst gewijzigd: \d{1,2} \w+ \d{4}/);
    expect(pages.en).toMatch(/Last changed: \d{1,2} \w+ \d{4}/);
    for (const p of Object.values(pages)) {
      expect(p).toContain('info@derondeengineering.nl');
      expect(p).toContain('De Ronde Engineering');
    }
  });

  it('ST-06: de tien onderwerpen staan erin (lokaal, camera, geen tracking, relays/IP, bewaren, deelcode, verwijderen, kinderen, AVG, wijzigingen)', () => {
    const nl = ['Keychain', 'Camera', 'geen analytics', 'IP-adres', 'niet laten wissen', 'deelcode', 'Verwijder je de app', 'kinderen', 'AVG', 'Wijzigingen'];
    const en = ['Keychain', 'Camera', 'no analytics', 'IP address', 'cannot have them erased', 'share code', 'Uninstalling the app', 'children', 'GDPR', 'Changes'];
    for (const w of nl) expect([w, pages.nl.includes(w)]).toEqual([w, true]);
    for (const w of en) expect([w, pages.en.includes(w)]).toEqual([w, true]);
    const ids = (h: string) => (h.match(/<h2 id="/g) ?? []).length;
    expect(ids(pages.nl)).toBeGreaterThanOrEqual(11);
    expect(ids(pages.en)).toBeGreaterThanOrEqual(11);
  });

  it('ST-06 / review CR-03 C-1: crashrapporten en statistieken via Apple en Google staan in het beleid (NL en EN) en in privacy-labels.md', () => {
    expect(pages.nl).toMatch(/id="platform"[\s\S]*Apple en Google kunnen ons[\s\S]*crashrapporten[\s\S]*statistieken/);
    expect(pages.en).toMatch(/id="platform"[\s\S]*Apple and Google may give us[\s\S]*crash reports[\s\S]*statistics/);
    expect(pages.nl).not.toMatch(/ontvangen (dus )?geen gegevens/);
    expect(pages.en).not.toMatch(/receive no data|do not receive any data/);
    expect(read('docs/store/privacy-labels.md')).toMatch(/Platformgegevens van Apple en Google/);
    expect(pages.nl).toMatch(/als nieuw toestel/); // C-2: herstel op een ander toestel
  });

  it('ST-06: woorden als analytics/tracking/advertenties komen alleen ontkend voor', () => {
    const text = (h: string) => h.replace(/<[^>]+>/g, ' ');
    for (const [lang, h] of Object.entries(pages)) {
      for (const sentence of text(h).split(/(?<=[.!?:])\s+/)) {
        // Uitzondering: de alinea over wat Apple en Google zelf verzamelen (review CR-03 C-1).
        const platform = /Apple (en|and) Google|App Developers|app-ontwikkelaars|vastloopt|app crashes|collect this data themselves|verzamelen Apple/i.test(sentence);
        if (!platform && /analytics|tracking|advertenties|\bads\b|crash/i.test(sentence)) expect([lang, sentence.trim(), /\b(geen|no|not|niet)\b/i.test(sentence)]).toEqual([lang, sentence.trim(), true]);
      }
    }
  });

  it('ST-06 / ST-21: supportpagina\'s, landingspagina\'s, stylesheet en Pages-workflow vanuit site/', () => {
    for (const f of ['site/index.html', 'site/en/index.html', 'site/support/index.html', 'site/en/support/index.html', 'site/assets/style.css', 'site/assets/icon-192.png', 'site/.nojekyll']) {
      expect([f, fs.existsSync(path.join(ROOT, f))]).toEqual([f, true]);
    }
    expect(read('site/support/index.html')).toContain('mailto:info@derondeengineering.nl');
    const wf = read('.github/workflows/pages.yml');
    expect(wf).toMatch(/upload-pages-artifact@v\d/);
    expect(wf).toMatch(/path: "site"/);
  });

  it('ST-07: de URL\'s in de app wijzen naar deze pagina\'s (https, één host)', () => {
    const links = read('src/ui/links.ts');
    expect(links).toMatch(/SITE_URL = 'https:\/\/nickderonde\.github\.io\/boodschap\/'/);
    expect(links).toMatch(/PRIVACY_URL = `\$\{SITE_URL\}privacy\/`/);
    expect(links).toMatch(/SUPPORT_URL = `\$\{SITE_URL\}support\/`/);
    const listing = json('store/listing.json');
    expect(listing.privacyPolicyUrl.nl).toBe('https://nickderonde.github.io/boodschap/privacy/');
    expect(listing.supportUrl.en).toBe('https://nickderonde.github.io/boodschap/en/support/');
  });
});

describe('ST-08: storeteksten NL en EN', () => {
  const L = json('store/listing.json').limits;
  const t = (lang: string, f: string) => read(`store/${lang}/${f}.txt`).trim();
  const FORBIDDEN = /listonic|\bbeste\b|\bbest\b|#1|nummer één|push|notificatie|notification|\bweb\b|ipad|tablet/i;

  it('ST-08: lengtes binnen de limieten van Apple en Google (trefwoorden en reviewnotities in bytes)', () => {
    for (const lang of ['nl', 'en']) {
      const len = (f: string) => [...t(lang, f)].length;
      const bytes = (f: string) => Buffer.byteLength(t(lang, f), 'utf8');
      expect(len('name')).toBeLessThanOrEqual(Math.min(L.apple.name, L.google.title));
      expect(len('subtitle')).toBeLessThanOrEqual(L.apple.subtitle);
      expect(len('short-description')).toBeLessThanOrEqual(L.google.shortDescription);
      expect(len('description')).toBeLessThanOrEqual(Math.min(L.apple.description, L.google.fullDescription));
      expect(bytes('keywords')).toBeLessThanOrEqual(L.apple.keywordsBytes);
      expect(len('promotional-text')).toBeLessThanOrEqual(L.apple.promotionalText);
      expect(len('whats-new')).toBeLessThanOrEqual(L.apple.whatsNew);
      expect(bytes('review-notes')).toBeLessThanOrEqual(L.apple.reviewNotesBytes);
      expect(t(lang, 'keywords')).not.toMatch(/,\s/); // spaties na komma's kosten bytes
    }
  });

  it('ST-08: waar en toetsbaar: gratis, geen advertenties, geen account, offline, versleuteld, open source; geen verboden claims', () => {
    const nl = t('nl', 'description');
    const en = t('en', 'description');
    for (const w of [/gratis/i, /zonder advertenties|geen advertenties/i, /zonder account|geen account/i, /offline|zonder bereik/i, /versleuteld/i, /open source/i]) expect(nl).toMatch(w);
    for (const w of [/free/i, /no ads/i, /no account/i, /without reception|offline/i, /encrypted/i, /open source/i, /interface is in Dutch/i]) expect(en).toMatch(w);
    for (const lang of ['nl', 'en']) {
      for (const f of ['name', 'subtitle', 'short-description', 'description', 'keywords', 'promotional-text', 'whats-new']) expect([lang, f, FORBIDDEN.test(t(lang, f))]).toEqual([lang, f, false]);
    }
  });

  it('ST-08: reviewnotities noemen: geen account/demo-inlog, delen optioneel, sync met twee toestellen, camera alleen voor QR', () => {
    expect(t('nl', 'review-notes')).toMatch(/Geen account[\s\S]*demo-account[\s\S]*Delen is optioneel[\s\S]*twee toestellen[\s\S]*camera wordt alleen/);
    expect(t('en', 'review-notes')).toMatch(/No account[\s\S]*demo account[\s\S]*Sharing is optional[\s\S]*two devices[\s\S]*camera is only/);
    // Review CR-03 K-5: geen publieke gebruikersinhoud; eigen schema niet klikbaar in chat-apps (tekstcode werkt altijd).
    expect(t('en', 'review-notes')).toMatch(/no public user-generated content/i);
    expect(t('en', 'review-notes')).toMatch(/not make such a link tappable[\s\S]*text code/);
    expect(json('store/listing.json').reviewNotesForApple).toBe('store/en/review-notes.txt');
  });
});

describe('EAS Metadata (Apple): store.config.json', () => {
  const cfg = json('store.config.json');

  it('store.config.json is actueel (gegenereerd uit store/) en volgt de structuur van het EAS-schema', () => {
    const fresh = mjs<unknown>(`import { buildStoreConfig } from ${imp('scripts/make-store-config.mjs')}; console.log(JSON.stringify(buildStoreConfig()));`);
    expect(cfg).toEqual(fresh); // anders: npm run make:store-config
    expect(cfg.configVersion).toBe(0);
    expect(Object.keys(cfg)).toEqual(['configVersion', 'apple']);
    expect(cfg.apple.version).toBe(app.version);
    expect(cfg.apple.copyright).toBe('2026 Nick de Ronde');
    expect(cfg.apple.categories).toEqual(['FOOD_AND_DRINK', 'PRODUCTIVITY']);
    expect(Object.keys(cfg.apple.info)).toEqual(['nl-NL', 'en-US']);
    for (const [loc, i] of Object.entries(cfg.apple.info) as Array<[string, Record<string, unknown>]>) {
      expect([loc, (i.title as string).length >= 2 && (i.title as string).length <= 30]).toEqual([loc, true]);
      expect((i.subtitle as string).length).toBeLessThanOrEqual(30);
      expect((i.promoText as string).length).toBeLessThanOrEqual(170);
      expect((i.description as string).length).toBeLessThanOrEqual(4000);
      expect(Buffer.byteLength((i.keywords as string[]).join(','), 'utf8')).toBeLessThanOrEqual(100);
      for (const u of ['privacyPolicyUrl', 'supportUrl', 'marketingUrl']) expect(i[u]).toMatch(/^https:\/\/nickderonde\.github\.io\/boodschap\//);
    }
    const adv = cfg.apple.advisory;
    for (const [k, v] of Object.entries(adv)) if (typeof v === 'string' && k !== 'ageRatingOverride' && k !== 'koreaAgeRatingOverride') expect([k, v]).toEqual([k, 'NONE']);
    for (const k of ['gambling', 'unrestrictedWebAccess', 'userGeneratedContent', 'messagingAndChat', 'advertising']) expect([k, adv[k]]).toEqual([k, false]);
    expect(cfg.apple.review).toBeUndefined(); // naam en telefoon vult Nick zelf in (STORE_INVULLEN.md)
  });

  it('eas.json submit.production.ios: taal nl-NL, SKU en metadataPath; bundle-ID uit app.json; ascAppId van App Store Connect (nooit leeg: EAS weigert dat)', () => {
    const ios = eas.submit.production.ios;
    expect(ios.bundleIdentifier).toBeUndefined();
    expect(ios.language).toBe('nl-NL');
    expect(ios.metadataPath).toBe('./store.config.json');
    expect(ios.ascAppId).toBe('6820509019'); // App Store Connect app-ID (na de eerste indiening); nooit leeg
    expect(read('docs/STORE_INVULLEN.md')).toMatch(/ascAppId/);
  });
});

describe('ST-09: schermafbeeldingen', () => {
  it('ST-09: het script maakt Apple 6,9" (1320x2868), 6,3" (1179x2556) en Google (1080x1920) zonder alfa, per taal met bijschrift', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'boodschap-ss-'));
    const raw = path.join(tmp, 'raw');
    fs.mkdirSync(raw);
    const out = mjs<string[]>(`
      import { Resvg } from '@resvg/resvg-js';
      import fs from 'node:fs';
      import { encodePng } from ${imp('scripts/lib/png.mjs')};
      import { makeScreenshots } from ${imp('scripts/make-screenshots.mjs')};
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1179" height="2556"><rect width="1179" height="2556" fill="#F6F6F3"/></svg>';
      for (const n of ['01-lijst.png', '02-delen.png']) { const i = new Resvg(svg).render(); fs.writeFileSync(${JSON.stringify(raw)} + '/' + n, encodePng(i.width, i.height, i.pixels, { alpha: false })); }
      fs.writeFileSync(${JSON.stringify(tmp)} + '/captions.json', JSON.stringify({ '01-lijst.png': { nl: 'Samen één lijst', en: 'One shared list' } }));
      console.log(JSON.stringify(makeScreenshots({ inDir: ${JSON.stringify(raw)}, outDir: ${JSON.stringify(path.join(tmp, 'out'))} })));`);
    expect(out).toHaveLength(3 * 2 * 2);
    const size = (f: string) => {
      const p = png(f);
      return [p.width, p.height, p.colorType];
    };
    expect(size(out.find((f) => f.includes('apple-6.9/nl/01'))!)).toEqual([1320, 2868, 2]);
    expect(size(out.find((f) => f.includes('apple-6.3/en/02'))!)).toEqual([1179, 2556, 2]);
    const g = size(out.find((f) => f.includes('google/nl/01'))!);
    expect(g).toEqual([1080, 1920, 2]);
    expect(Math.max(g[0], g[1]) / Math.min(g[0], g[1])).toBeLessThanOrEqual(2);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

describe('ST-11 / ST-13 / ST-14 / ST-19: documenten en licentie', () => {
  it('ST-11/12/13/19 en ST-09: documenten in docs/store aanwezig', () => {
    for (const f of ['privacy-labels.md', 'export-compliance.md', 'age-rating.md', 'uitgever.md', 'demo-data.md']) expect([f, fs.existsSync(path.join(ROOT, 'docs/store', f))]).toEqual([f, true]);
    expect(read('docs/store/privacy-labels.md')).toMatch(/Gegevens niet verzameld|Data Not Collected|do not collect data/i);
  });

  it('ST-14: MIT-licentie van Nick de Ronde, gelijk aan package.json; NOTICE sluit naam en icoon uit; SECURITY en CONTRIBUTING', () => {
    const lic = read('LICENSE');
    expect(lic).toMatch(/^MIT License/);
    expect(lic).toMatch(/Copyright \(c\) 2026 Nick de Ronde/);
    expect(pkg.license).toBe('MIT');
    expect(read('NOTICE')).toMatch(/naam "BOODSCHAP!", het logo en het app-icoon[\s\S]*NIET onder de softwarelicentie/);
    expect(read('SECURITY.md')).toContain('info@derondeengineering.nl');
    expect(fs.existsSync(path.join(ROOT, 'CONTRIBUTING.md'))).toBe(true);
  });

  it('ST-07: src/ui/licenses.generated.ts is actueel en bevat alle productiepakketten', () => {
    const r = mjs<{ same: boolean; prod: string[] }>(`
      import fs from 'node:fs';
      import { generate } from ${imp('scripts/gen-licenses.mjs')};
      import { productionPackages } from ${imp('scripts/check-licenses.mjs')};
      const same = generate() === fs.readFileSync(${imp('src/ui/licenses.generated.ts')}, 'utf8');
      console.log(JSON.stringify({ same, prod: productionPackages(process.cwd()).map((p) => p.name) }));`);
    expect(r.same).toBe(true); // anders: npm run gen:licenses
    const gen = read('src/ui/licenses.generated.ts');
    for (const name of Object.keys(pkg.dependencies)) expect([name, gen.includes(`"n":"${name}"`)]).toEqual([name, true]);
    expect(r.prod.length).toBeGreaterThan(100);
    // Review CR-03 K-3: NOTICE-inhoud van Apache-2.0-pakketten gaat mee.
    const withNotice = mjs<string[]>(`
      import fs from 'node:fs';
      import { productionPackages } from ${imp('scripts/check-licenses.mjs')};
      console.log(JSON.stringify(productionPackages(process.cwd()).filter((p) => /Apache-2[.]0/.test(p.license) && fs.readdirSync(p.dir).some((n) => /^notice([.][a-z]+)?$/i.test(n))).map((p) => p.name)));`);
    expect(withNotice.length).toBeGreaterThan(0);
    const entries = JSON.parse(/LICENSE_ENTRIES: LicenseEntry\[\] = (.*);\n/.exec(gen)![1]) as Array<{ n: string; notice?: string }>;
    for (const name of withNotice) expect([name, !!entries.find((e) => e.n === name)?.notice]).toEqual([name, true]);
  });
});

describe('ST-15: geheimen en persoonsgegevens', () => {
  type Hit = { rule: string };
  const scan = (lines: Array<[string, string]>) =>
    mjs<Hit[][]>(`
      import { scanLine, scanFileName } from ${imp('scripts/check-secrets.mjs')};
      const lines = ${JSON.stringify(lines)};
      console.log(JSON.stringify(lines.map(([l, f]) => [...scanFileName(f), ...scanLine(l, f)])));`);
  // Testinvoer wordt uit delen opgebouwd, zodat dit bestand zelf geen treffer is.
  const hex = 'ab'.repeat(32);
  const home = '/' + 'Users/' + 'jan/';

  it('ST-15: herkent sleutels, tokens, 64-hex buiten tests, e-mail, lokale paden, telefoonnummers en sleutelbestanden', () => {
    const cases: Array<[string, string]> = [
      ['-----BEGIN ' + 'PRIVATE KEY-----', 'a.txt'],
      ['n' + 'sec1' + 'q'.repeat(58), 'a.ts'],
      ['gh' + 'p_' + 'A'.repeat(36), 'a.ts'],
      ['AI' + 'za' + 'B'.repeat(35), 'a.ts'],
      [`const k = '${hex}';`, 'src/x.ts'],
      ['mail jan' + '@' + 'voorbeeld.nl', 'docs/a.md'],
      [`cd ${home}project`, 'README.md'],
      ['bel 06' + '12345678', 'docs/a.md'],
      ['', 'certs/dist.p' + '12'],
      ['', '.e' + 'nv'],
    ];
    const hits = scan(cases);
    hits.forEach((h, i) => expect([cases[i], h.length > 0]).toEqual([cases[i], true]));
  });

  it('ST-15: allowlist: testsleutels in testbestanden, het contactadres, noreply-adressen en .env.example', () => {
    const ok: Array<[string, string]> = [
      [`const k = '${hex}';`, 'src/core/crypto/crypto.test.ts'],
      [`const k = '${hex}';`, 'test/support/x.ts'],
      ['info' + '@' + 'derondeengineering.nl', 'README.md'],
      ['Co-Authored-By: Claude <noreply' + '@' + 'anthropic.com>', 'x'],
      ['', '.env.example'],
    ];
    for (const h of scan(ok)) expect(h).toEqual([]);
  });

  it('ST-15: de werkmap is schoon, op documenten van andere rollen na (Projectleider, Architect, Eindtester; die meldt de Engineer)', () => {
    const r = mjs<Array<{ where: string; rule: string }>>(`
      import { scanWorktree } from ${imp('scripts/check-secrets.mjs')};
      console.log(JSON.stringify(scanWorktree()));`);
    const PL_DOCS = /^(docs\/(APPROVALS|REQUIREMENTS|PUBLICEREN|ARCHITECTURE|TEST_REPORT|BRIEF|HANDMATIGE_TEST)\.md|docs\/reviews\/review-(architect|projectleider|eindtester)[^:]*|test\/acceptance\/[^:]*):/;
    // De KvK-placeholder is bewust een treffer (C-4): zolang die er staat, faalt `npm run check:secrets` (publicatiepoort).
    expect(r.filter((f) => !PL_DOCS.test(f.where) && f.rule !== 'placeholder')).toEqual([]);
  });

  it('review CR-03 C-4: de KvK-placeholder in site/ en store/ laat check:secrets falen; elders (docs) niet', () => {
    const ph = 'KVK-' + 'NUMMER';
    const hits = scan([
      [`KvK-nummer: ${ph}</p>`, 'site/support/index.html'],
      [`KvK-nummer: ${ph}`, 'store/nl/description.txt'],
      [`de placeholder ${ph}`, 'docs/store/uitgever.md'],
    ]);
    expect(hits.map((h) => h.some((x) => x.rule === 'placeholder'))).toEqual([true, true, false]);
    // Pagina's: uitgever met naam, e-mail en KvK-regel; geen adres (besluit Nick).
    for (const f of ['site/support/index.html', 'site/en/support/index.html', 'site/privacy/index.html', 'site/en/privacy/index.html']) {
      const h = read(f);
      expect([f, /De Ronde Engineering \(Nick de Ronde\)/.test(h) && h.includes('info@derondeengineering.nl') && /KvK/.test(h)]).toEqual([f, true]);
      expect([f, /adres:|address:/i.test(h.replace(/E-?mail/gi, ''))]).toEqual([f, false]);
    }
    expect(read('.github/workflows/pages.yml')).toMatch(/KVK-NUMMER/);
    // Review CR-03 §6: het adres is vindbaar via de handelaarsgegevens in de stores, zonder het op de site te zetten.
    expect(read('site/support/index.html')).toMatch(/vestigingsadres en het telefoonnummer staan bij de handelaarsgegevens in de App Store en Google Play/);
    expect(read('site/en/support/index.html')).toMatch(/business address and phone number are listed in the trader details/);
  });
});
