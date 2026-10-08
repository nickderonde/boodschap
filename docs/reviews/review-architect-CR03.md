# Review Architect — CR-03: publicatie in de App Store en Google Play

- **Reviewer:** Architect
- **Datum:** 2026-10-07
- **Getoetst tegen:** REQUIREMENTS v0.6.1 §6b (ST-01..ST-22, B-06..B-14), `docs/PUBLICEREN.md`, ARCHITECTURE v1.0.2 en de werkmap (`git status`/`git diff`: `app.json`, `eas.json`, `plugins/`, `site/`, `store/`, `docs/store/`, `app/licenties.tsx`, `src/ui/links.ts`, sharecode, D-38..D-43).
- **Eigen controle:**
  - `npm test`: 480 geslaagd, 2 gefaald (de ET-F14-1/ET-F13-2 die de Engineer noemt; die verwachten nog `bootschap://` in de deeltekst, D-43);
  - `node scripts/check-secrets.mjs`: werkmap 2 treffers, historie 11 (zie §3);
  - bundelversies in `node_modules/expo/bundledNativeModules.json`;
  - de bron van `ReanimatedSwipeable` en `babel-preset-expo`.
- **Meegenomen besluiten van Nick (2026-10-07):**
  - **GitHub:** een schone root-commit met het noreply-adres als auteur; de lokale historie blijft in een branch.
  - **Documenten:** alle docs gaan publiek, opgeschoond.
  - **App Store:** eerst zonder Frankrijk.
  - **DSA:** indienen als **handelaar**.
  - **Google Play:** een **organisatie-account** (De Ronde Engineering), dus geen gesloten test van 14 dagen.

## Status: AKKOORD MET OPMERKINGEN

De store-configuratie is technisch goed en minimaal. De privacyclaims kloppen met de code: het enige netwerkverkeer is wss naar de relays, en de links in de app worden alleen in de browser geopend. De keuze `usesNonExemptEncryption: true` is juist.

Er zijn vier **belangrijke** bevindingen (C-1..C-4). Ze moeten opgelost zijn vóór de eerste indiening; geen ervan blokkeert de bouw. CR-01/02 S-1 is opgelost (zie §5).

## 1. Controlepunten

