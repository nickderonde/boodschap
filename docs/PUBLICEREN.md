# BOODSCHAP! publiceren in de App Store en Google Play

Plan voor Nick. Status: v0.3 (Projectleider, ST-17), met jouw besluiten B-06 t/m B-20 uit REQUIREMENTS v0.6.2. De Engineer controleert de opdrachten tegen de actuele Expo-documentatie en vult ze aan met de definitieve bestandsnamen. Bedragen, maten en regels van Apple, Google en Expo veranderen; controleer ze bij elke stap even op de officiële pagina.

## 0. Wat je hebt en wat je nodig hebt

| Onderdeel | Stand |
|---|---|
| App-ID | `nl.derondeengineering.boodschap` (na de eerste publicatie niet meer te wijzigen) |
| Apple Developer-account | Heb je, als individu. In de App Store staat Nick de Ronde als verkoper. |
| Google Play Console | Organisatie-account van De Ronde Engineering (eenmalig 25 USD). Verkoper in Google Play: De Ronde Engineering. De verplichte gesloten test van 14 dagen met 12 testers geldt niet voor een organisatie-account (§4). |
| Expo-account | Gratis, op expo.dev, voor EAS Build en Submit. De gratis laag heeft een beperkt aantal builds per maand en een wachtrij. |
| GitHub | Account `nickderonde`, repository `boodschap` (naam is vrij; controleer bij het aanmaken). Pages-URL: `https://nickderonde.github.io/boodschap/`. De repo begint schoon met één nieuwe commit (§1.1). |
| Contactadres | `info@derondeengineering.nl` moet bereikbaar zijn: stores en gebruikers sturen er berichten heen. |
| Licentie | MIT, auteursrechthouder Nick de Ronde. |
| Android-emulator | Op je Mac, voor schermafbeeldingen. |
| DSA-gegevens | Je dient in als handelaar (EU): houd je adres, telefoonnummer en e-mailadres klaar; ze worden openbaar getoond (§3 stap 6 en §4.1). |
| Documenten voor verificatie | Voor Apple een document dat naam en adres bevestigt; voor Google een D-U-N-S-nummer, identiteitsbewijs, organisatiedocument en een website van De Ronde Engineering (§4.1). |

Privacybeleid en storevermeldingen noemen alleen "De Ronde Engineering (Nick de Ronde), info@derondeengineering.nl". Zonder adres of KvK-nummer; je adres en telefoonnummer staan alleen op de productpagina's door de handelaarsstatus (B-18).

## 1. Voorbereiding in de repo (Engineer, jij keurt goed)

Elk onderdeel is een eis in REQUIREMENTS sectie 6b:
1. Configuratie: app-ID, naam, slug, schema, versiebeheer, permissies (ST-01, 02, 03, 05, 10).
2. Icoon, opstartscherm, schermafbeeldingen (ST-04, 09).
3. Privacybeleid en supportpagina in NL en EN op GitHub Pages, links in de app (ST-06, 07).
4. Storeteksten NL en EN (ST-08) en de documenten in `docs/store/` (ST-11, 12, 13, 19).
5. Opschonen en publiek maken van de repository volgens §1.1 (ST-14, ST-15). Alle documenten in `docs/` gaan mee.
6. Controle van de naam BOODSCHAP!: beschikbaarheid in App Store Connect en Play Console, en een zoekactie in het Benelux-merkenregister (BOIP) (ST-02).

### 1.1 De publieke repository met een schone start (B-15, B-16)

Doel: één nieuwe eerste commit van de opgeschoonde stand, geschreven met je GitHub-noreply-adres, zonder de lokale historie (persoonlijk e-mailadres en lokale paden). De Engineer controleert de opdrachten en levert ze als script of vaste volgorde.
1. **Noreply-adres opzoeken:** GitHub, Settings, Emails: vink "Keep my email addresses private" aan en noteer het adres van de vorm `<getal>+nickderonde@users.noreply.github.com`. Zet ook "Block command line pushes that expose my email" aan.
2. **Lokale historie veiligstellen (niet publiceren):** maak in de huidige repo een branch `lokale-historie` op de huidige stand en een back-up buiten de projectmap (`git bundle create ../boodschap-lokale-historie.bundle --all`). Deze branch en deze bundle gaan nooit naar GitHub.
3. **Schone branch:** `git checkout --orphan publiek` (nieuwe branch zonder voorgeschiedenis). Verwijder uit de werkmap en uit `docs/` alle lokale paden (zoals `/Users/<naam>/`) en andere interne zaken; de projectdocumenten blijven. Draai `npm run check:secrets` tot het schoon is (werkmap en historie van deze branch).
4. **Eén commit:** stel `user.name` ("Nick de Ronde") en `user.email` (het noreply-adres) in voor deze repo en commit alles met één bericht (bijvoorbeeld "BOODSCHAP! 1.0"). Controleer met `git log --format='%an <%ae> | %cn <%ce>'` dat auteur en committer het noreply-adres zijn.
5. **Publiceren:** maak de lege repository `nickderonde/boodschap` op GitHub, voeg hem toe als `origin` en push alleen deze branch als `main`: `git push -u origin publiek:main`. Gebruik nooit `git push --all`, `--mirror` of `--tags`, want dan gaat de lokale historie mee. Controleer op GitHub dat er één commit en één branch staat.
6. **Daarna:** zet in de repo-instellingen Secret scanning en Push protection aan, en Pages op "GitHub Actions" (§7).

