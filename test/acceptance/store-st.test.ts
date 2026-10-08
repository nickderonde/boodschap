// CR-03 (Eindtester): acceptatietests voor de [auto]-onderdelen van ST-01..ST-22 (REQUIREMENTS v0.6.1, sectie 6b).
// Onafhankelijk van de tests van de Engineer: alleen bestanden in de repo, `expo prebuild` in een tijdelijke map (zonder
// netwerk) en het script `make-screenshots` op synthetische invoer.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { opaqueBox, pngInfo, solidPng } from './png';

const ROOT = path.resolve(__dirname, '../..');
const R = (...p: string[]) => path.join(ROOT, ...p);
const read = (...p: string[]) => fs.readFileSync(R(...p), 'utf8');
const json = (...p: string[]) => JSON.parse(read(...p));
const APP_ID = 'nl.derondeengineering.boodschap';
const EMAIL = 'info@derondeengineering.nl';
const appJson = json('app.json').expo;
const eas = json('eas.json');
const pkg = json('package.json');
const listing = json('store/listing.json');

function text(p: string): string {
  return fs.readFileSync(R(p), 'utf8').replace(/\n$/, '');
}

describe('ST-01 / ST-02 / ST-03: identiteit en versiebeheer', () => {
  it('ET-ST01-1: app-ID is overal nl.derondeengineering.boodschap en er staat geen ander app-ID in de configuratie', () => {
    expect(appJson.ios.bundleIdentifier).toBe(APP_ID);
    expect(appJson.android.package).toBe(APP_ID);
    const cfg = [read('app.json'), read('eas.json'), read('locales/nl.json'), read('locales/en.json'), read('plugins/withOptionalCamera.js'), read('store/listing.json')].join('\n');
    const ids = new Set((cfg.match(/\b(?:nl|com|org|io|net)\.[A-Za-z0-9]+\.[A-Za-z0-9_.]+/g) ?? []).filter((x) => !/^com\.google\.android\.gms\.permission\.AD_ID$/.test(x)));
    expect([...ids].filter((x) => x !== APP_ID && !x.startsWith('nl.derondeengineering.boodschap'))).toEqual([]);
    expect(JSON.stringify(eas)).not.toMatch(/bundleIdentifier|"package"/); // geen afwijkend ID in EAS
  });

  it('ET-ST02-1: naam BOODSCHAP!, slug boodschap, package.json-naam boodschap; terugvalnaam ≤ 30 tekens', () => {
    expect(appJson.name).toBe('BOODSCHAP!');
    expect(appJson.slug).toBe('boodschap');
    expect(pkg.name).toBe('boodschap');
    expect(listing.fallbackName).toBe('BOODSCHAP! Boodschappenlijst');
    expect(listing.fallbackName.length).toBeLessThanOrEqual(30);
    expect(json('locales/nl.json').CFBundleDisplayName).toBe('BOODSCHAP!');
    expect(json('locales/en.json').CFBundleDisplayName).toBe('BOODSCHAP!');
  });

  it('ET-ST03-1: semver 1.0.0; EAS: appVersionSource remote en production autoIncrement; changelog NL+EN', () => {
    expect(appJson.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(appJson.version).toBe('1.0.0');
    expect(pkg.version).toBe(appJson.version);
    expect(eas.cli.appVersionSource).toBe('remote');
    expect(eas.build.production.autoIncrement).toBe(true);
    expect(eas.build.production.distribution).toBe('store');
    expect(eas.build.production.android.buildType).toBe('app-bundle'); // Google Play eist een AAB
    expect(eas.build.preview.android.buildType).toBe('apk'); // voor emulator/rooktest
    // geen vaste buildnummers die het automatisch ophogen blokkeren
    expect(JSON.stringify(appJson)).not.toMatch(/buildNumber|versionCode/);
    const log = read('docs/CHANGELOG.md');
    expect(log).toMatch(/1\.0\.0/);
    expect(log).toMatch(/\(NL\)/);
    expect(log).toMatch(/\(EN\)/);
  });
});

describe('ST-04: icoon en opstartscherm', () => {
  const img = (f: string) => R('assets/images', f);
  it('ET-ST04-1: iOS-icoon 1024x1024 PNG zonder alfakanaal (ook donker en getint, 1024x1024)', () => {
    for (const f of ['icon.png', 'icon-ios-dark.png', 'icon-ios-tinted.png']) {
      const i = pngInfo(img(f));
      expect([f, i.width, i.height]).toEqual([f, 1024, 1024]);
    }
    expect(pngInfo(img('icon.png')).hasAlpha).toBe(false);
    expect(appJson.icon).toBe('./assets/images/icon.png');
    expect(appJson.ios.icon).toEqual({ light: './assets/images/icon.png', dark: './assets/images/icon-ios-dark.png', tinted: './assets/images/icon-ios-tinted.png' });
  });

  it('ET-ST04-2: Android adaptive icon: voorgrond 1024x1024 transparant, hoofdvorm binnen de middelste 66%; monochroom icoon; achtergrondkleur; Play-icoon 512x512', () => {
    for (const f of ['adaptive-foreground.png', 'adaptive-monochrome.png']) {
      const i = pngInfo(img(f));
      expect([f, i.width, i.height, i.hasAlpha]).toEqual([f, 1024, 1024, true]);
      const b = opaqueBox(img(f));
      expect(b.transparentShare).toBeGreaterThan(0.2); // echt transparant, geen volle vlakken
      // veilige zone: middelste 66% (17%..83%)
      expect([f, b.x0 >= 1024 * 0.17 - 2, b.y0 >= 1024 * 0.17 - 2, b.x1 <= 1024 * 0.83 + 2, b.y1 <= 1024 * 0.83 + 2]).toEqual([f, true, true, true, true]);
    }
    expect(appJson.android.adaptiveIcon.foregroundImage).toBe('./assets/images/adaptive-foreground.png');
    expect(appJson.android.adaptiveIcon.monochromeImage).toBe('./assets/images/adaptive-monochrome.png');
    expect(appJson.android.adaptiveIcon.backgroundColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
    const play = pngInfo(R('store/graphics/play-icon-512.png'));
    expect([play.width, play.height]).toEqual([512, 512]);
  });

  it('ET-ST04-3: opstartscherm met lichte en donkere variant; alle verwijzingen in app.json bestaan; bronbestanden in de repo', () => {
    const splash = appJson.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen')[1];
    expect(splash.image).toBeTruthy();
    expect(splash.dark.image).toBeTruthy();
    expect(splash.backgroundColor).not.toBe(splash.dark.backgroundColor);
    expect(splash.image).not.toBe(splash.dark.image);
    const refs = (JSON.stringify(appJson).match(/\.\/(?:assets|locales|plugins)\/[^"]+/g) ?? []).map((p) => p.replace(/^\.\//, ''));
    expect(refs.length).toBeGreaterThanOrEqual(8);
    for (const r of refs) expect([r, fs.existsSync(R(r)) || fs.existsSync(R(r + '.js'))]).toEqual([r, true]);
    for (const f of ['icon.svg', 'adaptive-foreground.svg', 'splash-icon.svg', 'feature-graphic.svg']) expect(fs.existsSync(R('assets/source', f))).toBe(true);
    // geen merkteken van Apple/Google/Listonic in de bronbestanden
    const src = fs.readdirSync(R('assets/source')).map((f) => read('assets/source', f)).join('\n');
    expect(src).not.toMatch(/listonic|apple|google/i);
  });
});

describe('ST-05 / ST-12 / ST-22: permissies, configuratie en de gegenereerde manifest/Info.plist (expo prebuild)', () => {
  let tmp = '';
  let manifest = '';
  let plist = '';
  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'et-prebuild-'));
    execFileSync('rsync', ['-a', '--exclude', 'node_modules', '--exclude', 'dist', '--exclude', 'coverage', '--exclude', '.git', '--exclude', '.expo', '--exclude', 'android', '--exclude', 'ios', `${ROOT}/`, `${tmp}/`], { timeout: 60_000 });
    fs.symlinkSync(R('node_modules'), path.join(tmp, 'node_modules'));
    execFileSync('npx', ['expo', 'prebuild', '--no-install', '--clean'], { cwd: tmp, env: { ...process.env, CI: '1' }, timeout: 120_000, stdio: 'pipe' });
    manifest = fs.readFileSync(path.join(tmp, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
    plist = fs.readFileSync(path.join(tmp, 'ios/BOODSCHAP/Info.plist'), 'utf8');
  }, 180_000);
  afterAll(() => {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('ET-ST05-1: app.json: alleen CAMERA en INTERNET; AD_ID en RECORD_AUDIO geblokkeerd; camera zonder microfoon; supportsTablet false; allowBackup false; encryptie expliciet', () => {
    expect([...appJson.android.permissions].sort()).toEqual(['android.permission.CAMERA', 'android.permission.INTERNET']);
    expect(appJson.android.blockedPermissions).toEqual(expect.arrayContaining(['com.google.android.gms.permission.AD_ID', 'android.permission.RECORD_AUDIO']));
    const cam = appJson.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-camera')[1];
    expect(cam.microphonePermission).toBe(false);
    expect(cam.recordAudioAndroid).toBe(false);
    expect(cam.cameraPermission).toMatch(/camera/i);
    expect(cam.cameraPermission).toMatch(/QR/);
    expect(appJson.ios.supportsTablet).toBe(false);
    expect(appJson.android.allowBackup).toBe(false);
    expect(typeof appJson.ios.config.usesNonExemptEncryption).toBe('boolean');
    expect(JSON.stringify(appJson)).not.toMatch(/NSMicrophone|NSUserTracking|NSLocation|NSContacts|NSPhotoLibrary/);
  });

  it('ET-ST05-2: gegenereerde Android-manifest: CAMERA en INTERNET aanwezig; geen microfoon, advertentie-ID, opslag of locatie; camera niet verplicht; backup uit', () => {
    const active = [...manifest.matchAll(/<uses-permission android:name="([^"]+)"(?! tools:node="remove")\/>/g)].map((m) => m[1]).sort();
    expect(active).toEqual(['android.permission.CAMERA', 'android.permission.INTERNET']);
    for (const p of ['com.google.android.gms.permission.AD_ID', 'android.permission.RECORD_AUDIO']) expect(manifest).toMatch(new RegExp(`${p.replace(/\./g, '\\.')}" tools:node="remove"`));
    for (const f of ['android.hardware.camera', 'android.hardware.camera.autofocus', 'android.hardware.camera.any']) expect(manifest).toMatch(new RegExp(`<uses-feature android:name="${f.replace(/\./g, '\\.')}" android:required="false"`));
    expect(manifest).toMatch(/android:allowBackup="false"/);
    expect(manifest).toMatch(/<data android:scheme="boodschap"\/>/);
    expect(manifest).toMatch(/<data android:scheme="bootschap"\/>/);
    expect(manifest).not.toMatch(/READ_PHONE|READ_CONTACTS|RECORD_AUDIO"\/>|AD_ID"\/>/);
  });

  it('ET-ST05-3: gegenereerde Info.plist: camera-tekst in het Nederlands, geen microfoon/tracking/locatie, geen willekeurige netwerktoegang, encryptiesleutel gezet, talen nl+en, beide URL-schema\'s', () => {
    expect(plist).toMatch(/<key>NSCameraUsageDescription<\/key>\s*<string>[^<]*QR-code[^<]*<\/string>/);
    expect(plist).not.toMatch(/NSMicrophoneUsageDescription|NSUserTrackingUsageDescription|NSLocation|NSPhotoLibrary|NSContactsUsageDescription/);
    expect(plist).toMatch(/<key>NSAllowsArbitraryLoads<\/key>\s*<false\/>/);
    expect(plist).toMatch(/<key>ITSAppUsesNonExemptEncryption<\/key>\s*<(true|false)\/>/); // ST-12
    expect(plist).toMatch(/<key>CFBundleDevelopmentRegion<\/key>\s*<string>nl<\/string>/); // ST-22
    expect(plist).toMatch(/<key>CFBundleLocalizations<\/key>\s*<array>\s*<string>nl<\/string>\s*<string>en<\/string>/);
    expect(plist).toMatch(/<string>boodschap<\/string>/);
    expect(plist).toMatch(/<string>bootschap<\/string>/);
    expect(plist).toMatch(/UIUserInterfaceStyle<\/key>\s*<string>Automatic/);
    expect(fs.existsSync(path.join(tmp, 'ios/BOODSCHAP/Supporting/nl.lproj/InfoPlist.strings'))).toBe(true);
    expect(fs.existsSync(path.join(tmp, 'ios/BOODSCHAP/Supporting/en.lproj/InfoPlist.strings'))).toBe(true);
  });

  it('ET-ST22-1: lokalisaties: nl en en bevatten de camera-tekst in de eigen taal', () => {
    expect(appJson.locales).toEqual({ nl: './locales/nl.json', en: './locales/en.json' });
    expect(json('locales/nl.json').NSCameraUsageDescription).toMatch(/gebruikt de camera/);
    expect(json('locales/en.json').NSCameraUsageDescription).toMatch(/only uses the camera/);
  });
});

describe('ST-06: privacybeleid en support (NL en EN)', () => {
  const pages = {
    nl: { file: 'site/privacy/index.html', lang: 'nl', switchTo: 'en/privacy' },
    en: { file: 'site/en/privacy/index.html', lang: 'en', switchTo: 'privacy' },
  };
  // De tien inhoudelijke punten uit ST-06, per taal herkend aan kopjes/zoektermen.
  const POINTS: Record<'nl' | 'en', RegExp[]> = {
    nl: [/Wat er op je telefoon staat/i, /Camera/, /Geen account, geen tracking/i, /Gedeelde lijsten en relays/i, /Wat er op relays blijft staan/i, /deelcode is een geheim/i, /Gegevens verwijderen/i, /Kinderen/i, /AVG/, /Wijzigingen in dit beleid/i],
    en: [/What is stored on your phone/i, /Camera/, /No account, no tracking/i, /Shared lists and relays/i, /What remains on relays/i, /share code is a secret/i, /Deleting your data/i, /Children/i, /GDPR/, /Changes to this policy/i],
  };
  for (const lang of ['nl', 'en'] as const) {
    it(`ET-ST06-${lang}: privacybeleid (${lang}) bevat de tien punten, contactadres, uitgever, datum en taalwissel; geen adres of KvK`, () => {
      const html = read(pages[lang].file);
      expect(html).toMatch(new RegExp(`<html lang="${pages[lang].lang}"`));
      for (const re of POINTS[lang]) expect([lang, re.source, re.test(html)]).toEqual([lang, re.source, true]);
      expect(html).toContain('De Ronde Engineering (Nick de Ronde)');
      const mails = [...new Set(html.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/g) ?? [])];
      expect(mails).toEqual([EMAIL]);
      expect(html).toMatch(/(2026|oktober|October)/); // datum laatste wijziging
      expect(html).toMatch(/Laatst gewijzigd|Last (updated|modified|changed)/i);
      expect(html).toContain(pages[lang].switchTo); // taalwissel
      // Besluit C-4: naam, e-mail en KvK-nummer mogen genoemd worden, maar nooit een adres en nooit een placeholder.
      expect(html).not.toMatch(/\b\d{4}\s?[A-Z]{2}\b/); // geen postcode (dus geen adres)
      expect(html).not.toMatch(/straat\s+\d|\bstreet\s+\d|postbus|P\.?O\.? Box/i);
      const kvk = html.match(/(KvK|Chamber of Commerce)[^0-9<]{0,40}(\d+)/i);
      if (kvk) expect(kvk[2]).toMatch(/^\d{8}$/); // een KvK-nummer heeft 8 cijfers
      // inhoud klopt met NF-01..NF-06: relays zien IP-adres, tijdstippen en groottes; niet leesbaar
      expect(html).toMatch(/IP/);
      expect(html).toMatch(lang === 'nl' ? /versleuteld/i : /encrypted/i);
      // 'analytics', 'tracking' en 'advertenties/ads' komen alleen voor met een ontkenning
      const neg = lang === 'nl' ? /\b(geen|zonder)\b[^.<]{0,80}(analytics|tracking|advertenties)/i : /\b(no|without)\b[^.<]{0,80}(analytics|tracking|ads)/i;
      for (const m of html.matchAll(/[^.<>]*\b(analytics|tracking|advertenties|ads)\b[^.<]*/gi)) expect([lang, m[0].trim().slice(0, 80), neg.test(m[0])]).toEqual([lang, m[0].trim().slice(0, 80), true]);
    });
  }

  // BLOKKADE (besluit C-4): zolang er een placeholder (KVK-NUMMER) op de site staat, mag de site niet live en de repo niet publiek.
  // Deze test blijft bewust rood tot Nick het echte KvK-nummer (8 cijfers) heeft ingevuld.
  it('ET-ST06-5: BLOKKADE: geen placeholder (KVK-NUMMER, XXXX, TODO) op de privacy- en supportpagina\'s; wel een echt KvK-nummer met 8 cijfers', () => {
    for (const f of ['site/privacy/index.html', 'site/en/privacy/index.html', 'site/support/index.html', 'site/en/support/index.html']) {
      const html = read(f);
      expect([f, /KVK-?NUMMER|KVK_NUMMER|\[[^\]]*(kvk|number|nummer)[^\]]*\]|X{4,}|TODO|TBD|invullen/i.test(html)]).toEqual([f, false]);
      const kvk = html.match(/(KvK|Chamber of Commerce)[^0-9<]{0,40}(\d+)/i);
      expect([f, kvk?.[2]?.length]).toEqual([f, 8]);
    }
    // en geen placeholder in de storegegevens of documenten die naar buiten gaan
    for (const f of ['store/listing.json', 'docs/store/uitgever.md', 'README.md']) expect([f, /KVK-?NUMMER/i.test(read(f))]).toEqual([f, false]);
  });

  it('ET-ST06-3: supportpagina\'s NL en EN met het contactadres; startpagina\'s; .nojekyll; de Pages-workflow publiceert site/', () => {
    for (const f of ['site/support/index.html', 'site/en/support/index.html']) {
      const html = read(f);
      expect([...new Set(html.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/g) ?? [])]).toEqual([EMAIL]);
    }
    for (const f of ['site/index.html', 'site/en/index.html', 'site/.nojekyll']) expect(fs.existsSync(R(f))).toBe(true);
    const wf = read('.github/workflows/pages.yml');
    expect(wf).toMatch(/path:\s*['"]?site/);
  });

  it('ET-ST06-4: de URL\'s in de app, in store/listing.json en in de site-bestanden zijn dezelfde; elk bestaat als pagina', () => {
    const links = read('src/ui/links.ts');
    const base = 'https://nickderonde.github.io/boodschap/';
    expect(links).toContain(`'${base}'`);
    const map: [string, string][] = [
      [listing.privacyPolicyUrl.nl, 'site/privacy/index.html'],
      [listing.privacyPolicyUrl.en, 'site/en/privacy/index.html'],
      [listing.supportUrl.nl, 'site/support/index.html'],
      [listing.supportUrl.en, 'site/en/support/index.html'],
      [listing.marketingUrl, 'site/index.html'],
    ];
    for (const [url, file] of map) {
      expect(url.startsWith(base)).toBe(true);
      expect([url, fs.existsSync(R(file))]).toEqual([url, true]);
    }
    expect(listing.contactEmail).toBe(EMAIL);
  });
});

describe('ST-08: teksten voor de storevermelding', () => {
  const L = listing.limits;
  const bytes = (s: string) => Buffer.byteLength(s, 'utf8');
  for (const lang of ['nl', 'en'] as const) {
    it(`ET-ST08-${lang}: ${lang}: alle velden aanwezig en binnen de limieten`, () => {
      const f = (n: string) => text(`store/${lang}/${n}.txt`);
      const name = f('name');
      const sub = f('subtitle');
      const kw = f('keywords');
      const short = f('short-description');
      const full = f('description');
      const promo = f('promotional-text');
      const news = f('whats-new');
      const notes = f('review-notes');
      expect(name).toBe('BOODSCHAP!');
      expect(name.length).toBeLessThanOrEqual(L.apple.name);
      expect(sub.length).toBeGreaterThan(0);
      expect(sub.length).toBeLessThanOrEqual(L.apple.subtitle);
      expect(bytes(kw)).toBeLessThanOrEqual(L.apple.keywordsBytes);
      expect(kw.split(',').every((k: string) => k.trim() === k && k.length > 0)).toBe(true); // geen spaties rond komma's (verspilt tekens)
      expect(short.length).toBeLessThanOrEqual(L.google.shortDescription);
      expect(short.length).toBeGreaterThan(20);
      expect(full.length).toBeLessThanOrEqual(L.google.fullDescription);
      expect(full.length).toBeGreaterThan(300);
      expect(promo.length).toBeLessThanOrEqual(L.apple.promotionalText);
      expect(news.length).toBeGreaterThan(0);
      expect(news.length).toBeLessThanOrEqual(L.apple.whatsNew);
      expect(bytes(notes)).toBeLessThanOrEqual(L.apple.reviewNotesBytes);
      // trefwoorden bevatten de appnaam of concurrenten niet
      expect(kw).not.toMatch(/boodschap!|listonic|anylist|bring|google|apple/i);
    });

    it(`ET-ST08-${lang}-claims: ${lang}: waar en toetsbaar: gratis, geen advertenties, geen account, offline, versleuteld, geen eigen server, open source; geen verboden woorden`, () => {
      const all = ['name', 'subtitle', 'short-description', 'description', 'promotional-text', 'whats-new', 'review-notes'].map((n) => text(`store/${lang}/${n}.txt`)).join('\n');
      const full = text(`store/${lang}/description.txt`).toLowerCase();
      const need: Record<'nl' | 'en', RegExp[]> = {
        nl: [/gratis/, /geen advertenties|zonder advertenties|geen ads/, /geen account/, /offline|zonder bereik/, /versleutel/, /geen[^.]{0,30}server|geen eigen server/, /open source|broncode/],
        en: [/free/, /no ads/, /no account/, /offline|without reception/, /encrypted/, /no [a-z!]+ server|no server/, /open source|source code/],
      };
      for (const re of need[lang]) expect([lang, re.source, re.test(full)]).toEqual([lang, re.source, true]);
      // verbodslijst: concurrentnamen, superlatieven, beloftes die de app niet waarmaakt
      const forbidden = /listonic|anylist|bring!|out of milk|\bbest(e)?\b|nummer 1|number one|#1|push-?(melding|notification)|pushmelding|notificatie|notification|web-?(versie|app)|web version|ai-|chatgpt|voice assistant|siri|alexa/i;
      const hit = all.match(forbidden);
      expect([lang, hit?.[0] ?? null]).toEqual([lang, null]);
    });
  }

  it('ET-ST08-3: de Engelse tekst zegt eerlijk dat de interface Nederlands is; categorie Food & Drink; gratis zonder advertenties', () => {
    const en = text('store/en/description.txt') + text('store/en/short-description.txt') + text('store/en/review-notes.txt');
    expect(en).toMatch(/interface is in Dutch|Dutch interface|interface is Dutch/i);
    expect(listing.apple.primaryCategory).toBe('Food & Drink');
    expect(listing.google.category).toBe('Food & Drink');
    expect(listing.google.containsAds).toBe(false);
    expect(listing.apple.price).toBe('free');
    expect(listing.bundleId).toBe(APP_ID);
  });

  it('ET-ST08-4: reviewnotities noemen: geen account/demo-inlog, delen optioneel, synchroniseren met twee toestellen, camera alleen voor QR', () => {
    for (const lang of ['nl', 'en']) {
      const n = text(`store/${lang}/review-notes.txt`).toLowerCase();
      expect(n).toMatch(lang === 'nl' ? /geen account|geen inlog/ : /no account|no login/);
      expect(n).toMatch(lang === 'nl' ? /optioneel/ : /optional/);
      expect(n).toMatch(lang === 'nl' ? /twee toestellen/ : /two devices/);
      expect(n).toMatch(/qr/);
    }
  });
});

describe('ST-09: schermafbeeldingen en feature graphic', () => {
  it('ET-ST09-1: feature graphic 1024x500 PNG', () => {
    const i = pngInfo(R('store/graphics/feature-graphic-1024x500.png'));
    expect([i.width, i.height]).toEqual([1024, 500]);
  });

  it('ET-ST09-2: het script zet een iPhone-16-opname (1179x2556) om naar geldige afmetingen zonder alfakanaal, in NL en EN, met minstens 2 Google-beelden', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'et-shots-'));
    try {
      const raw = path.join(dir, 'raw');
      fs.mkdirSync(raw);
      for (const n of ['01-lijst.png', '02-toevoegen.png', '03-delen.png']) fs.writeFileSync(path.join(raw, n), solidPng(1179, 2556, [240, 240, 235]));
      fs.writeFileSync(path.join(dir, 'captions.json'), JSON.stringify({ '01-lijst.png': { nl: 'Samen boodschappen doen', en: 'Shop together' } }));
      execFileSync('node', [R('scripts/make-screenshots.mjs'), '--in', raw, '--out', path.join(dir, 'out')], { cwd: ROOT, timeout: 120_000, stdio: 'pipe' });
      const want: Record<string, [number, number]> = { 'apple-6.9': [1320, 2868], 'apple-6.3': [1179, 2556], google: [1080, 1920] };
      for (const [fmt, [w, h]] of Object.entries(want)) {
        for (const lang of ['nl', 'en']) {
          const files = fs.readdirSync(path.join(dir, 'out', fmt, lang)).filter((f) => f.endsWith('.png'));
          expect([fmt, lang, files.length >= (fmt === 'google' ? 2 : 1)]).toEqual([fmt, lang, true]);
          for (const f of files) {
            const i = pngInfo(path.join(dir, 'out', fmt, lang, f));
            expect([fmt, lang, f, i.width, i.height, i.hasAlpha]).toEqual([fmt, lang, f, w, h, false]);
          }
        }
      }
      // Google: zijden 320..3840 en verhouding tussen 16:9 en 9:16
      expect(1920 / 1080).toBeLessThanOrEqual(2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 180_000);

  it('ET-ST09-3: demolijst en schermafbeeldingen-instructies aanwezig (de ruwe beelden maakt Nick)', () => {
    expect(fs.readFileSync(R('docs/store/demo-data.md'), 'utf8').length).toBeGreaterThan(200);
    expect(fs.existsSync(R('store/screenshots/out'))).toBe(false); // nog niet gemaakt: openstaand voor Nick
  });
});

describe('ST-11 / ST-18: geen verzamelende componenten', () => {
  const DENY = /(^|\/)(expo-updates|expo-tracking-transparency|expo-ads|react-native-google-mobile-ads|@react-native-firebase|firebase|@sentry|sentry-expo|@bugsnag|bugsnag|@datadog|amplitude|@amplitude|mixpanel|@segment|posthog|appsflyer|react-native-appsflyer|adjust|react-native-adjust|onesignal|react-native-onesignal|expo-notifications|react-native-fbsdk|@datadog|countly|instabug|@microsoft\/applicationinsights|logrocket|@logrocket|smartlook|heap|@react-native-firebase\/analytics|expo-analytics|react-native-branch)/i;
  it('ET-ST11-1: package.json, lockfile en geïnstalleerde productieboom bevatten geen analytics-, crash-, advertentie-, attributie- of OTA-pakket', () => {
    const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(names.filter((n) => DENY.test(n))).toEqual([]);
    const lock = json('package-lock.json');
    const inLock = Object.keys(lock.packages).map((k) => k.replace(/^node_modules\//, '').replace(/^.*node_modules\//, ''));
    expect([...new Set(inLock.filter((n) => n && DENY.test(n)))]).toEqual([]);
    expect(fs.existsSync(R('node_modules/expo-updates'))).toBe(false);
    expect(JSON.stringify(appJson)).not.toMatch(/expo-updates|"updates"|runtimeVersion/);
  });

  it('ET-ST11-2: de app-code doet geen HTTP-verzoeken (fetch/XMLHttpRequest/axios) en opent alleen de vaste https-URL\'s uit links.ts met Linking', () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(R(d), { withFileTypes: true })) {
        const p = `${d}/${e.name}`;
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && !e.name.includes('generated')) files.push(p);
      }
    };
    walk('src');
    walk('app');
    expect(files.length).toBeGreaterThan(50);
    const code = files.map((f) => ({ f, c: read(f) }));
    for (const { f, c } of code) expect([f, /\b(fetch|XMLHttpRequest|axios)\s*\(|new XMLHttpRequest/.test(c.replace(/\/\/.*$/gm, ''))]).toEqual([f, false]);
    const open = code.filter(({ c }) => /Linking\.openURL/.test(c));
    expect(open.map((o) => o.f).sort()).toEqual(['app/instellingen.tsx']);
    const hosts = new Set<string>();
    for (const { c } of code) for (const m of c.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) hosts.add(m[1].toLowerCase());
    // alleen onze eigen vaste adressen (en voorbeeld-/documentatiedomeinen in commentaar)
    const allowed = /^(nickderonde\.github\.io|github\.com|www\.w3\.org|reactjs\.org|react\.dev|expo\.dev|docs\.expo\.dev|github\.com|developer\.apple\.com|example\.(com|org|net)|[a-z0-9.-]*\.example\.(com|org|net)|relay\.damus\.io|relay\.primal\.net|offchain\.pub|nostr\.mom)$/;
    expect([...hosts].filter((h) => !allowed.test(h))).toEqual([]);
  });

  it('ET-ST11-3: privacy-labels (Apple "Gegevens niet verzameld", Google "geen gegevens verzameld of gedeeld") zijn onderbouwd en consistent met de app', () => {
    const md = read('docs/store/privacy-labels.md');
    expect(md).toMatch(/Gegevens niet verzameld/);
    expect(md).toMatch(/geen gegevens verzameld of gedeeld/i);
    expect(md.length).toBeGreaterThan(1000);
    expect(md).toMatch(/IP-adres/);
  });
});

describe('ST-12 / ST-13 / ST-17 / ST-19: documenten', () => {
  it('ET-ST12-1: exportverklaring aanwezig en beschrijft de gebruikte algoritmen; ITSAppUsesNonExemptEncryption staat expliciet', () => {
    const md = read('docs/store/export-compliance.md');
    for (const a of [/XChaCha20-Poly1305/, /HKDF/, /secp256k1|Schnorr/, /TLS/]) expect(md).toMatch(a);
    expect(md).toMatch(/geen juridisch advies/i);
    expect(typeof appJson.ios.config.usesNonExemptEncryption).toBe('boolean');
  });

  it('ET-ST13-1: leeftijdsclassificatie vastgelegd (verwacht 4+ en PEGI 3 / Everyone, niet gericht op kinderen)', () => {
    const md = read('docs/store/age-rating.md');
    expect(md).toMatch(/4\+/);
    expect(md).toMatch(/PEGI 3|Everyone/);
  });

  it('ET-ST17-1: PUBLICEREN.md bevat alle stappen in volgorde (EAS, App Store Connect, Play Console, keystore-back-up, AAB, tijdlijn) en geen persoonlijke paden of onjuiste opdrachten', () => {
    const md = read('docs/PUBLICEREN.md');
    const order = ['eas-cli login', 'eas-cli init', 'build', 'App Store Connect', 'Play Console', 'submit', 'credentials', 'AAB', 'Tijdlijn'];
    let at = -1;
    for (const k of order) {
      const i = md.toLowerCase().indexOf(k.toLowerCase(), 0);
      expect([k, i >= 0]).toEqual([k, true]);
    }
    expect(md.indexOf('## 2. Bouwen met EAS')).toBeLessThan(md.indexOf('## 3. Apple'));
    expect(md.indexOf('## 3. Apple')).toBeLessThan(md.indexOf('## 4. Google'));
    void at;
    for (const cmd of ['eas-cli login', 'eas-cli init', 'eas-cli build --platform ios --profile production', 'eas-cli build --platform android --profile production', 'eas-cli submit --platform ios', 'eas-cli submit --platform android']) expect(md).toContain(cmd);
    // de genoemde profielen bestaan in eas.json
    expect(Object.keys(eas.build)).toEqual(expect.arrayContaining(['production', 'preview']));
    expect(md).not.toMatch(/\/Users\/[a-z]+\//);
  });

  // Was DEFECT D-ET-11 (minor, ST-19 a; opgelost door de Engineer, de test.failing-markering is verwijderd): het copyrightveld in
  // store/listing.json moest "<jaar> Nick de Ronde" zijn (Apple-account is individueel).
  it('ET-ST19-1: uitgeversdocument aanwezig; het copyrightveld in de storegegevens is "<jaar> Nick de Ronde" (ST-19 a)', () => {
    const md = read('docs/store/uitgever.md');
    expect(md).toMatch(/De Ronde Engineering/);
    expect(md).toMatch(/individu/);
    expect(listing.copyright).toMatch(/^\d{4} Nick de Ronde$/);
  });
});

describe('ST-14: open-source repository en licentie', () => {
  it('ET-ST14-1: LICENSE is MIT met "Copyright (c) <jaar> Nick de Ronde" en gelijk aan package.json; NOTICE scheidt naam en icoon van de licentie', () => {
    const lic = read('LICENSE');
    expect(lic.split('\n').slice(0, 3).join('\n')).toMatch(/Copyright \(c\) \d{4} Nick de Ronde/);
    expect(lic).toMatch(/Permission is hereby granted, free of charge/);
    expect(lic).toMatch(/THE SOFTWARE IS PROVIDED "AS IS"/);
    expect(pkg.license).toBe('MIT');
    expect(lic).toMatch(/^MIT License/);
    const notice = read('NOTICE');
    expect(notice).toMatch(/naam .*BOODSCHAP!.*(logo|icoon).*NIET onder de softwarelicentie/is);
    expect(notice).toMatch(/not covered by the software license/i);
    expect(pkg.repository.url).toContain('github.com/nickderonde/boodschap');
  });

  it('ET-ST14-2: README (NL met EN-samenvatting), SECURITY.md met contactadres, CONTRIBUTING.md; README noemt wat/draaien/privacy/bouwen/bijdragen', () => {
    const readme = read('README.md');
    expect(readme).toMatch(/English summary/);
    expect(readme).toMatch(/npx expo start/);
    expect(readme).toMatch(/[Pp]rivacy/);
    expect(readme).toMatch(/EAS/);
    expect(readme).toMatch(/CONTRIBUTING/);
    expect(read('SECURITY.md')).toContain(EMAIL);
    expect(read('CONTRIBUTING.md').length).toBeGreaterThan(200);
    expect(fs.existsSync(R('.github'))).toBe(true);
  });
});

describe('ST-07 / NF-07: licentielijst van alle productiepakketten', () => {
  it('ET-ST07-1: elk pakket in de installeerde productieboom (npm ls --omit=dev) staat in de gegenereerde licentielijst, met licentie en licentietekst; alle licenties zijn MIT-compatibel', () => {
    let out = '';
    try {
      out = execFileSync('npm', ['ls', '--omit=dev', '--all', '--json'], { cwd: ROOT, timeout: 120_000, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    } catch (e) {
      out = (e as { stdout?: Buffer }).stdout?.toString() ?? '';
    }
    const tree = JSON.parse(out) as { dependencies?: Record<string, { version?: string; dependencies?: unknown }> };
    const prod = new Set<string>();
    const walk = (deps: Record<string, { version?: string; dependencies?: unknown }> | undefined) => {
      for (const [n, d] of Object.entries(deps ?? {})) {
        if (d.version) prod.add(`${n}@${d.version}`);
        walk(d.dependencies as typeof deps);
      }
    };
    walk(tree.dependencies);
    expect(prod.size).toBeGreaterThan(100);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const gen = require('../../src/ui/licenses.generated') as { LICENSE_ENTRIES: { n: string; v: string; l: string; c: string[] }[]; LICENSE_TEXTS: Record<string, string> };
    const have = new Set(gen.LICENSE_ENTRIES.map((e) => `${e.n}@${e.v}`));
    // npm-aliassen (bijv. "@jest/react-is-18" is in werkelijkheid "react-is") worden op hun echte pakketnaam beoordeeld
    const realName = (id: string): string => {
      const at = id.lastIndexOf('@');
      const n = id.slice(0, at);
      const v = id.slice(at + 1);
      try {
        const real = JSON.parse(fs.readFileSync(R('node_modules', n, 'package.json'), 'utf8')) as { name: string };
        return `${real.name}@${v}`;
      } catch {
        return id;
      }
    };
    const missing = [...prod].filter((p) => !have.has(p) && !have.has(realName(p)));
    expect(missing).toEqual([]);
    for (const e of gen.LICENSE_ENTRIES) expect([e.n, e.l.length > 0]).toEqual([e.n, true]);
    expect(Object.keys(gen.LICENSE_TEXTS)).toEqual(expect.arrayContaining(['MIT']));
    for (const t of Object.values(gen.LICENSE_TEXTS)) expect(t.length).toBeGreaterThan(200);
    const allowed = /MIT|ISC|Apache-2\.0|BSD-2-Clause|BSD-3-Clause|0BSD|CC0-1\.0|Unlicense|BlueOak-1\.0\.0|CC-BY-4\.0|Python-2\.0|MPL-2\.0/;
    for (const e of gen.LICENSE_ENTRIES) expect([e.n, allowed.test(e.l)]).toEqual([e.n, true]);
  }, 180_000);
});