| Punt | Oordeel |
|---|---|
| `app.json`: ID's, naam, versie | ST-01/02/03 correct: `nl.derondeengineering.boodschap` op beide platformen, `BOODSCHAP!`, slug `boodschap`, versie `1.0.0`. |
| Rechten (ST-05, D-39) | **Goed.** Android: `permissions` CAMERA + INTERNET, plus een uitgebreide `blockedPermissions` (AD_ID, RECORD_AUDIO, opslag, locatie). netinfo voegt via de manifest-merge de normale rechten `ACCESS_NETWORK_STATE`/`ACCESS_WIFI_STATE` toe. Die zijn nodig en hebben geen dialoog; noem ze in ST-05 als toegestaan. `microphonePermission: false`, `recordAudioAndroid: false`, `faceIDPermission: false`. De plugin `withOptionalCamera` zet de camera-features op `required=false`; hij is idempotent en heeft een eenvoudige, correcte implementatie. `supportsTablet: false`. `allowBackup: false`. |
| Schema's (ST-10, D-43) | **Goed.** `scheme: ["boodschap","bootschap"]`. Nieuwe links gebruiken `boodschap://join#…`. De parser leest elke `…://join#<code>` en `BS1-…`, en `+native-intent` herkent beide schema's. De cryptografische labels `bootschap/v1` en de databasenaam blijven terecht ongewijzigd: anders zijn bestaande lijsten en codes onbruikbaar. **Risico (handmatig, ST-10):** WhatsApp en veel andere chat-apps maken een eigen schema (`boodschap://`) **niet klikbaar**; alleen http(s) wordt een link. De tekstcode moet dus altijd mee (dat gebeurt), en voor echt klikbare links zijn universele links nodig (Could, ST-10). Verwacht dit gedrag in de rooktest en noem het in de reviewnotities. |
| Lokalisatie (ST-22) | `locales/nl.json` en `en.json` met `NSCameraUsageDescription` en `CFBundleDisplayName`. `CFBundleDevelopmentRegion: nl` en `CFBundleLocalizations: [nl, en]`. Goed. |
| `usesNonExemptEncryption: true` (ST-12, D-38) | **Juist, niet op `false` zetten.** `false` mag alleen als de app geen versleuteling gebruikt of alleen vrijgestelde (OS-versleuteling zoals HTTPS, alleen authenticatie, enz.). BOODSCHAP! gebruikt eigen XChaCha20-Poly1305 voor de vertrouwelijkheid van gebruikersinhoud, en dat is niet vrijgesteld. Met standaardalgoritmen volstaat in App Store Connect "standaard-encryptie", zonder CCATS. Met het besluit **zonder Frankrijk** vervalt de Franse verklaring. Zet na de eerste goedkeuring `ITSEncryptionExportComplianceCode`. De EAR-analyse in `export-compliance.md` is redelijk (vervallen melding voor openbare broncode met standaardcrypto sinds 2021); de juridische bevestiging ligt bij Nick. |
| `eas.json` (ST-03, D-42) | `appVersionSource: remote` en `production.autoIncrement: true` zijn goed. `production.android.buildType: app-bundle` is goed. **Opmerking (K-2):** het profiel `development` heeft `developmentClient: true` zonder `expo-dev-client`. Haal het profiel weg, of installeer de dev-client, anders loopt `eas build --profile development` vast of levert hij een onbruikbare build. Het eerste Android-AAB moet bij Google handmatig worden geüpload voordat `eas submit` met een serviceaccount werkt. Zet dat in PUBLICEREN §4. |
| `expo-splash-screen`, `expo-system-ui` (D-40) | **In orde.** Beide staan in de SDK 57-bundel (`~57.0.9`, `~57.0.4`) en zitten in Expo Go. In Expo Go worden de config-plugins genegeerd; dat is onschadelijk. `expo-system-ui` is in een store-build nodig, anders werkt `userInterfaceStyle: automatic` niet op Android (UX-08). `@resvg/resvg-js` is alleen een devDependency; MPL-2.0 is toegestaan. |
| Privacybeleid en code (ST-06) | Klopt op alle tien punten met de code. Lokaal: lijsten, historie, categoriekeuzes en relays in SQLite; sleutels in Keychain/Keystore. Netwerk: alleen relays. Relays zien pubkeys per lijst en installatie, tijdstippen, groottes en het IP-adres. Relays bewaren gegevens buiten ons bereik. De deelcode is een geheim. De iOS-back-up wordt eerlijk genoemd. **Twee aanvullingen:** C-1 (crash- en statistiekgegevens van Apple/Google) en C-4 (handelaar). |
| Privacylabels en Data Safety (ST-11) | **"Niet verzameld" / "geen gegevens verzameld" is verdedigbaar.** De uitgever ontvangt niets. Relays zijn geen "third-party partners" met code in de app. De inhoud is E2E-versleuteld. De terugval die in het document staat (IP onder "Other data, not linked, App Functionality") is goed. Leg in het document ook vast: (a) de crashlogs en App Analytics van Apple en de Android vitals van Google worden door het platform verzameld, niet door de app, en vallen niet onder de opgave van de ontwikkelaar; (b) een tik op de privacy-, support- of broncodelink opent een externe site (GitHub) in de browser, en dat is een gebruikersactie. |
| Licentiescherm (ST-07, D-41) | Goed. Het toont alle 748 productiepakketten met SPDX en copyrightregels, plus één volledige tekst per licentiesoort. Een test faalt bij een verouderd bestand. **K-3:** Apache-2.0 vraagt ook om de inhoud van een `NOTICE`-bestand van het pakket, als dat bestaat. Laat `gen-licenses` die meenemen. |
| Storeteksten (ST-08) | Waar en toetsbaar. Geen concurrentnamen, geen "beste"-claims. De Engelse tekst noemt de Nederlandse interface. De uitleg over relays en E2E is toegestaan; er is geen regel van Apple of Google die het noemen van Nostr verbiedt. Gebruik in App Store Connect de **Engelse** reviewnotities (reviewers werken in het Engels). Vermeld daar ook dat er geen publieke door gebruikers gemaakte inhoud is (Guideline 1.2 is niet van toepassing). |

## 2. Risico's bij de beoordeling door Apple en Google

