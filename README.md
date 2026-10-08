# BOODSCHAP!

Een gratis boodschappenlijst-app zonder advertenties, voor iOS en Android. Je kunt hem samen gebruiken.

- Alles werkt eerst op je eigen telefoon, ook zonder internet.
- Deel je een lijst, dan gaan wijzigingen end-to-end versleuteld naar de telefoon van de ander.
- Er is geen account, geen server van BOODSCHAP! en geen tracking.
- Open source (MIT). Website en privacybeleid: https://nickderonde.github.io/boodschap/

> **English summary.** BOODSCHAP! is a free, ad-free shared grocery list for iOS and Android, built with Expo/React Native. It works offline first and syncs lists end-to-end encrypted (XChaCha20-Poly1305) through public Nostr relays, without accounts or a server of its own. The app's interface and most documentation are in Dutch. Run it with `npm install` and `npx expo start` (Expo Go), test with `npm test`. Licensed under MIT; the name and icon are not (see `NOTICE`). Security issues: see `SECURITY.md`. Contributions: see `CONTRIBUTING.md`.

---

## 1. Wat heb je nodig?

| Wat | Waarom |
|---|---|
| Een Mac of pc met **Node.js 22.13 of nieuwer** (getest met Node 25) en npm 11 | Om de app te starten. Controleer met `node -v` en `npm -v`. |
| Twee telefoons met **Expo Go** (gratis, [App Store](https://apps.apple.com/app/expo-go/id982107779) / [Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent)) | Hierin draait BOODSCHAP! zonder dat je iets hoeft te bouwen. |
| Wifi | Computer en telefoons op hetzelfde netwerk (of gebruik de tunnel, zie hieronder). |

> **SDK-versie:** dit project gebruikt Expo SDK 57. Expo Go in de stores ondersteunt steeds één SDK-versie. Zegt Expo Go dat het project een andere SDK nodig heeft, voer dan `npx expo install expo@latest --fix` uit.
>
> **Geen ontwikkelaar?** Lukt het daarna nog niet, of verschijnen er foutmeldingen, voer dan verder niets uit en vraag hulp aan een ontwikkelaar. De regel hieronder is voor hen.
>
> **Voor ontwikkelaars:** werk bij zo'n upgrade ook de testketen bij, anders falen de tests. SDK 58 vraagt Jest 30: `jest@30`, `babel-jest@30`, `jest-expo` van de nieuwe SDK, `@react-native/jest-preset` van de nieuwe React Native-versie en `@types/jest@30`, met `react-test-renderer`/`@testing-library/react-native` volgens de peers van `jest-expo`. Draai daarna `npm run check:deps`, `npm run typecheck` en `npm test`. Zie `docs/ARCHITECTURE.md` §4.3.

## 2. Installeren

### Node.js (eenmalig)

BOODSCHAP! heeft **Node.js 22.13 of nieuwer** nodig. Getest met Node 25.

Controleer het in de app **Terminal** (te vinden via Spotlight: ⌘-spatie, typ "Terminal"):

```bash
node -v
```

- Zie je `v22.13` of hoger (bijvoorbeeld `v25.2.1`)? Dan ben je klaar met deze stap.
- Krijg je "command not found" of een lager nummer, installeer dan Node:
  1. Ga naar [nodejs.org](https://nodejs.org).
  2. Download de **LTS**-versie voor macOS.
  3. Open het `.pkg`-bestand en klik de installatie door.
  4. Sluit de Terminal en open hem opnieuw.

  Werk je met Homebrew, dan kan het ook met `brew install node`.

### De app installeren

Heb je de projectmap al op je computer? Dan is er geen GitHub of `git clone` nodig. Open de Terminal, typ `cd ` (met een spatie), sleep de projectmap naar het Terminal-venster en druk op Enter. Typ daarna:

```bash
npm install
```

Nog geen map? Haal hem dan op met `git clone https://github.com/nickderonde/boodschap.git` en ga erin met `cd boodschap`.

`npm install` haalt de onderdelen op en duurt de eerste keer een paar minuten. Meldingen als "npm warn deprecated" kun je **negeren**.

> **Nooit `npm audit fix` of `npm audit fix --force` uitvoeren.** `npm audit` geeft bij Expo-projecten vals alarm: het meldt tientallen "vulnerabilities" in hulpprogramma's die alleen op je computer draaien (Metro, Jest, de Expo-commando's). Die komen niet in de app op je telefoon en verwerken geen gegevens van buitenaf. Daarnaast herkent het de Expo-versie verkeerd: de "critical"-melding geldt voor Expo ouder dan SDK 48. `--force` zet Expo dan terug naar SDK 44 en maakt de app kapot. Daarom staat de controle uit in `.npmrc`. Is het toch gebeurd? Zet dan met `git checkout package.json package-lock.json` de goede versies terug, en voer daarna `rm -rf node_modules && npm install` uit.

## 3. Starten en testen op twee telefoons

1. Start de ontwikkelserver:
   ```bash
   npx expo start
   ```
   Er verschijnt een QR-code in de terminal. Is de QR-code afgebroken of onleesbaar, maak het Terminal-venster dan breder (of kleiner lettertype met ⌘ en -) totdat hij helemaal zichtbaar is.
2. **iPhone:** open de gewone Camera-app, richt hem op de QR-code en tik op de melding "Openen in Expo Go".
   **Android:** open Expo Go en kies "Scan QR code".
3. Doe dat op **beide** telefoons. Na een paar seconden zie je op elke telefoon de lijst "Boodschappen".

**Stoppen:** klik in het Terminal-venster waar `npx expo start` draait en druk op **Ctrl+C** (de Control-toets, niet ⌘). Daarna kun je de Terminal sluiten. De app op je telefoons blijft je lijsten bewaren; wil je weer testen, start dan opnieuw met `npx expo start`.

**Stap voor stap testen:** in `docs/HANDMATIGE_TEST.md` staat een checklist met de scenario's voor twee telefoons (koppelen, offline, gelijktijdig wijzigen enzovoort).

Lukt verbinden niet (bijvoorbeeld op een bedrijfs- of hotelnetwerk)? Gebruik dan de tunnel:

```bash
npx expo start --tunnel
```

De eerste keer vraagt Expo om een klein hulppakket te installeren; antwoord met "y".

### Een lijst koppelen (twee telefoons)

**Telefoon A (deelt):**
1. Open de lijst.
2. Tik rechtsboven op het deel-icoon.
3. Je ziet een QR-code. Zodra er **"Klaar om te koppelen"** staat, kan de ander koppelen.

**Telefoon B (koppelt), manier 1, scannen:**
- Lijsten → **Lijst toevoegen** → **Scannen** → richt de camera op de QR-code van A.

**Telefoon B (koppelt), manier 2, plakken:**
1. A tikt op **Delen…** en stuurt de tekst bijvoorbeeld via WhatsApp.
2. B kopieert de hele tekst.
3. B gaat naar **Lijst toevoegen** → **Code plakken** → **Plakken** → **Koppelen**.

> In Expo Go opent een tik op de link `bootschap://…` de app **niet**. Dat werkt pas in een eigen build (zie §8). Gebruik in Expo Go daarom scannen of plakken.

Na het koppelen staat de lijst op beide telefoons. Wat de een toevoegt, afvinkt of verwijdert, ziet de ander binnen een paar seconden, zolang beide apps open zijn en internet hebben.

## 4. Dagelijks gebruik

- **Toevoegen:** typ onderaan wat je nodig hebt en tik op het plusje of "Klaar". Het veld blijft open, zodat je snel achter elkaar kunt invoeren.
  - "2 melk", "500 g kaas" en "3x appels" worden automatisch hoeveelheid + eenheid + naam.
  - Tijdens het typen zie je suggesties uit wat je eerder kocht.
- **Categorieën:** producten worden automatisch ingedeeld in de volgorde van een supermarkt (groente & fruit eerst, huisdieren en overig als laatste). Pas je de categorie van een product aan, dan onthoudt de app dat voor de volgende keer.
- **Afvinken:** tik ergens op de regel. Afgevinkte items zakken naar "Afgevinkt", onderaan.
- **Bewerken of verwijderen:** tik op het pijltje rechts van een item.
- **Ongedaan maken:** na verwijderen of "Afgevinkte wissen" staat er 10 seconden een knop "Ongedaan maken".
- **Verversen:** trek de lijst naar beneden.
- **Status bovenaan:** de balk zegt altijd hoe het met de synchronisatie staat:
  - "Gesynchroniseerd";
  - "Synchroniseren…";
  - "Offline — 3 wijzigingen wachten";
  - "Alleen op dit toestel".

  Offline gemaakte wijzigingen gaan vanzelf mee zodra er weer internet is.
- **Donkere modus** volgt de instelling van je telefoon.

## 5. Hoe werkt het samen delen? (relays en privacy)

BOODSCHAP! heeft geen eigen server. Wijzigingen gaan via **openbare Nostr-relays**. Je kunt ze zien als gratis brievenbussen op internet die berichten bewaren tot de andere telefoon ze ophaalt. Daarom komt een wijziging ook aan als de telefoon van de ander uit staat of offline is.

- Standaard gebruikt BOODSCHAP! 4 relays tegelijk: `relay.damus.io`, `relay.primal.net`, `offchain.pub` en `nostr.mom`. Valt er één uit, dan werken de andere gewoon door.
- Je kunt de relays aanpassen in **Instellingen**. Alleen `wss://`-adressen zijn toegestaan, en je hebt er minstens één nodig.

**Wat een relay wél ziet:**
- het IP-adres van je telefoon;
- wanneer je verbindt;
- dat een paar willekeurige "pseudoniemen" versleutelde berichten uitwisselen;
- hoe groot die berichten zijn en hoe vaak ze komen (dus ongeveer hoe lang je lijst is en wanneer je boodschappen doet).

**Wat een relay níét ziet:** namen van lijsten of producten, hoeveelheden, notities, categorieën, en wie je bent. Alles is versleuteld met XChaCha20-Poly1305. Elke lijst heeft een eigen sleutel en een eigen pseudoniem, zodat je lijsten niet aan elkaar te koppelen zijn. De sleutels staan in de beveiligde opslag van je telefoon (Keychain/Keystore).

Een lijst die je nooit deelt, gebruikt helemaal geen internet.

## 6. Belangrijk bij delen

**Deel de QR-code of code alleen met mensen die je vertrouwt.**
- Wie de code heeft, kan je lijst lezen en wijzigen, en kan **altijd** blijven meedoen.
- In deze versie kun je iemand niet meer verwijderen en kun je de sleutel niet vervangen.
- Is een code bij de verkeerde persoon terechtgekomen, maak dan een nieuwe lijst en deel die opnieuw met de juiste mensen.
- **Het klembord:** "Kopieer code" zet de code op het klembord. Na een geslaagde koppeling wist BOODSCHAP! het klembord als de code er nog op staat. Op de telefoon van de deler kan de code nog in de klembordgeschiedenis van je toetsenbord staan, of via het gedeelde klembord van Apple op je andere apparaten. Wis die zo nodig zelf, en deel de code liever via scannen.

Twee keuzes bij het weggooien van een gedeelde lijst:
- **Lijst verlaten** haalt een gedeelde lijst alleen van jouw telefoon. De anderen houden hem.
- **Lijst verwijderen** bij een gedeelde lijst verwijdert hem op **alle** gekoppelde telefoons. De app vraagt dat eerst te bevestigen.

## 7. Bekende beperkingen

- **Geen pushmeldingen** (die vereisen een server). Synchroniseren gebeurt bij het openen van de app, bij terugkeer naar de app, bij herstel van het netwerk en live zolang de app open is. In de achtergrond synchroniseert de app niet.
- **In Expo Go** opent een gedeelde link de app niet (zie §3). Scannen en plakken werken wel.
- **Nieuwe telefoon (Android):** BOODSCHAP! neemt bewust niets mee in een Google-back-up of bij het overzetten naar een nieuwe telefoon (D-51). De app begint daar leeg; koppel je lijsten opnieuw met de deelcode vanaf een telefoon die ze nog heeft. Een nooit gedeelde lijst deel je eerst op de oude telefoon. **iPhone:** na het terugzetten van een back-up staan de lijsten er weer en meldt de app zich bij gedeelde lijsten als nieuw toestel (§19).
- **Geen sleutelrotatie en leden niet te verwijderen** (zie §6).
- **Publieke relays** zijn gratis maar bieden geen garantie: ze kunnen berichten weigeren of na verloop van tijd opruimen. BOODSCHAP! stuurt de volledige staat opnieuw als een relay iets kwijt is, en gebruikt meerdere relays tegelijk.
- **Verwijderde items** laten een kleine markering achter (nodig voor correcte synchronisatie). Een lijst kan ±14.000 van zulke regels bevatten. Daarboven toont de app "Lijst te groot om te synchroniseren".
- **Een klok die flink verkeerd staat** (meer dan een uur) kan synchronisatie vertragen. De app corrigeert dat zelf.

## 8. Naar de App Store en Google Play (EAS)

Het volledige stappenplan staat in `docs/PUBLICEREN.md`. Kort:

1. `npx eas-cli login` (gratis Expo-account) en eenmalig `npx eas-cli init` (koppelt het project; de slug is `boodschap`).
2. `eas.json` staat al klaar met twee profielen: `preview` (Android-apk en iOS voor intern testen) en `production` (voor de stores; buildnummers lopen automatisch op). Voor ontwikkelen gebruik je Expo Go; een `development`-profiel komt er pas bij als `expo-dev-client` nodig is.
3. Testbuild: `npx eas-cli build --profile preview --platform android` (of `ios`).
4. Storebuild: `npx eas-cli build --profile production --platform ios` en idem voor `android`; versturen met `npx eas-cli submit`.

App-ID: `nl.derondeengineering.boodschap`. Iconen en opstartscherm opnieuw maken: `npm run make:icons`. Schermafbeeldingen: `npm run make:screenshots` (zie `docs/store/demo-data.md`). Storeteksten: `store/nl` en `store/en`. In een eigen build werkt ook de deellink `boodschap://join#…` (en de oude `bootschap://join#…`): die opent direct het koppelscherm.

## Licentie en naam

De broncode valt onder de MIT-licentie (`LICENSE`), © 2026 Nick de Ronde. De naam BOODSCHAP!, het logo en het icoon vallen daar niet onder (`NOTICE`). Gebruikte open-sourcepakketten staan in de app onder Instellingen → Open-source licenties.

## Bijdragen en beveiliging

Zie `CONTRIBUTING.md`. Een kwetsbaarheid? Meld die vertrouwelijk volgens `SECURITY.md` (info@derondeengineering.nl). Vóór publicatie van de repository: `npm run check:secrets` moet schoon zijn.

## 9. Voor ontwikkelaars: testen

| Commando | Wat het doet |
|---|---|
| `npm test` | Alle tests (Jest): kern, opslag, sync met een in-process testrelay, gesimuleerde apparaten met netwerkuitval en crashes, UI-logica. ±1–2 min. |
| `npm run typecheck` | TypeScript (strict), app én tests |
| `npm run test:seeds` | Convergentietest met 1000 willekeurige scenario's |
| `npm run test:handles` | Alle tests in één proces met `--detectOpenHandles` (controle op lekkende timers/sockets) |
| `npm run check:deps` | Versies tegen Expo SDK 57 en de afhankelijkheidsboom |
| `npm run check:licenses` | Alle licenties open source |
| `npx expo export --platform ios` / `--platform android` | Bewijst dat de app voor beide platformen bundelt |

De standaardrun (`npm test`) praat niet met echte publieke relays; alles draait tegen een lokale testrelay. Er is één optionele rooktest tegen echte relays, die alleen draait als je hem expliciet aanzet: `LIVE_RELAYS=1 npx jest test/acceptance/live-relays`.

**Handmatige scenario's** op twee telefoons (H-01 t/m H-07; checklist in `docs/HANDMATIGE_TEST.md`, eisen in `docs/REQUIREMENTS.md` §7):
- H-01: koppelen via scannen en via plakken;
- H-02: offline toevoegen;
- H-03: gelijktijdig bewerken;
- H-04: geforceerd afsluiten;
- H-05: verwijderen tegenover bewerken;
- H-06: partner later online;
- H-07: latentie.

In de log van Expo verschijnt bij het opstarten `selftest.ok` als de versleuteling op het toestel werkt.

Documentatie: `docs/REQUIREMENTS.md`, `docs/ARCHITECTURE.md`, `docs/DEVIATIONS.md`, `docs/PROGRESS.md` en `docs/TEST_REPORT.md`.