## 2. Bouwen met EAS

Op je Mac, in de projectmap:
1. `npx eas-cli login` (Expo-account) en `npx eas-cli init` (maakt het EAS-project; de slug moet dan al `boodschap` zijn).
2. `npx eas-cli build:configure`: maakt `eas.json`. Het production-profiel krijgt automatisch ophogen van het buildnummer (ST-03).
3. Eerst een testbuild: iOS via TestFlight (intern) of intern verspreiden, Android als apk (previewprofiel) voor de emulator en je eigen toestel. Voer de rooktest uit (ST-16): H-01..H-07, deellink, camera, herstart.
4. Daarna de production-builds: `npx eas-cli build --platform ios --profile production` en idem voor `android`. EAS beheert de certificaten en de Android-keystore voor je. Maak een back-up via `npx eas-cli credentials` en bewaar die veilig: zonder de keystore kun je de app niet meer bijwerken zonder hulp van Google, ook als je later van machine wisselt.

## 3. Apple: App Store Connect

1. Maak een app-record: platform iOS, naam BOODSCHAP! (of de terugval uit ST-02 als de naam bezet is), primaire taal Nederlands, bundle ID `nl.derondeengineering.boodschap`.
2. Vul de metagegevens uit `store/nl` en `store/en`: ondertitel, beschrijving, trefwoorden, categorie Food & Drink, support-URL, privacybeleid-URL, copyright ("<jaar> Nick de Ronde"). De Engelse beschrijving zegt eerlijk dat de interface Nederlands is.
3. Privacy: "Gegevens niet verzameld", volgens `docs/store/privacy-labels.md`.
4. Versleuteling: beantwoord de exportvragen volgens `docs/store/export-compliance.md` (ST-12).
5. Leeftijdsclassificatie: vragenlijst volgens `docs/store/age-rating.md` (verwacht 4+).
4a. **Frankrijk uitsluiten (B-17):** Prijzen en beschikbaarheid, Landen en regio's: zet alle landen aan behalve Frankrijk. De exportregels voor Frankrijk vragen een verklaring bij ANSSI en bijbehorende documentatie voor Apple; die volgt later. Frankrijk voeg je daarna weer toe zonder nieuwe build.
6. **Handelaar (EU, DSA), B-18:** je dient in als **handelaar**. Je adres, telefoonnummer en e-mailadres worden openbaar getoond op de productpagina in de App Store in de EU. Vul in bij: App Store Connect, Business, tabblad Agreements, sectie Compliance, Digital Services Act (de status per app staat bij Apps, App Information, App Store Regulations and Permits, Digital Services Act).
   - Individu: adres (of postbusnummer, dan zijn extra documenten nodig), telefoonnummer met landcode (+31...), e-mailadres (`info@derondeengineering.nl`), en de verklaring dat je producten voldoen aan EU-recht. Laat optionele velden leeg tenzij het formulier ze eist.
   - **Apple verifieert** het e-mailadres en het telefoonnummer (tweestapsverificatie met een code) en controleert naam en adres aan de hand van een geüpload document (een bedrijfs- of juridisch document dat naam en adres bevestigt); reken op extra doorlooptijd en houd dat document klaar. Gebruik een adres en nummer waarvan je het vindt kunnen dat ze openbaar zijn.
   - Leg de ingevulde keuze vast in `docs/store/uitgever.md`.
   - **Nederlands recht (aandachtspunt, geen juridisch advies):** als aanbieder van een dienst van de informatiesamenleving moet je volgens art. 3:15d BW naam, vestigingsadres, e-mailadres en, indien ingeschreven, het KvK-nummer eenvoudig vindbaar maken. Advies: zet die gegevens op de supportpagina onder "Over de uitgever", of verwijs daar naar de handelaarsgegevens in de stores. Het privacybeleid blijft bij naam en e-mailadres. Jij beslist (open vraag O-1); tot je antwoord staan adres en KvK-nummer niet op de website.
