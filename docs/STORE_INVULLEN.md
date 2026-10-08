# Klikgids: BOODSCHAP! invullen in App Store Connect en de Play Console

Voor Nick. Per scherm: waar je klikt en wat je kopieert en plakt. Alle teksten staan al in de repo; je hoeft niets te bedenken.
De schermen van Apple en Google veranderen soms van naam of plek. Zie je iets anders dan hier staat, zoek dan op het vetgedrukte woord.

**Waar alles staat**

| Wat | Bestand |
|---|---|
| Naam, ondertitel, korte en lange beschrijving, trefwoorden, promotietekst, "Wat is nieuw", notities voor de beoordelaar | `store/nl/*.txt` (Nederlands) en `store/en/*.txt` (Engels) |
| Adressen (privacybeleid, support, website), categorie, copyright | `store/listing.json` |
| Apple-metagegevens in één keer (voor `eas metadata:push`) | `store.config.json` (gemaakt met `npm run make:store-config`) |
| Antwoorden privacy (Apple) en Data Safety (Google) | `docs/store/privacy-labels.md` |
| Leeftijdsclassificatie | `docs/store/age-rating.md` |
| Exportverklaring versleuteling | `docs/store/export-compliance.md` |
| Uitgever, handelaar (DSA), KvK | `docs/store/uitgever.md` |
| Play-icoon 512x512 | `store/graphics/play-icon-512.png` |
| Feature graphic 1024x500 (Google) | `store/graphics/feature-graphic-1024x500.png` |
| Schermafbeeldingen | maak ze met `docs/store/demo-data.md`, zet ze in `store/screenshots/raw/`, draai `npm run make:screenshots`; resultaat in `store/screenshots/out/` |

Schermafbeeldingen na `npm run make:screenshots`:
- Apple 6,9": `store/screenshots/out/apple-6.9/alle/01.png` … (1320x2868)
- Apple 6,3": `store/screenshots/out/apple-6.3/alle/01.png` … (1179x2556)
- Google telefoon: `store/screenshots/out/google/alle/01.png` … (1080x1920)
(Met bijschriften in `store/screenshots/captions.json` heet de map `nl` en `en` in plaats van `alle`.)

Al gemaakt (Android-emulator): `store/screenshots/out-android/google/alle/01.png` t/m `04.png`, uit `store/screenshots/raw-android/`. Voor Apple zijn iPhone-beelden nodig (6,9" of 6,3"); maak die op je iPhone en draai `npm run make:screenshots`.

---

## Deel A — Apple: App Store Connect (appstoreconnect.apple.com)

### A0. Build en app-record (in de Terminal, in de projectmap)

1. Upload de iOS-build: `npx eas-cli submit --platform ios --latest`.
   - Log in met je Apple ID als daarom wordt gevraagd. Bestaat de app nog niet in App Store Connect, dan maakt EAS hem aan met de gegevens uit `eas.json` (naam BOODSCHAP!, taal Nederlands, SKU `boodschap`) en het bundle-ID `nl.derondeengineering.boodschap` uit `app.json`.
   - Na afloop noemt EAS een **ASC App ID** (alleen cijfers). Zet dat in `eas.json` onder `submit.production.ios` als `"ascAppId": "1234567890"` (met jouw nummer). Een leeg veld mag daar niet staan; EAS weigert dan het hele bestand, daarom staat het er nu nog niet.
2. Teksten in één keer naar Apple (aanbevolen): `npx eas-cli metadata:push`. Dat vult naam, ondertitel, beschrijving, trefwoorden, promotietekst, adressen, categorieën, copyright, leeftijdsclassificatie en "na goedkeuring automatisch uitbrengen" in, in het Nederlands en Engels. Controleer daarna de schermen hieronder; wat al is ingevuld sla je over.

### A1. App-informatie (linkermenu: **App Information**)

- **Name** (per taal): plak `store/nl/name.txt` (Nederlands) en `store/en/name.txt` (English (U.S.)). Taal wisselen: rechtsboven het taalmenu; voeg **English (U.S.)** toe als die er niet staat.
- **Subtitle**: `store/nl/subtitle.txt` / `store/en/subtitle.txt`.
- **Category**: Primary **Food & Drink**, Secondary **Productivity**.
- **Content Rights**: "Does your app contain, show, or access third-party content?" → **No**.
- **Age Rating** → **Edit**: beantwoord alles met **None** / **No** (zie `docs/store/age-rating.md`): geen webbrowser, geen door gebruikers gemaakte openbare inhoud, geen chat, geen advertenties, geen gezondheidsonderwerpen. Uitkomst hoort **4+** te zijn.
- **App Store Regulations and Permits → Digital Services Act → Edit**: kies **trader** (handelaar). Zie A6.
- **App Encryption Documentation**: zie A5.

### A2. Prijs en beschikbaarheid (linkermenu: **Pricing and Availability**)