| Risico | Inschatting | Advies |
|---|---|---|
| Apple 4.2 (minimale functionaliteit) / 4.3 (spam, veel lijst-apps) | Laag: een eigen native app met offline-first, categorieën, suggesties, delen en undo | Noem in de reviewnotities wat de app onderscheidt: offline, E2E-delen zonder account. |
| Apple 2.1 (volledigheid): sync is niet met één toestel te testen | Middel | De reviewnotities leggen het uit. Bied eventueel aan dat de reviewer een kort screencast-filmpje van de sync krijgt (via de notities of een link). |
| Apple 5.1.1 / privacylabel met relays van derden | Laag tot middel | De onderbouwing ligt vast, met een terugval. |
| Interface alleen Nederlands in alle landen | Laag (geen afwijzingsgrond) | De Engelse vermelding zegt het eerlijk. Overweeg beschikbaarheid eerst in NL/BE plus de rest van de EU. Frankrijk is al uitgesloten. |
| Google Data Safety met E2E | Laag | Zoals vastgelegd; controleer de verwezen helptekst bij het invullen. |
| Een eigen schema niet klikbaar in chat-apps | Zeker (geen afwijzing) | De tekstcode altijd meesturen. Universele links later. |

## 3. Bevindingen

### Belangrijk (vóór de eerste indiening)

**C-1. Het privacybeleid zegt "wij ontvangen geen gegevens", maar via Apple en Google krijgt de uitgever wél crashrapporten en statistieken.**
`site/privacy/index.html` (punt 3), `site/en/privacy/index.html`

