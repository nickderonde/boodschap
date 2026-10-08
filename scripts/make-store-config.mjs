#!/usr/bin/env node
// Genereert store.config.json (EAS Metadata, alleen Apple) uit de bron in store/ (teksten NL/EN, listing.json).
// Eén bron: pas teksten aan in store/nl en store/en, draai `npm run make:store-config`, en een test controleert dat
// store.config.json actueel is. Schema: eas-cli schema/metadata-0.json (gecontroleerd 2026-10-08, eas-cli 24.12).
// Uploaden naar App Store Connect: `npx eas-cli metadata:push` (zie docs/STORE_INVULLEN.md).
//
// Bewust NIET in dit bestand (zie docs/STORE_INVULLEN.md):
//  - apple.review: het schema eist voornaam, achternaam en telefoon van de contactpersoon; die vult Nick zelf in
//    App Store Connect in (samen met info@derondeengineering.nl en de notities uit store/en/review-notes.txt);
//  - releaseNotes: bij de allereerste versie (1.0.0) kan App Store Connect geen "Wat is nieuw" tonen.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const txt = (lang, f) => fs.readFileSync(path.join(ROOT, 'store', lang, `${f}.txt`), 'utf8').trim();

export function buildStoreConfig() {
  const listing = JSON.parse(fs.readFileSync(path.join(ROOT, 'store/listing.json'), 'utf8'));
  const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8')).expo;
  const info = (lang, locale) => ({
    title: txt(lang, 'name'),
    subtitle: txt(lang, 'subtitle'),
    description: txt(lang, 'description'),
    keywords: txt(lang, 'keywords').split(',').map((k) => k.trim()).filter(Boolean),
    promoText: txt(lang, 'promotional-text'),
    marketingUrl: lang === 'nl' ? listing.marketingUrl : `${listing.marketingUrl}en/`,
    supportUrl: listing.supportUrl[lang],
    privacyPolicyUrl: listing.privacyPolicyUrl[lang],
    _locale: locale,
  });
  const locales = [info('nl', 'nl-NL'), info('en', 'en-US')];
  return {
    configVersion: 0,
    apple: {
      version: app.version,
      copyright: listing.copyright,
      categories: ['FOOD_AND_DRINK', 'PRODUCTIVITY'],
      // Leeftijdsclassificatie (docs/store/age-rating.md): overal "geen", verwacht 4+.
      advisory: {
        alcoholTobaccoOrDrugUseOrReferences: 'NONE',
        contests: 'NONE',
        gamblingSimulated: 'NONE',
        gunsOrOtherWeapons: 'NONE',
        horrorOrFearThemes: 'NONE',
        matureOrSuggestiveThemes: 'NONE',
        medicalOrTreatmentInformation: 'NONE',
        profanityOrCrudeHumor: 'NONE',
        sexualContentGraphicAndNudity: 'NONE',
        sexualContentOrNudity: 'NONE',
        violenceCartoonOrFantasy: 'NONE',
        violenceRealistic: 'NONE',
        violenceRealisticProlongedGraphicOrSadistic: 'NONE',
        gambling: false,
        lootBox: false,
        unrestrictedWebAccess: false,
        userGeneratedContent: false,
        messagingAndChat: false,
        advertising: false,
        parentalControls: false,
        ageAssurance: false,
        healthOrWellnessTopics: false,
        kidsAgeBand: null,
        ageRatingOverride: 'NONE',
        koreaAgeRatingOverride: 'NONE',
      },
      info: Object.fromEntries(locales.map(({ _locale, ...rest }) => [_locale, rest])),
      // Na goedkeuring meteen live; geen gefaseerde uitrol (kleine app, geen server die het moet bijhouden).
      release: { automaticRelease: true, phasedRelease: false },
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  fs.writeFileSync(path.join(ROOT, 'store.config.json'), JSON.stringify(buildStoreConfig(), null, 2) + '\n');
  console.log('Geschreven: store.config.json');
}