- **Price**: **Free** (USD 0.00).
- **Availability** → **Edit** → alle landen aanvinken, daarna **France** uitvinken → **Done**. (Frankrijk vraagt een aparte encryptieverklaring; die doen we later, zie `docs/store/export-compliance.md`.)

### A3. App-privacy (linkermenu: **App Privacy**)

- **Privacy Policy URL**: `https://nickderonde.github.io/boodschap/privacy/` (bij English: `https://nickderonde.github.io/boodschap/en/privacy/`).
- **Data Collection** → **Get Started** → "Do you or your third-party partners collect data from this app?" → **No, we do not collect data from this app** → **Save** → **Publish**.
  - Onderbouwing staat in `docs/store/privacy-labels.md` (lijstinhoud end-to-end versleuteld, geen SDK's van derden, crashrapporten en statistieken komen van Apple zelf).

### A4. Versiepagina (linkermenu: **iOS App → 1.0 Prepare for Submission**)

Per taal (Nederlands en English):
- **Screenshots**: sleep de bestanden uit `store/screenshots/out/apple-6.9/…` in het vak **iPhone 6.9" Display**. Heb je alleen 6,3"-beelden, gebruik dan `apple-6.3`. Geen iPad-beelden (de app is alleen voor iPhone).
- **Promotional Text**: `store/<taal>/promotional-text.txt`.
- **Description**: `store/<taal>/description.txt`.
- **Keywords**: `store/<taal>/keywords.txt` (precies zo, met komma's en zonder spaties).
- **Support URL**: `https://nickderonde.github.io/boodschap/support/` (English: `…/en/support/`).
- **Marketing URL**: `https://nickderonde.github.io/boodschap/` (English: `…/en/`).
- **What's New**: bij versie 1.0 niet beschikbaar; laat leeg.

Eén keer (niet per taal):
- **Build** → **Add Build** → kies de build die EAS heeft geüpload (versie 1.0.0). Zie je hem niet: wacht 10–30 minuten tot Apple hem heeft verwerkt.
- **Copyright**: `2026 Nick de Ronde`.
- **App Review Information**:
  - **Sign-in required**: uit (er is geen inlog).
  - **Contact Information**: jouw voornaam, achternaam en telefoonnummer (vul je zelf in); e-mail `info@derondeengineering.nl`.
  - **Notes**: plak `store/en/review-notes.txt` (Engels; beoordelaars werken in het Engels).
- **Version Release**: **Automatically release this version** (na goedkeuring meteen live).

### A5. Exportverklaring (versleuteling) — per build

De app zet zelf geen encryptiesleutel in de build (D-49; build 1 werd daarop afgewezen met ITMS-90592). App Store Connect stelt daarom **per build** de exportvragen. Je ziet ze bij **TestFlight** (geel driehoekje "Missing Compliance" naast de build → **Manage**) of als je de build kiest op de versiepagina (A4). Antwoord zo:
1. "What type of encryption algorithms does your app implement?" / "Does your app use encryption?" → kies dat de app versleuteling gebruikt (**Yes**).
2. Kies **Standard encryption algorithms instead of, or in addition to, using or accessing the encryption within Apple's operating system** (erkende standaardalgoritmen naast die van iOS; geen eigen of geheime algoritmen).
3. "Is your app going to be available on the App Store in France?" → **No** (Frankrijk staat uit, A2).
4. Uitkomst: **geen documentatie nodig** → **Save**. De build is daarna klaar voor TestFlight en de beoordeling.
Doe dit bij elke nieuwe build. Achtergrond: `docs/store/export-compliance.md`.

### A6. Handelaar (DSA)

Eenmalig voor je account: bovenaan **Business** → tab **Agreements** → onderaan **Compliance** → **Complete Compliance Requirements** bij **Digital Services Act**:
- Kies **I'm a trader**.
- Adres of postbus, telefoonnummer en e-mail `info@derondeengineering.nl`. Apple controleert e-mail en telefoon met een code. Deze gegevens toont Apple aan EU-gebruikers. Op onze eigen website staat geen adres (besluit, `docs/store/uitgever.md`).

### A7. Indienen

Rechtsboven op de versiepagina: **Add for Review** → controleer de lijst → **Submit to App Review**. Meestal duurt de beoordeling 1–3 dagen. Bericht van Apple? Stuur het door naar de Projectleider.

---

## Deel B — Google: Play Console (play.google.com/console)

Het account is een organisatie-account (De Ronde Engineering). Daarvoor geldt geen verplichte gesloten test van 14 dagen.

### B0. Het .aab-bestand downloaden

In de Terminal, in de projectmap:
```bash
npx eas-cli build:list --platform android --status finished --limit 1
```
Kopieer de link achter **Application Archive URL** naar je browser; je downloadt dan een `.aab`-bestand. (Of: expo.dev → project boodschap → Builds → de nieuwste Android-build → **Download**.) De eerste keer upload je dit bestand met de hand (B4); latere versies kunnen met `npx eas-cli submit --platform android`.

### B1. App aanmaken

**Home** → **Create app**:
- **App name**: `BOODSCHAP!`
- **Default language**: **Dutch – nl-NL**
- **App or game**: **App**
- **Free or paid**: **Free**
- Vink de twee verklaringen aan (Developer Program Policies, US export laws) → **Create app**.

### B2. App-content (linkermenu: **Policy and programs → App content**)

Werk elk blok af tot er een groen vinkje staat:

| Blok | Wat je kiest of plakt |
|---|---|
| **Privacy policy** | `https://nickderonde.github.io/boodschap/privacy/` |
| **App access** | **All functionality in my app is available without any access restrictions** (er is geen inlog) |
| **Ads** | **No, my app does not contain ads** |
| **Content rating** | **Start questionnaire** → e-mail `info@derondeengineering.nl` → categorie **All Other App Types** → geweld, seks, taal, middelen, gokken: **No**. "Kunnen gebruikers met elkaar inhoud delen?": **Yes**, en licht toe: alleen een privélijst met mensen die de deelcode hebben; geen openbare uitwisseling, geen chat. Verwacht: **PEGI 3 / Everyone** (`docs/store/age-rating.md`). |
| **Target audience and content** | Leeftijdsgroep **18 and over**; niet aantrekkelijk voor kinderen → **No** |
| **Data safety** | Zie de tabel hieronder |
| **Advertising ID** | **No** (de app gebruikt geen advertentie-ID; de rechten zijn geblokkeerd) |
| **Government apps** | **No** |
| **Financial features** | **My app doesn't provide any financial features** |
| **Health** | **My app does not have any health features** |
| **News apps** | **No** |
| Overige blokken (bijv. COVID-19) | **No** / niet van toepassing |

**Data safety**, per vraag (onderbouwing in `docs/store/privacy-labels.md`):
1. "Does your app collect or share any of the required user data types?" → **No**.
   (Google: gegevens die end-to-end versleuteld zijn en alleen voor zender en ontvanger leesbaar, hoeven niet te worden opgegeven.)
2. Daarmee vervallen de vervolgvragen over soorten gegevens, versleuteling tijdens verzending en verwijderen. Controleer op de samenvatting: **No data collected**, **No data shared** → **Submit**.

### B3. Storevermelding (linkermenu: **Grow users → Store presence → Main store listing**)

Nederlands (standaard):
- **App name**: `store/nl/name.txt`
- **Short description**: `store/nl/short-description.txt`
- **Full description**: `store/nl/description.txt`
- **App icon**: `store/graphics/play-icon-512.png`
- **Feature graphic**: `store/graphics/feature-graphic-1024x500.png`
- **Phone screenshots** (2 tot 8): de vier beelden van de emulator staan al klaar in `store/screenshots/out-android/google/alle/01.png` t/m `04.png` (1080x1920). Maak je later nieuwe, dan komen ze in `store/screenshots/out/google/…`.
- Tablet- en Chromebook-beelden: niet nodig.

Engels: bovenaan **Manage translations → Add your own translations → English (United States) – en-US** en plak `store/en/name.txt`, `store/en/short-description.txt`, `store/en/description.txt`. Afbeeldingen mogen hetzelfde blijven (de interface is Nederlands). → **Save**.

**Store settings** (linkermenu: **Store presence → Store settings**):
- **App category**: **Food & Drink**
- **Email**: `info@derondeengineering.nl`
- **Website**: `https://nickderonde.github.io/boodschap/`
- Telefoon: niet verplicht; laat leeg.

### B4. Productie-release (linkermenu: **Test and release → Production**)

1. **Countries/regions** → **Add countries/regions** → alles selecteren → **Add**.
2. **Create new release**.
3. **App integrity / Play App Signing**: kies de door Google beheerde ondertekening (standaard). Het bestand van EAS dient dan als uploadsleutel.
4. **App bundles** → **Upload** → kies het `.aab`-bestand uit B0.
5. **Release name**: laat het voorstel staan (bijv. `1 (1.0.0)`).
6. **Release notes**: plak tussen de taalcodes:
   ```
   <nl-NL>
   Eerste versie van BOODSCHAP!.
   </nl-NL>
   <en-US>
   First release of BOODSCHAP!.
   </en-US>
   ```
   (Dezelfde tekst als `store/nl/whats-new.txt` en `store/en/whats-new.txt`.)
7. **Next** → controleer de waarschuwingen (geel mag, rood moet je eerst oplossen) → **Save**.

### B5. Indienen

Linkermenu **Publishing overview** → **Send changes for review** (of **Send 1 change for review**). De eerste beoordeling van een nieuwe app kan enkele dagen tot een week duren.

---

## Na goedkeuring

- Zet de store-links in de README, op de website (`site/index.html` en `site/en/index.html`) en geef ze door aan de Projectleider.
- Vul de uitkomst van de leeftijdsclassificatie in `docs/store/age-rating.md` in en bewaar schermafbeeldingen van de privacyantwoorden in `docs/store/`.