7. Upload de schermafbeeldingen (ST-09) en voeg reviewnotities toe uit `store/*/review-notes` (geen inlog nodig; delen is optioneel).
8. Upload de build: `npx eas-cli submit --platform ios` (vraagt je Apple-gegevens en het ASC-app-ID), kies de build bij de versie en dien in voor beoordeling. Verwacht doorgaans één tot enkele dagen.
9. Bij afwijzing: lees de reden, meld ze aan de Projectleider, en we passen aan.

## 4. Google: Play Console (organisatie-account)

Het Google-account is een organisatie-account (De Ronde Engineering). Voor organisatie-accounts geldt de verplichte gesloten test (14 dagen, 12 testers) voor persoonlijke accounts niet. Een interne test is optioneel maar aanbevolen (§4.3).

### 4.1 Account en verificatie (eenmalig; begin hier vroeg, de doorlooptijd is dagen tot weken)

Controle tegen de actuele Google-documentatie (2026-10-07). Dit zijn de stappen en wat er nog bij komt kijken:
1. **D-U-N-S-nummer:** vereist voor een organisatie-account (gratis aan te vragen bij Dun & Bradstreet). De juridische naam en het adres in het D-U-N-S-nummer moeten exact overeenkomen met wat je bij Google invult. Aanvragen kan een paar dagen tot weken duren; begin hier eerst mee als je het nog niet hebt.
2. **Account aanmaken** met het Google-account dat de eigenaar wordt; betaal de eenmalige 25 USD. Kies organisatie (geen persoon), en vul juridische naam, adres, organisatietype en omvang, telefoonnummer en website in.
3. **Documenten:** een officieel identiteitsbewijs van jou en een officieel document van de organisatie (bijvoorbeeld een uittreksel van de Kamer van Koophandel; controleer wat Google accepteert).
4. **Website:** sinds februari 2024 moeten nieuwe organisatie-accounts ook de website verifiëren. De website van De Ronde Engineering moet bestaan en jouw organisatie weergeven; volg de verificatiestappen in de Play Console (meestal via een bewijs van beheer, bijvoorbeeld Search Console of een DNS-record). Heb je nog geen website, maak dan eerst een eenvoudige.
5. **Contactgegevens:** het e-mailadres (zes-cijferige code; wordt door Google intern gebruikt, niet openbaar) en een ontwikkelaarstelefoonnummer dat in Google Play wordt getoond, in internationale vorm (bijvoorbeeld +31612345678). De telefoonverificatie kan pas ná de identiteits- en websiteverificatie.
6. **Handelaar (DSA), B-18:** je dient in als handelaar; je adres, telefoonnummer en e-mailadres worden openbaar getoond op de Play-pagina's in de EU. Gebruik dezelfde handelaarsgegevens als bij Apple, zodat beide stores naar dezelfde gegevens verwijzen (bij Google is De Ronde Engineering de uitgever, bij Apple Nick de Ronde; zie ook het aandachtspunt over art. 3:15d BW in §3 stap 6). Vul ze in bij Play Console, Instellingen (Settings), Ontwikkelaarsaccount (Developer account), Accountgegevens/Contactgegevens (de menunaam kan wijzigen; zoek naar "Trader status" of "Developer page"). Google verifieert de gegevens (onder meer het telefoonnummer met een code en, indien gevraagd, documenten die naam en adres bevestigen).
7. Reken op verificatiedeadlines: Google geeft ongeveer een maand om de verificatie af te ronden en verlengt niet altijd. Houd je aan de deadline in je account.

### 4.2 App aanmaken en invullen

1. Maak de app aan: naam BOODSCHAP!, taal Nederlands, app (geen spel), gratis.
2. Vul het verplichte dashboard in: Data Safety ("geen gegevens verzameld of gedeeld", volgens `docs/store/privacy-labels.md`), contentclassificatie (IARC), doelgroep (volwassenen, niet gericht op kinderen), advertenties (nee), privacybeleid-URL, contactadres `info@derondeengineering.nl`, categorie Food & Drink, storevermelding NL en EN, schermafbeeldingen (uit de emulator), icoon 512x512 en feature graphic 1024x500.
3. De eerste versie upload je met de hand als AAB-bestand in de Play Console (`npx eas-cli build --platform android --profile production`, download het `.aab`). Daarna kan `npx eas-cli submit --platform android` volgende versies versturen, met een service-account-sleutel van Google. Zet app-ondertekening door Google aan (Play App Signing, standaard).

### 4.3 Interne test (aanbevolen en de route voor de release-rooktest van Android)

Voordat je naar productie gaat: een release in de testtrack "Intern testen" (maximaal 100 testers, zonder beoordeling, direct beschikbaar). Maak een e-maillijst met jezelf en één of twee anderen met een Android-toestel, rol het AAB uit naar die track, en stuur de opt-in-link. Gebruik deze interne track als eerste route voor de release-rooktest ST-16 op Android (liever dan alleen een apk). Herhaal er ST-16 mee (H-01..H-07, deellink, camera, herstart) met de door Google ondertekende build (ST-23).