App Store Connect geeft crashlogs van gebruikers die in iOS "Deel met app-ontwikkelaars" aanzetten, plus geaggregeerde App Analytics. De Play Console geeft Android vitals (crashes en ANR's) en installatiestatistieken.
- De app zelf verzamelt niets, maar de zin "Wij ontvangen dus geen gegevens over jou of je gebruik van de app" is daardoor te absoluut.
- **Fix:** voeg één alinea toe, bijvoorbeeld: "Apple en Google kunnen ons, als je dat in je toestelinstellingen toestaat, anonieme crashrapporten en geaggregeerde statistieken (zoals aantallen installaties) geven. Die bevatten geen inhoud van je lijsten en niets waarmee we je kunnen herkennen."
- Leg hetzelfde vast in `privacy-labels.md`; de labels blijven "niet verzameld" (dit zijn platformgegevens).
- **Test:** breid de ST-06-test uit met dit onderwerp.

**C-2. Een iOS-back-up of -migratie neemt de identiteit van het toestel mee.** Dan kunnen twee toestellen tegelijk dezelfde apparaat-ID en dezelfde Nostr-sleutels gebruiken.
`src/storage/ExpoSecureKeyStore.ts:5` (`AFTER_FIRST_UNLOCK`, niet `…THIS_DEVICE_ONLY`), `meta.device_id` in SQLite

Bij herstel uit een iCloud-back-up of bij "Snel starten" naar een nieuwe iPhone gaan de database (met `device_id`, de HLC-klok en de versies per slot) én de Keychain-items mee. Blijft de oude iPhone in gebruik (doorgegeven of als tweede toestel), dan gebeurt het volgende:
- **Beide negeren elkaar.** Ze gebruiken dezelfde publieke sleutel per lijst, dus elk ziet de events van de ander als eigen events en negeert ze (D-17).
- **Slot wordt gedeeld.** Ze overschrijven elkaars vervangbare slot.
- **Dubbele node-ID's.** Ze stempelen met dezelfde node-ID, terwijl het ontwerp ervan uitgaat dat elke stempel uniek is (§5.2).
- **Gevolg:** gegevens kunnen tussen die twee toestellen niet meer synchroniseren, behalve via een derde lid.

Dat ontstaat pas met de store-versie, omdat Expo Go een andere app is. Het is ook realistisch, want mensen wisselen van telefoon.

**Fix (herstel herkennen):**
- Bewaar bij de eerste start een `install_id` zowel in `meta` als in de SecureStore met `keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY` (dat item gaat niet mee bij back-up of migratie).
- Ontbreekt het item bij het opstarten of wijkt het af, dan is de app hersteld. Dan volgt:
  - een nieuwe `device_id` (HLC-node);
  - `rotateIdentity` voor elke gedeelde lijst (een nieuwe Nostr-sleutel, versies per slot op 0);
  - een nieuwe `install_id`.
- De lijsten en lijstgeheimen blijven bewaard; het hersteld toestel synchroniseert daarna als nieuw lid.
- Android heeft `allowBackup: false`, dus daar speelt dit niet.

**Test:** simuleer een herstel (dezelfde database, een KeyStore zonder het device-only-item) → een nieuwe `device_id` en nieuwe pubkeys, en twee toestellen met die gekopieerde staat convergeren via de relay.

**Documentatie:** pas de privacytekst over de iOS-back-up aan ("na herstel koppelt de app zich als nieuw toestel").

**C-3. Publicatie op GitHub volgens het besluit van Nick (schone root-commit).**
`scripts/check-secrets.mjs`, werkmap

- De historie (11 treffers: commit-e-mail en `/Users/<naam>/` in oude commits) is opgelost met de **schone root-commit**, mits:
  - de lokale historie-branch **nooit** wordt gepusht (geen `git push --all` of `--mirror`; push alleen de nieuwe branch, en zet `push.default=current`);
  - de nieuwe commit het noreply-adres als auteur en committer heeft (`git -c user.email=<noreply> commit …`);
  - `check:secrets` daarna op de nieuwe branch (werkmap én historie) **0 treffers** geeft. Dat is de poort uit ST-15.
- **Werkmap, 2 treffers:** `docs/APPROVALS.md:28` en `docs/REQUIREMENTS.md:136` bevatten de letterlijke voorbeeldtekst `/Users/<naam>/…`. Laat de Projectleider die vervangen door `/Users/<naam>/…`.
- **Besluit "alle docs publiek":** dat kan. De reviews en het testrapport bevatten geen geheimen. Ze noemen wel de naam van Nick en interne werkafspraken; dat is akkoord volgens B-13. Ik heb mijn eigen documenten nagelopen: ze bevatten geen lokale paden meer.

**C-4. Handelaarsstatus (DSA): het privacybeleid mag bij naam en e-mail blijven, maar `uitgever.md`, PUBLICEREN en ST-19 moeten worden bijgewerkt, en er is een aandachtspunt voor de eigen website.**

- **Wat de stores tonen.** Als handelaar toont de store (Apple en Google) de handelaarsgegevens: adres, telefoon en e-mail. Die vult Nick in de consoles in. Bij Google is de uitgever nu de **organisatie** De Ronde Engineering en bij Apple (individueel account) Nick. Dat is consistent, mits beide naar dezelfde handelaarsgegevens verwijzen.
- **Privacybeleid.** De AVG (art. 13) vraagt "identiteit en contactgegevens" van de verwerkingsverantwoordelijke; naam plus e-mail voldoet daaraan. Er is **geen strijd** met de handelaarsstatus: de DSA-plicht wordt vervuld door wat de stores tonen.
- **Aandachtspunt.** Voor een handelaar die een "dienst van de informatiesamenleving" aanbiedt (de website op GitHub Pages en de app), vraagt het Nederlandse recht (art. 3:15d BW, uit de e-commercerichtlijn) dat naam, **vestigingsadres**, e-mail en, indien ingeschreven, het **KvK-nummer** eenvoudig te vinden zijn. Advies: zet deze gegevens op de **supportpagina** ("Over de uitgever"), of verwijs daar naar de handelaarsgegevens in de stores. Het privacybeleid blijft dan bij naam en e-mail. Dit is geen juridisch advies; Nick bevestigt het.
- **Aanpassen:** `docs/store/uitgever.md` (status "handelaar", wie wat invult) en PUBLICEREN §3 punt 6 en §4 (handelaar). De Projectleider past B-10, B-14 en ST-19 aan (adres en KvK op de supportpagina is een wijziging van B-10).

### Klein

**K-1. Google-organisatie-account.** De gesloten test van 14 dagen met 12 testers vervalt (ST-20, PUBLICEREN §4, de tijdlijn §6).
- Er zijn wel nodig: een D-U-N-S-nummer, verificatie van de organisatie en een website of contact.
- Gebruik toch eerst de **interne testtrack** voor de release-rooktest (ST-16).
- De ontwikkelaarsnaam in Google Play wordt "De Ronde Engineering". Maak de storetekst en het copyrightveld daarmee consistent; bij Apple blijft het "Nick de Ronde".
- Laat de Projectleider ST-20 bijwerken en de Engineer PUBLICEREN §4.

**K-2.** In `eas.json` staat het profiel `development` zonder `expo-dev-client`: weghalen of de dev-client installeren (D-42).

**K-3.** Neem in het licentiescherm ook de inhoud van `NOTICE`-bestanden van Apache-2.0-pakketten mee (D-41).

**K-4.** Na de eerste goedkeuring: `ITSEncryptionExportComplianceCode` in `app.json` zetten. Leg de keuze "zonder Frankrijk" vast in `export-compliance.md`.

**K-5.** In de Engelse reviewnotities vermelden dat er geen publieke door gebruikers gemaakte inhoud is, en dat een eigen schema in chat-apps niet klikbaar is (de tekstcode werkt altijd).

## 4. Afwijkingen D-38..D-43

| ID | Oordeel |
|---|---|
| D-38 (feitencorrecties: `ITSAppUsesNonExemptEncryption`, microfoon, screenshotformaten) | **Goedgekeurd.** De Projectleider past ST-05, ST-09 en ST-12 redactioneel aan. |
| D-39 (extra geblokkeerde rechten, optionele camera-plugin, netinfo-rechten) | **Goedgekeurd.** |
| D-40 (`expo-splash-screen`, `expo-system-ui`, `@resvg/resvg-js` voor de build) | **Goedgekeurd.** |
| D-41 (licentiescherm: één tekst per soort) | **Goedgekeurd**, met K-3. |
| D-42 (development-profiel zonder dev-client; `private: true`) | **Goedgekeurd**, met K-2. |
| D-43 (schema `boodschap://`, domeinlabels ongewijzigd) | **Goedgekeurd.** De Eindtester werkt ET-F14-1 en ET-F13-2 bij. |

## 5. CR-01/02 S-1: hercontrole
`SwipeRow.tsx` meet nu de **vingerafstand** met een eigen Pan-waarnemer die gelijktijdig met de Pan van ReanimatedSwipeable loopt (`onEnd` met `translationX`; telt de al zichtbare actie mee als de rij open stond). Daarnaast staat `friction={1}` en is de drempel ≥ 50% van de rijbreedte. Beide oorzaken zijn daarmee weg. **S-1 is opgelost.** Het gevoel blijft [handmatig] in de release-rooktest.

---

## 6. Hercontrole C-1, C-2 en C-4 (2026-10-07)

Gebaseerd op `git diff`, D-44, D-45 en `test/integration/restore.test.ts`. Ik heb ook de iOS-bron van `expo-secure-store` gelezen (`SecureStoreModule.swift`).

**Status: AKKOORD MET ÉÉN BELANGRIJKE BEVINDING (R-1).** R-1 moet opgelost zijn vóór de eerste indiening.

### C-2: `install_id` (sync-kern)

| Punt | Oordeel |
|---|---|
| `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` (D-44) | **Goedgekeurd.** Het item gaat niet mee met een back-up of migratie, net als met `WHEN_UNLOCKED_…`. Het is wel leesbaar na de eerste ontgrendeling, net als de andere sleutels (§6.1). Gecontroleerd in de bron: `get` zoekt zonder `kSecAttrAccessible` in de query, dus lezen met de standaardopties vindt ook het device-only-item. Er is dus geen vals "hersteld" door een verschil in toegankelijkheid. Aandachtspunt: `set` op een bestaand item past alleen de waarde aan, niet de toegankelijkheid. Dat is geen probleem, omdat `install_id` altijd met `deviceOnly` wordt geschreven. |
| Volgorde van herstel | **Correct en vóór de sync**: `checkInstallation` draait in `init()` vóór de `HlcClock` (met de nieuwe node) en vóór `startSync`. Er wordt dus nooit met de oude identiteit gepubliceerd. De stappen zijn: (1) `rotateIdentity` per gedeelde lijst: nieuwe sleutel, versies 0, `last_event_*` ingetrokken; (2) één transactie met `device_id` en `install_id`; (3) de KeyStore. Een onderbreking halverwege leidt bij de volgende start tot nog een rotatie, en die is onschadelijk. |
| Dataverlies of dubbele publicatie | **Geen.** Items, lijstgeheimen en `pending_changes` blijven bewaard en worden onder de nieuwe sleutel gepubliceerd. Het oude slot hoort bij het origineel. De oude eigen pubkey blijft in `members`, zodat de kopie de events van het origineel als vreemd event ontvangt en merget (D-17 blijft correct). |
| KeyStore tijdelijk niet leesbaar | **Goed.** Bij een fout (bijvoorbeeld `errSecInteractionNotAllowed` vóór de eerste ontgrendeling) slaat de app de controle over (`install.check-skipped`), zonder rotatie. Een database zonder `install_id` (van vóór §19) legt hem alleen vast. **K-6:** bij een nieuwe installatie schrijft `newInstallId` eerst de database en dan de KeyStore. Een kill daartussen geeft bij de volgende start eenmalig een vals "hersteld". Dat is onschadelijk, maar kan voorkomen worden door eerst de KeyStore te schrijven. Gooit `keys.set` structureel een fout, dan faalt `init()` (startfout met "Opnieuw proberen"), en na een herstel volgt bij elke start opnieuw een rotatie. Vang die fout op en log hem, en roteer niet opnieuw zolang de database al een nieuwe `device_id` heeft gekregen. |
| Bewijzen de tests het herstel? | Grotendeels. `restore.test.ts` bewijst: (a) een gewone herstart en een installatie van vóór §19 houden hun identiteit; (b) een kopie krijgt een nieuwe device-ID en sleutel, de lijsten blijven, en er wordt niets dubbel of met de oude sleutel gepubliceerd; (c) origineel en kopie convergeren onderling en met B. **Niet bewezen:** dat de kopie geen ongeldige gegevens in zijn eigen sync-tabellen zet (R-1). |

**R-1 (belangrijk). Herstel zonder transport schrijft een lege pubkey in `members`, en die komt in het `authors`-filter van de REQ.**
`src/service/BootschapApp.ts:997-1007` (`rotateIdentity`) samen met `newIdentity()` en `checkInstallation`

- **Waar het ontstaat.** `checkInstallation` draait in `init()` vóórdat de transport bestaat. Zonder transport geeft `newIdentity()` `{ id: '', secret }` (D-05), en `rotateIdentity` doet dan `setNostrPubkey(listId, '')` en `upsertMember(listId, '')`.
- **Wat `loadCrypto` wel en niet herstelt.** `loadCrypto` vult later de echte pubkey in, maar de lege rij in `members` blijft staan.
- **Gevolg voor het abonnement.** `NostrTransport.filters()` neemt die rij op in `authors: ['', …]`. Strfry-relays (alle vier de standaardrelays) weigeren een filter met een ongeldige hex-waarde. Het gevolg is `CLOSED` met een nieuwe poging elke 5 s, en de herstelde telefoon krijgt geen events binnen.
- **Waarom de tests groen zijn.** De hub en RelayCore accepteren een lege author.

**Fix:**
1. Maak de transport (`ensureTransport`, zonder te verbinden) vóór de herstelcontrole, zodat `rotateIdentity` een echte pubkey krijgt. Of: schrijf in `rotateIdentity` geen `members`- en pubkey-rij als `id` leeg is.
2. Defensief: laat `NostrTransport.filters()` alleen `authors` toe die voldoen aan `/^[0-9a-f]{64}$/`.
3. Ruim lege rijen in `members` op met een eenmalige migratie of bij `loadCrypto`.

**Test:**
- in `restore.test.ts`: geen lege of ongeldige pubkey in `members` en `lists.nostr_pubkey` van de kopie;
- RelayCore en WsTestRelay weigeren, net als strfry, een filter met ongeldige hex (`CLOSED`). Daarmee faalt de huidige code aantoonbaar.

### C-1: privacyalinea
**Goedgekeurd.** NL en EN zeggen nu dat de app zelf niets stuurt, maar dat Apple en Google, als de gebruiker dat toestaat, anonieme crashrapporten en geaggregeerde statistieken kunnen geven. Ook de herstelzin bij de iOS-back-up is correct. De privacylabels blijven "niet verzameld" (platformgegevens).

### C-4: uitgever met KvK, zonder adres (D-45)
**Goedgekeurd als besluit van Nick.** Naam, e-mail en KvK 61854735 staan op de support- en privacypagina (NL en EN), het adres alleen in de handelaarsgegevens van de stores. Er is geen strijd met de AVG of de DSA. Restrisico voor Nick (geen juridisch advies): art. 3:15d BW noemt ook het vestigingsadres. Een zin op de supportpagina als "Het vestigingsadres staat bij de handelaarsgegevens in de App Store en Google Play" maakt het vindbaar zonder het op de site te herhalen. De placeholder-poort in `check:secrets` en de Pages-workflow is goed.

### D-44 en D-45
**D-44 goedgekeurd** met R-1 en K-6. **D-45 goedgekeurd.**

---

## 7. Eindoordeel CR-03 (2026-10-07)

Gecontroleerd in de code: `BootschapApp.checkInstallation`/`newInstallId`/`writeInstallIdToStore`, `buildFilters` (`NostrTransport.ts`), migratie 2, `restore.test.ts` en D-46. De Engineer heeft R-1 ook live bevestigd: damus antwoordt op `authors: [""]` met `CLOSED … "filter item too small"`.

| Punt | Fix | Bewijs | Oordeel |
|---|---|---|---|
| R-1 | (1) Bij herstel komt eerst de transport, zonder te verbinden, zodat `rotateIdentity` een echte pubkey krijgt. (2) Zonder transport schrijft de app geen lege pubkey- of ledenrij meer. (3) `buildFilters` laat alleen `/^[0-9a-f]{64}$/` toe in `authors`. (4) Migratie 2 verwijdert lege en ongeldige ledenrijen en zet een ongeldige `nostr_pubkey` op NULL; `loadCrypto` vult die daarna aan. (5) De WS-test-relay weigert een ongeldig filter met `CLOSED`, net als strfry. | `restore.test.ts`: de kopie heeft alleen 64-hex-leden en een geldige eigen pubkey; migratie 2 ruimt `''` en `xyz` op. | **Correct.** Vier lagen: oorzaak weg, filter defensief, opruiming van bestaande data, en een test-relay zo streng als productie. |
| K-6 | Eerst de KeyStore, dan de database. Een schrijffout van de KeyStore is geen startfout (`install.keystore-failed`) en wordt gemarkeerd als `install_id_unsaved`. Een volgende start roteert dan niet, maar probeert opnieuw te schrijven. | `restore.test.ts` (K-6): drie herstarts zonder rotatie; daarna werkt de KeyStore weer en wordt de id alsnog vastgelegd. | **Correct.** |
| K-2, K-3, K-5, adresverwijzing | Zoals gemeld door de Engineer: geen development-profiel zonder dev-client, NOTICE-inhoud in het licentiescherm, Engelse reviewnotities, en een verwijzing naar de handelaarsgegevens op de supportpagina. | Config- en storetests. | Akkoord (niet regel voor regel nagelopen; dit raakt de sync-kern niet). |

**Restpunt (klein, R-2, geen blokkade):** `install_id_unsaved` staat in `meta` en gaat dus mee in een iOS-back-up. Faalde op het origineel het schrijven naar de KeyStore (zeldzaam), dan herkent een kopie uit die back-up zichzelf niet als herstel, en delen beide even de identiteit, tot het origineel zijn id wel kan opslaan. De kans is erg klein, want het vraagt een structurele Keychain-fout plus een herstel. Advies voor later: herken het herstel bij `install_id_unsaved` ook aan een tweede device-only merkteken, of roteer de identiteit van het origineel zodra het schrijven alsnog slaagt.

**Eindoordeel CR-03: AKKOORD.** Alle belangrijke bevindingen (C-1..C-4, R-1) en de kleine bevindingen (K-1 bij de Projectleider, K-2..K-6) zijn afgehandeld. D-38..D-46 zijn goedgekeurd. ARCHITECTURE §19 beschrijft het gedrag. Wat nog openstaat ligt buiten de Architect: de handmatige release-rooktest (ST-16), de beslissing en acties van Nick (indiening, formulieren, juridische bevestiging van export en uitgever), het eindakkoord van de Projectleider, en de update van ET-F14-1 en ET-F13-2 door de Eindtester.

---

## 8. Hercontrole R-2 (D-50) en `ascAppId` (commit `f4b666a`, 2026-10-08)

**Oordeel: AKKOORD.** Eén aandachtspunt voor Android (A-1), vóór de Android-release.

**Klopt de aanname over back-ups?**
- **Ja, voor iCloud- en computerback-ups.** `Library/Caches` (`Paths.cache`) zit niet in iCloud-back-ups en niet in back-ups via Finder of iTunes; dat is het gedocumenteerde iOS-gedrag.
- **Directe overdracht via "Snel starten"** volgt naar verwachting dezelfde regels, maar dat is niet te testen zonder twee toestellen. Neem het op als handmatige controle bij ST-16, wanneer Nick van toestel wisselt; het is geen blokkade.
- **Opruimen door iOS.** iOS kan Caches bij weinig opslag leegmaken terwijl de app niet draait. Dat geeft hooguit één extra rotatie per opruiming. Een rotatie is altijd veilig: een nieuwe sleutel en device-ID, en de data blijft (§19).

**Kan een vals "hersteld" tot een rotatielus leiden?**
**Nee.** Er zijn drie gevallen, telkens na een rotatie:
- het merkteken is geschreven → de volgende start ziet een gelijk merkteken en roteert niet;
- het merkteken kan niet worden geschreven → `install_marker_failed` → K-6-gedrag, geen rotatie;
- het merkteken kan niet worden gelezen → `undefined` → K-6-gedrag.

Een lus kan alleen ontstaan als iOS de cache vóór élke start opruimt; dat is geen realistisch scenario. Het merkteken speelt bovendien alleen mee in het K-6-pad (de KeyStore faalt structureel). In het normale pad wordt het niet eens gelezen.

**Android (A-1, aandachtspunt).** `allowBackup: false` zet alleen `android:allowBackup="false"`. Expo genereert **geen** `android:dataExtractionRules`. Volgens de Android-documentatie geldt voor apps met targetSdk ≥ 31 dat `allowBackup="false"` cloud-back-ups uitzet, maar dat de overdracht van toestel naar toestel (bij het instellen van een nieuwe telefoon) apart via `dataExtractionRules` wordt geregeld.
- **Het risico.** Een D2D-overdracht kan de SQLite-database en de versleutelde SharedPreferences van `expo-secure-store` meenemen, maar nooit de hardwaresleutels van de Android Keystore.
- **Gevolg op de kopie.** Op de kopie gooien de reads van de KeyStore dan een fout (ontsleutelen lukt niet). `checkInstallation` slaat de controle bij een fout over, dus de kopie roteert niet en houdt de device-ID van het origineel. De lijstgeheimen zijn daar ook niet meer leesbaar.

**Advies, vóór de Android-release (het blokkeert de iOS-indiening niet):**
- (a) een config-plugin met `android:dataExtractionRules`/`fullBackupContent` die alle domeinen uitsluit, voor zowel `cloud-backup` als `device-transfer`. Dan neemt de kopie niets mee en is het een schone installatie;
- (b) controleer in de gebouwde manifest (`expo prebuild` in een tijdelijke map) dat de regel erin staat;
- (c) optioneel: behandel op Android een **leesfout** van `install_id` als herstel. Een app zonder Direct Boot start op Android nooit vóór de ontgrendeling, dus daar betekent een leesfout geen vergrendeld toestel.

**Bewijzen de tests het?**
**Ja, voor de beslislogica.** In `restore.test.ts`:
- **R-2:** het origineel met een falende KeyStore plus merkteken blijft zichzelf; de kopie met een leeg merkteken roteert (`install.restored-unsaved`); alle drie convergeren.
- **D-50:** cache opgeruimd → één rotatie, daarna stabiel, zonder dataverlies; merkteken niet schrijfbaar → één rotatie, daarna nooit meer.
- **Grens:** de tests gebruiken een `MemoryDeviceMarker`. Dat iOS Caches echt buiten de back-up houdt, is platformgedrag en niet in Jest te bewijzen; dat valt onder de handmatige controle hierboven.
- **`ExpoCacheMarker`** gebruikt de nieuwe `File`/`Paths`-API van `expo-file-system` (SDK 57, in Expo Go). `exists`, `create`, `write` en `text` zijn correct gebruikt.

**`ascAppId` `6820509019`:** goed. Het is een publiek App Store Connect-ID en geen geheim. De test eist het exacte nummer. D-47(c) vervalt hiermee.

**D-50 goedgekeurd.** ARCHITECTURE v1.1.1 §19 is bijgewerkt.