### 4.4 Productie

1. Controleer in de Play Console, Dashboard, "Release your app" of er een verplichte gesloten test wordt getoond. Voor een organisatie-account hoort dat niet; staat het er toch, meld het aan de Projectleider vóór je verder gaat (dan blijkt het account als persoonlijk te zijn aangemerkt).
2. Maak een productie-release (eventueel gefaseerd uitgerold) en dien in voor beoordeling.

## 5. Na publicatie

- Zet de store-links in de GitHub-README, op de GitHub Pages-pagina en in de deeltekst (ST-10, ST-21).
- Controleer `info@derondeengineering.nl` regelmatig; reageer op reviews en vragen.
- Nieuwe versie: het buildnummer gaat vanzelf omhoog; wijzig het marketingnummer als dat nodig is, bouw, test (ST-16 in het klein), dien in. Wijzigt er iets aan data of privacy, werk dan eerst het privacybeleid en `docs/store/privacy-labels.md` bij.
- Het App-ID `nl.derondeengineering.boodschap` kan na de eerste publicatie niet meer veranderen.

## 6. Indicatieve tijdlijn

| Stap | Doorlooptijd |
|---|---|
| Voorbereiding in de repo (§1) | enkele dagen tot een week, afhankelijk van icoon, teksten en schermafbeeldingen |
| EAS-builds en rooktest (§2) | een dag of twee |
| Apple-beoordeling | meestal 1 tot 3 dagen |
| Google-organisatieverificatie (D-U-N-S, documenten, website, telefoon) | dagen tot weken; begin eerst hiermee |
| Google-beoordeling van de eerste release | meestal enkele dagen |
| Apple-handelaarsverificatie (telefoon, adres, document) | enkele dagen, soms langer |

## 7. Controle Engineer (2026-10-07)

Gecontroleerd tegen de actuele documentatie van Expo, Apple en Google. Aanvullingen en correcties op de stappen hierboven:

- **Stap 2.2 vervalt:** `eas.json` staat al in de repo (profielen `preview` en `production`; `appVersionSource: remote`, `autoIncrement` in production). Draai dus níet `eas build:configure`. Een `development`-profiel is er bewust niet (geen `expo-dev-client`, review CR-03 K-2); voor testen gebruik je Expo Go of `preview`.
- **Eerste keer:** `npx eas-cli init` koppelt het project (slug `boodschap`). Buildnummers beginnen bij 1; `eas build:version:set` is alleen nodig als er al een build in een store staat.
- **Apple-schermafbeeldingen:** Apple accepteert nu de iPhone 16-maat **1179x2556** (iPhone met Dynamic Island, middel) en die klasse is zelfs verplicht als er geen 6,9"-beelden zijn. `npm run make:screenshots` maakt beide (1320x2868 en 1179x2556) en de Google-maat (1080x1920). Zie `docs/store/demo-data.md`.
- **Versleuteling:** de sleutel in Info.plist heet `ITSAppUsesNonExemptEncryption` (staat op `true` via `app.json`). Antwoorden en de vraag over Frankrijk: `docs/store/export-compliance.md`.
- **Bestanden:** iconen en opstartscherm `assets/images/` (opnieuw maken: `npm run make:icons`), Play-icoon en feature graphic `store/graphics/`, storeteksten `store/nl` en `store/en` (met limieten in `store/listing.json`), privacylabels `docs/store/privacy-labels.md`, leeftijd `docs/store/age-rating.md`, uitgever en DSA-keuze `docs/store/uitgever.md`.
- **Website:** de map `site/` wordt via `.github/workflows/pages.yml` gepubliceerd. In GitHub: Settings → Pages → Source: "GitHub Actions". Adressen: `https://nickderonde.github.io/boodschap/privacy/` (NL), `/en/privacy/` (EN), `/support/`, `/en/support/`.
- **(Vervangen door §1.1, besluit B-15)** Oorspronkelijke opmerking van de Engineer over de repo: `npm run check:secrets` moet schoon zijn. Nu niet schoon: (1) in de git-historie staan in alle commits je persoonlijke e-mailadres als auteur en in de eerste commit lokale paden; (2) in `docs/APPROVALS.md` en `docs/REQUIREMENTS.md` staat nog een lokaal pad. Advies: begin de publieke repo met een nieuwe, schone eerste commit (auteur bijvoorbeeld "Nick de Ronde <info@derondeengineering.nl>" of je GitHub-noreply-adres) en beoordeel vooraf welke documenten in `docs/` publiek mogen (zoals `BRIEF.md` en de reviews).
