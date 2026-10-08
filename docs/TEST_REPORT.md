# Testrapport Bootschap — eindversie, ronde 3 (Eindtester)

Eigenaar: Eindtester. Datum: 2026-10-06. Basis: REQUIREMENTS v0.3.1, ARCHITECTURE v1.0, code M1 t/m M5 inclusief de fixes uit `docs/reviews/test-report-fase2-response.md`.
Ronde 3 (dit document) vervangt de fase-2-versie: nieuwe verborgen F-08-set, volledige regressie, hertest van de opgeloste defecten, README-hertest, DoD en eindadvies.

> **Addendum ronde 4 (2026-10-07) onderaan: F-08 is groen (blinde set 4: 90 %). Het eindadvies uit ronde 3 is daarmee vervangen door het advies in het addendum.**

## 0. Eindoordeel en advies

**Eindadvies: NIET VRIJGEVEN (voor oplevering).** Eén eis, F-08, haalt de drempel nog niet: de derde, nieuwe verborgen set scoort **87 %** (eis ≥ 90 %), dus formeel opnieuw een **major** (D-ET-07, heropend). Alle andere Must-eisen zijn groen, alle andere defecten uit ronde 2 zijn opgelost.

Nuance voor de Projectleider (de beslissing is aan hem; de Eindtester versoepelt de eis niet):
- Op de eerdere verborgen set (set 2) is de score van 88 % gestegen naar 99 %, maar set 2 is nu bekend en telt niet meer als blind. Op de blinde set 3 is het resultaat 87 %.
- Van de 13 missers in set 3 zijn er 5 ondubbelzinnig fout (zie §5); de overige 8 zijn betwistbaar (bijv. batterijen en gloeilamp als "Overig" of "Huishouden", kibbeling en visstaafjes vers of diepvries). Zonder de betwistbare gevallen is de score 95 %. Formeel telt de set zoals geschreven.
- Het defect raakt alleen in welke groep een product terechtkomt; synchronisatie en gegevens zijn niet in het geding. De rooktest met Nick (`docs/HANDMATIGE_TEST.md`) kan daarom veilig parallel starten als de Projectleider dat besluit.

Het advies wordt **VRIJGEVEN VOOR ROOKTEST** zodra de vijf duidelijke missers zijn opgelost en een nieuwe (vierde) verborgen set ≥ 90 % haalt, of zodra de Projectleider schriftelijk besluit F-08 op de huidige stand te accepteren.

## 1. Scope en aanpak

- Alleen publieke API's: facade, harnas (gesimuleerde apparaten, hub, WS-wereld), test-relays; UI-tests met `@testing-library/react-native` op de echte schermen met de echte facade en store (alleen expo-router, camera, klembord en systeemdialoog zijn dubbelgangers).
- Geen wijzigingen in `src/` of `app/`. Eén wijziging in testconfiguratie: `jest.config.js` (ui-project) kreeg `test/acceptance/ui` als extra root, zodat UI-acceptatietests meedraaien.
- Eindtester-bestanden in `test/acceptance/`:
  - `f08-categorize.test.ts` + `test/fixtures/categorize-f08-eindtester.json` (goedgekeurd door de Projectleider)
  - `partner-scenarios.test.ts`, `resilience.test.ts`, `ws-acceptance.test.ts`, `live-relays.test.ts` (fase 1), `helpers.ts`
  - `ui/ui-list.test.tsx` (29 tests), `ui/ui-screens.test.tsx` (17), `ui/ui-start.test.tsx` (1), `ui/harness.ts`
- Je acceptatietests van fase 1 zijn inhoudelijk ongewijzigd (zelfde assertions en drempels, p95 ≤ 2 s en max ≤ 5 s, 48 KiB, enz.). Er is geen git-basislijn; vergeleken met mijn eigen versie. Door de Engineer zijn alleen de `test.failing`-markeringen van ET-S10-4 (ronde 2) en ET-S17-1 (ronde 3) verwijderd; gecontroleerd: er staat geen `test.failing` meer in `test/acceptance/`, assertions en drempels zijn ongewijzigd. Ik heb alleen commentaar bijgewerkt en in ronde 3 twee UI-controles toegevoegd (D-ET-06: bevestiging zichtbaar; O-ET-09: unieke labels).

## 2. Regressie (nieuwste code, ronde 3)

| Commando | Resultaat |
|---|---|
| `npm test` | **68 suites geslaagd, 1 overgeslagen (live-rooktest, bewust); 394 tests geslaagd, 0 gefaald** (≈ 56 s) |
| `npm run typecheck` | 0 fouten (app en tests) |
| `npm run test:handles` | schoon: 394 geslaagd, geen open handles, geen "did not exit" |
| `npx expo-doctor` | **21/21** (D-ET-08 opgelost) |
| `npm run check:deps` | "Dependencies are up to date" |
| `npx expo export --platform ios` / `android` | geslaagd (iOS 3,9 MB, Android 4,3 MB Hermes) |
| Schone kopie (zonder `node_modules`, `dist`, `coverage`): `npm install`, `npm test`, typecheck, beide exports, `expo-doctor`, `npx expo start` | alles groen: 394 tests, exports ok, doctor 21/21, manifest en iOS-dev-bundel HTTP 200 |
| UI-acceptatietests (`test/acceptance/ui`, 47 tests) na de laatste wijzigingen | 72/72 groen in het ui-project (incl. de tests van de Engineer) |

## 3. Defecten en opmerkingen (status na ronde 3)

| ID | Ernst | Eis | Omschrijving | Hertest | Status |
|---|---|---|---|---|---|
| **D-ET-07** | **major** | F-08 | Categorisering: set 2 (verborgen, ronde 2) 88 %, nu 99 %. **Nieuwe blinde set 3: 87 / 100 (eis ≥ 90 %).** Zie §5 voor de duidelijke missers (o.a. "boter ongezouten" → houdbaar, "bleekwater" → dranken, "rijstepapier" → zuivel, "hamlappen" en "zoute stengels" → onbekend/overig). | Set 3 gemeten met het script in de tmp-map | **Open (heropend)** |
| D-ET-05 | minor | S-03, S-17 | Na weigeringen door alle relays blijft de wijziging niet meer hangen: de engine probeert zelf opnieuw (30 s, 1, 2, 5 min). | `ET-S17-1` (nu gewoon `it`, groen); daarnaast `ET-UX02-4` (UI toont "Synchronisatiefout" en herstelt) | **Opgelost** |
| D-ET-06 | minor | UX-06 | "Code gekopieerd" is nu zichtbaar op het deelscherm. | `ET-F13-2` (nu met `getByText` op het scherm) groen | **Opgelost** |
| D-ET-08 | minor | NF-08 | `expo-doctor` 21/21; `check:deps` schoon. | Ook in de schone kopie | **Opgelost** |
| O-ET-09 | minor | UX-09 | Invoerveld "Nieuw adres invoeren", knop "Relay toevoegen": verschillende labels. | `ET-UX09-2` groen | **Opgelost** |
| O-ET-10 | minor | NF-14 | README voor Nick: punten 1–4 uit ronde 2 verholpen (projectmap, Node installeren, "vulnerabilities" negeren, Ctrl+C, verwijzing naar de checklist). Nog klein over: §9 zegt "geen enkele test praat met echte relays" (er is een optionele live-test met `LIVE_RELAYS=1`); geen "vraag hulp"-zin bij de SDK-melding; QR-code in een smal Terminal-venster niet uitgelegd. | README gelezen en gevolgd (§7) | Open, cosmetisch |
| O-ET-04 | info | NF-02 e | Met één relay kan een kwaadwillende relay A's slot met vervalste events blokkeren; met ≥ 3 relays (standaard 4) herstelt alles. | `ET-NF02-2` | Informatief |
| ~~D-ET-01~~, ~~O-ET-02~~ | — | S-10, S-02 | Opgelost (ronde 2). | | Gesloten |

Geen blocker. Eén major (D-ET-07, F-08). Twee minor/info open (O-ET-10, O-ET-04).

## 4. Eindoordeel per Must-eis (en Should/Could)

PASS = aantoonbaar groen in geautomatiseerde tests (Engineer en/of Eindtester). "H" = nog door Nick handmatig te bevestigen (`docs/HANDMATIGE_TEST.md`).

**Functioneel**

| Eis | Oordeel | Bewijs |
|---|---|---|
| F-01 lijsten (M) | PASS | `lists.test`, `lists-sync.test`; UI: ET-F01-2, ET-F01-3 |
| F-02 item toevoegen (M) | PASS | `items.test`; ET-UX03-1, ET-F02-1, ET-UX05-1 (te lange naam → melding) |
| F-03 afvinken (M) | PASS | ET-F03-1, ET-F03-2 (onderaan, doorgehaald, blijft bewaard) |
| F-04 bewerken (M) | PASS | ET-F04-1 |
| F-05 verwijderen (M) | PASS | ET-F05-1, ET-S07-* |
| F-06 afgevinkte wissen (M) | PASS | ET-F06-1, ET-F06-2 (200 stuks, ongedaan maken) |
| F-07 ongedaan maken (S) | PASS | ET-S07-6, ET-F05-1, ET-F06-1 |
| **F-08 categorie (M)** | **FAIL** | Openbare set 99 % (ET-F08-1); verborgen set 2: 99 % (was 88 %); **blinde set 3: 87 %** (D-ET-07) |
| F-09 voorkeur onthouden (M) | PASS | ET-F08-4 |
| F-10 groepering (M) | PASS | ET-F10-1, ET-F10-2 (16 categorieën in vaste volgorde, lege verborgen) |
| F-11 suggesties (M) | PASS | ET-F11-1..3 (1 teken, max. 8, historie eerst, categorie onthouden, woordenlijst) |
| F-12 invoer ontleden (S) | PASS | ET-F12-1 |
| F-13 delen (M) | PASS (H-01 open) | ET-F13-1, ET-F13-2, ET-F14-1 |
| F-14 koppelen (M) | PASS (H-01 open) | ET-F14-1..5, ET-F15-1, ET-F15-2 |
| F-15 plakken (S) | PASS | ET-F15-1, ET-F15-2, ET-F14-4 |
| F-16 3–5 apparaten (S) | PASS | ET-S18-1, ET-S18-2 |
| F-17 dubbel (S) | PASS | ET-F17-1 |
| F-18 verlaten (S) | PASS | ET-F18-1 |
| F-19 relays instellen (C) | PASS | ET-F19-1..3 (`ws://`, `http://`, spaties, lege lijst geweigerd; laatste relay kan niet weg) |
| F-20, F-21 (C) | niet gebouwd (D-29) | — |

**Sync en offline**

| Eis | Oordeel | Bewijs |
|---|---|---|
| S-01 lokaal eerst (M) | PASS (H-02 open) | `offline.test`; ET-F13-1 |
| S-02 geen verlies (M) | PASS (H-04 open) | ET-S02-1..3 |
| S-03 automatisch verzenden (M) | PASS | ET-S03-1, ET-S03-2 |
| S-04 convergentie (M) | PASS | ET-S04-1, ET-S04-2, ET-S06-*, ET-S18-*; seeds van de Engineer |
| S-05 CRDT-eigenschappen (M) | PASS | `merge.property.test` (Engineer) |
| S-06 veldregel (M) | PASS | ET-S06-1..3 |
| S-07 R-DEL (M) | PASS (H-05 open) | ET-S07-1..6 |
| S-08 partner later online (M) | PASS (H-06 open) | ET-S08-1..3 |
| S-09 relay-uitval (M) | PASS | ET-S09-1..5 |
| S-10 relay-dataverlies (M) | PASS | ET-S10-1..4 |
| S-11 duplicaten/replay (M) | PASS | ET-S11-1, ET-NF02-3 |
| S-12 latentie (M) | PASS lokaal (H-07 open) | ET-S12-1/2: mediaan ≈ 1,0 s, p95 ≈ 1,03 s, max ≈ 1,03 s; live: 1,08 s (één meting) |
| S-13 triggers (M) | PASS | `triggers.test` (Engineer) |
| S-14 vreemde berichten (M) | PASS | ET-NF02-1, ET-NF02-2 |
| S-15 grootte (M) | PASS | ET-S15-1..4 |
| S-16 klokafwijking (M) | PASS | ET-S16-1..4 |
| S-17 status (M) | PASS | `status.test`; ET-UX02-1..6 (in de UI) |
| S-19 verwisselbare transport (M) | PASS | `contract`-tests, `imports.test` |
| S-18, S-20, S-21 (S) | PASS | ET-S18-*, `schema.test`, `debounce.test` |
| S-22 (C) | niet beoordeeld (Could) | — |

**Niet-functioneel**

| Eis | Oordeel | Bewijs |
|---|---|---|
| NF-01 versleuteling (M) | PASS | ET-NF01-1 |
| NF-02 derde partij (M) | PASS | ET-NF02-1..4 |
| NF-03 metadata (S) | PASS | ET-NF03-1 |
| NF-04 sleutelopslag (M) | PASS | `keys.test` (Engineer) |
| NF-05 deellink is geheim (M) | PASS | ET-NF05-1..4 (logs; klembord wordt na koppelen leeggemaakt, alleen als de code erop staat; instellingen waarschuwen) |
| NF-06 geen server/tracking (M) | PASS | `deps.test`, setup blokkeert fetch/XHR; alle WS-URL's horen bij de relayset |
| NF-07 open source (M) | PASS | `check:licenses`: 825 pakketten |
| NF-08 Expo Go/exports (M) | PASS | exports iOS en Android groen, `expo-doctor` 21/21 |
| NF-09 kwaliteit (M) | PASS | typecheck 0 fouten; 385 tests groen |
| NF-10 prestaties (S) | PASS logica; koude start op telefoon: H | `perf.test` |
| NF-11 batterij (S) | PASS | `battery.test` |
| NF-12 testbaarheid (M) | PASS | harnas, kill, foutinjectie |
| NF-13 migraties (S) | PASS | `migrations.test` |
| NF-14 documentatie (M) | PASS met kleine opmerkingen (O-ET-10) | §7 |

**UX (statisch tegen `app/` en `src/ui`, plus UI-tests)**

| Eis | Oordeel | Bewijs |
|---|---|---|
| UX-01 volledig Nederlands (M) | PASS | `strings.test` (Engineer), ET-UX01-1; geen losse tekst in `app/` of `src/ui` (scan) |
| UX-02 sync-indicator (M) | PASS (H-02) | ET-UX02-1..6: tekst én icoon; "Alleen op dit toestel", "Gesynchroniseerd", "Synchroniseren…", "Offline — n wijzigingen wachten" binnen 1 s, "Synchronisatiefout" met uitleg, "Beperkt verbonden (2 van 4)" |
| UX-03 snel invoeren (M) | PASS auto; focus op toestel: H | ET-UX03-1 (veld leeg; `blurOnSubmit=false`; Klaar voegt toe; suggesties) |
| UX-04 afvinken (M) | PASS | ET-F03-1, ET-UX04-1 (tikdoel ≥ 44 pt) |
| UX-05 optimistisch (M) | PASS | `optimistic.test`, `store.test`, ET-UX05-1 |
| UX-06 begrijpelijke fouten (M) | PASS | ET-UX06-1 (geen jargon), ET-UX06-3 (startfout + "Opnieuw proberen"), ET-F14-4 (ongeldige code), ET-F01-3 en ET-UX11-1 (lege toestand), ET-F15-1 (camera geweigerd), ET-UX11-2 |
| UX-07 bevestiging (M) | PASS | ET-UX07-1, ET-UX07-2 (lijst verwijderen en gedeelde lijst: tekst noemt "alle telefoons" en "Lijst verlaten"); verwijderen/wissen met 10 s ongedaan maken (ET-F05-1, ET-F06-1) |
| UX-08 donkere modus (S) | thema aanwezig; leesbaarheid: H | `theme.ts` volgt systeem |
| UX-09 toegankelijkheid (S) | PASS | ET-UX09-1, ET-UX09-2 (alle knoppen en regels hebben een uniek label) |
| UX-10 voortgang (S) | PASS | ET-UX10-1 (ook van de partner), ET-UX10-2 |
| UX-11 direct bruikbaar (S) | PASS | ET-UX11-1, ET-UX11-2 (camera pas bij scannen) |
| UX-13 pull-to-refresh (S) | PASS | `triggers.test`; ET-S10-4 |
| UX-12, UX-14 (C) | niet gebouwd (D-29) | — |

## 5. F-08: verborgen sets, ronde 3

| Set | Waar | Score nieuwe code | Opmerking |
|---|---|---|---|
| Openbaar (goedgekeurd) | repo, `categorize-f08-eindtester.json` | 99 % (ronde 2 en 3) | enige fout: "tortilla wraps" in de ronde-2-meting; de Engineer meldt nu 100 % |
| Set 2 (ronde 2) | tmp-map, `f08-hidden.json` | **99 %** (was 88 %) | informatief: set is bekend en telt niet meer als blind; enige fout: "rijstwafels" (snacks verwacht, brood & gebak gekregen; betwistbaar) |
| **Set 3 (nieuw, blind)** | tmp-map, `f08-hidden3.json` | **87 / 100** | eis ≥ 90 % → **FAIL** |

Set 3 (100 gangbare producten, anders dan sets 1 en 2; met varianten: meervoud, merken, samenstellingen, voorvoegsels) is vóór de meting opgesteld. Missers:

| Product | Gekregen | Verwacht | Oordeel |
|---|---|---|---|
| boter ongezouten | houdbaar | zuivel & eieren | **duidelijk fout** (bijvoeglijk woord "zout" wint van "boter") |
| hamlappen | overig | vlees & vis | **duidelijk fout** (onbekend) |
| rijstepapier | zuivel & eieren | pasta, rijst & wereldkeuken | **duidelijk fout** |
| zoute stengels | overig | snacks | **duidelijk fout** (onbekend) |
| bleekwater | dranken | huishouden | **duidelijk fout** (achtervoegsel "water" wint) |
| ontbijtspek, cervelaatworst | vlees & vis | vleeswaren & kaas | betwistbaar |
| nasi goreng kruiden | houdbaar | wereldkeuken | betwistbaar |
| olijven | groente & fruit | houdbaar | betwistbaar |
| kibbeling, visstaafjes | vlees & vis | diepvries | betwistbaar |
| batterijen AA, gloeilamp | huishouden | overig | betwistbaar |

Advies aan de Engineer: de patronen achter de vijf duidelijke fouten zijn algemeen (een eerste woord als "ongezouten", "zoute" of "bleek" mag de kop van de samenstelling of het hoofdproduct niet overrulen; "water" als achtervoegsel is alleen drank na een drankwoord; "-papier" is geen "pier"/ei). Na de fix lever ik een vierde blinde set.

Overige resultaten: rooktest echte relays (fase 1) PASS: klaar-om-te-koppelen 512 ms, koppelen 362 ms, terugkoppeling 1084 ms.

## 6. Definition of Done (REQUIREMENTS §8)

| # | Punt | Oordeel |
|---|---|---|
| 1 | Alle Must-eisen groen; Should groen of gemotiveerd afwijkend; geen open blocker/major | **FAIL**: F-08 (D-ET-07, major, set 3 = 87 %). Overige Musts groen; H-01..H-07 nog door Nick te bevestigen |
| 2 | `tsc` 0 fouten (strict) | PASS |
| 3 | `jest` volledig groen met resultaat per eis-ID (matrix) | PASS (394/394, 1 bewust overgeslagen; matrix in `docs/PROGRESS.md` en dit rapport) |
| 4 | `expo export` iOS en Android slagen | PASS (ook in schone kopie; doctor 21/21) |
| 5 | TEST_REPORT met scope, omgeving, resultaten, defecten, handmatige scenario's | **Gedeeltelijk**: rapport compleet; de scenario's staan in `docs/HANDMATIGE_TEST.md` maar zijn nog niet door Nick uitgevoerd |
| 6 | README conform DoD; op een schone checkout gevolgd | PASS (kleine cosmetische punten, O-ET-10) |
| 7 | ARCHITECTURE bijgewerkt op de code; APPROVALS Goedgekeurd | ARCHITECTURE **v1.0 aanwezig: PASS**. APPROVALS: rijen voor oplevering, TEST_REPORT en handmatige acceptatie blijven open tot het eindakkoord (Projectleider/Nick); dat is procedureel, geen testbevinding |
| 8 | Geen geheimen, testsleutels of persoonsgegevens | PASS (scan ronde 2; geen nieuwe bestanden met geheimen in ronde 3) |

## 7. README op een schone checkout (ronde 3)

Gevolgd op een schone kopie met de bijgewerkte README: `npm install` (912 pakketten, 4 s met cache), `npm test` (394 groen), typecheck, beide exports, `expo-doctor` 21/21, `npx expo start` (HTTP 200 voor manifest en bundel): geen stap faalt.

Hertest van de punten voor Nick uit ronde 2:
1. Projectmap/`git clone`: nu "de projectmap staat al op deze Mac" met een `cd`-commando; GitHub alleen als optie. **Opgelost.**
2. Node.js installeren: stappen met nodejs.org of Homebrew en het controle-commando `node -v`. **Opgelost.**
3. "vulnerabilities"/"deprecated" mag hij negeren, en geen `npm audit fix`. **Opgelost.**
4. Server stoppen met Ctrl+C; verwijzing naar `docs/HANDMATIGE_TEST.md`. **Opgelost.** Klembord-uitleg (K-1) toegevoegd.
5. SDK-melding: de upgradetekst voor ontwikkelaars staat nog zonder "vraag hulp" voor Nick. **Open, cosmetisch.**
6. §9 zegt nog "geen enkele test praat met echte publieke relays" terwijl er een optionele live-test is. **Open, cosmetisch.**

**Kan Nick hiermee de app op twee telefoons krijgen en een lijst koppelen?** Ja. Alle stappen (Node controleren, `npm install`, `npx expo start`, scannen met Expo Go, delen, "Lijst toevoegen", scannen of plakken, koppelen) kloppen met de app en zijn in de UI-tests gevolgd, inclusief begrijpelijke foutmeldingen bij een kapotte code.

## 8. Wat nu moet gebeuren

1. Engineer: de vijf duidelijke F-08-missers (§5) generiek oplossen; daarna levert de Eindtester een vierde blinde set. Of: de Projectleider besluit schriftelijk over de huidige stand.
2. Nick: `docs/HANDMATIGE_TEST.md` uitvoeren (H-01..H-07) en terugmelden. Dit kan parallel aan punt 1.
3. Engineer (cosmetisch): twee README-zinnen (O-ET-10).
4. Projectleider/Architect: APPROVALS afronden na punt 1 en 2.


---

# Addendum ronde 4 (2026-10-07): laatste toets vóór de rooktest met Nick

Basis: REQUIREMENTS v0.4 (procedure F-08), `docs/reviews/review-lead-final.md`, ARCHITECTURE v1.0.1, code met de F-08-fix en de README-aanvullingen van de Engineer.

## A. Eindadvies

**VRIJGEVEN VOOR ROOKTEST MET NICK, en voor oplevering onder één voorwaarde: de bevestiging van Nick (H-01..H-07).**
- F-08 voldoet volgens de procedure van de Projectleider: **uitkomst A** (blinde set 4: totaal 90,0 %, zonder betwistbare items 90,8 %; criterium ≥ 90 %). De marge is smal (precies op de grens); zie §B voor de resterende missers.
- Geen blocker en geen major open. Alle Must-eisen die automatisch te toetsen zijn staan op PASS.
- Open voorwaarde voor oplevering: Nick voert `docs/HANDMATIGE_TEST.md` uit en meldt per scenario Ja/Nee. Daarnaast procedureel: APPROVALS en het eindakkoord (Projectleider/Nick).

## B. Blinde set 4 (F-08)

Set 4: 100 nieuwe producten (geen overlap met sets 1–3; gecontroleerd op exacte namen), alleen bewaard in de tmp-map van de Eindtester (`f08-hidden4.json`). **Vóór de meting** zijn 13 items als betwistbaar gemarkeerd, elk met motivering in het bestand (mascarpone, chocolademelk, rookworst, sandwichspread, misopasta, rozijnen, perziken op sap, cashewnoten, ijskoffie, kroketten, zakdoekjes, haarverf, kinderkoekjes: telkens twee redelijke categorieën).

| Meting | Score | Procedure Projectleider |
|---|---|---|
| **Totaal** | **90 / 100 = 90,0 %** | ≥ 90 %: **uitkomst A, F-08 groen** |
| Zonder de 13 betwistbare items | 79 / 87 = 90,8 % | ≥ 90 % (ook voldoende voor uitkomst B-voorwaarde 2) |

Missers (10):

| Product | Gekregen | Verwacht | Betwistbaar (vooraf gemarkeerd) |
|---|---|---|---|
| brioche | overig | brood & gebak | nee |
| kipsaté | pasta, rijst & wereldkeuken | vlees & vis | nee |
| ossenstaart | brood & gebak | vlees & vis | nee |
| doperwten | groente & fruit | houdbaar | nee |
| sardientjes | vlees & vis | houdbaar | nee |
| pesto | pasta, rijst & wereldkeuken | houdbaar | nee |
| ijslollies | overig | diepvries | nee |
| hamsterkorrels | vleeswaren & kaas | huisdieren | nee |
| sandwichspread | overig | ontbijt & beleg | ja |
| cashewnoten | houdbaar | snacks | ja |

Opmerking aan de Engineer (geen voorwaarde voor vrijgave, wel nuttig): "-staart", "-korrels" en "-lollies" als kop worden verkeerd of niet herkend; conserven in het meervoud/verkleinwoord (sardientjes) en "pesto" zijn dunne plekken. Omdat de score op de grens zit, is een kleine marge-verbetering gewenst voordat de oplevering wordt gedaan, maar de procedure is gehaald.

Ter informatie op de nieuwe code: set 2 (bekend) 97 %, set 3 (bekend) 94 %, openbare set 99–100 %.

**Hertest van de vijf missers uit ronde 3** (alle vijf nu correct): boter ongezouten → zuivel & eieren; hamlappen → vlees & vis; rijstepapier → pasta, rijst & wereldkeuken; zoute stengels → snacks; bleekwater → huishouden. De Engineer-tests voor de regels staan in `categorize.test.ts` ("D-ET-07 ronde 3").

## C. Regressie (nieuwste code)

| Commando | Resultaat |
|---|---|
| `npm test` | 68 suites geslaagd, 1 overgeslagen (live-rooktest, bewust); **408 tests geslaagd, 0 gefaald** |
| `npm run typecheck` | 0 fouten |
| `npm run test:handles` | schoon (408 geslaagd; geen open handles) |
| `npx expo-doctor` | 21/21 |
| `npm run check:deps` | "Dependencies are up to date" |
| `npx expo export --platform ios` / `android` | geslaagd (4,0 MB / 4,3 MB Hermes) |

**Wijzigingen in `test/acceptance/` sinds ronde 3:** geen. Gecontroleerd op wijzigingsdatum: de laatste wijzigingen zijn van mij in ronde 3 (`resilience.test.ts`: commentaar na het verwijderen van `test.failing`; `ui-screens.test.tsx`: zichtbare bevestiging "Code gekopieerd" en unieke labels). Alle andere bestanden zijn ongewijzigd. Er staat geen `test.failing` meer.

## D. README-hertest (O-ET-10)

Alle drie opgelost: §9 noemt de optionele `LIVE_RELAYS=1`-rooktest en zegt dat de standaardrun geen echte relays gebruikt; bij de SDK-melding staat "Geen ontwikkelaar? … vraag hulp aan een ontwikkelaar"; bij een afgebroken QR-code staat "maak het Terminal-venster breder". De eerdere README-punten (projectmap, Node, vulnerabilities, Ctrl+C) blijven opgelost. De README noemt het restpunt F-08 niet; dat is niet nodig bij uitkomst A.

## E. Status van elk defect

| ID | Ernst | Status |
|---|---|---|
| D-ET-07 (F-08) | major | **Opgelost / gesloten**: blinde set 4 = 90,0 % (zonder betwistbaar 90,8 %), uitkomst A. Marge smal; zie opmerking in §B |
| D-ET-05 (retry na weigering) | minor | Gesloten (ET-S17-1 groen) |
| D-ET-06 (kopieerbevestiging) | minor | Gesloten (ET-F13-2) |
| D-ET-08 (expo-doctor) | minor | Gesloten (21/21) |
| O-ET-09 (labels) | minor | Gesloten (ET-UX09-2) |
| O-ET-10 (README) | minor | Gesloten |
| O-ET-04 (één relay + kwaadwillende relay) | info | Informatief, geen actie |
| D-ET-01, O-ET-02 | — | Gesloten (eerder) |

Geen open blocker, major of minor. Eén informatiepunt (O-ET-04) en de opmerking over de smalle F-08-marge.

## F. Definition of Done (REQUIREMENTS §8)

| # | Punt | Oordeel |
|---|---|---|
| 1 | Alle Must-eisen groen; geen open blocker/major | **PASS** voor alle automatisch te toetsen eisen (F-08 via uitkomst A). **Voorwaarde:** H-01..H-07 door Nick bevestigd (handmatige verificatie van o.a. F-13, F-14, S-01, S-02, S-03, S-07, S-08, S-12, UX-02..04) |
| 2 | `tsc` 0 fouten | PASS |
| 3 | `jest` volledig groen met resultaat per eis-ID | PASS (408/408, 1 bewust overgeslagen) |
| 4 | `expo export` iOS en Android | PASS (doctor 21/21) |
| 5 | TEST_REPORT met scope, resultaten, defecten, handmatige scenario's | PASS voor het rapport; de handmatige scenario's staan in `docs/HANDMATIGE_TEST.md` en wachten op Nick |
| 6 | README conform DoD, gevolgd op een schone checkout | PASS (ronde 3 gevolgd; ronde 4 gewijzigde secties herlezen) |
| 7 | ARCHITECTURE bijgewerkt (v1.0.1); APPROVALS Goedgekeurd | ARCHITECTURE PASS. APPROVALS: eindakkoord en oplevering volgen na de uitkomsten van Nick (procedureel) |
| 8 | Geen geheimen of persoonsgegevens | PASS |

## G. Voorwaarden die nog openstaan

1. **Nick** voert H-01..H-07 uit (`docs/HANDMATIGE_TEST.md`) en meldt Ja/Nee per scenario. Een sync-, offline- of koppelfout krijgt voorrang en leidt tot een nieuwe regressieronde.
2. Eindakkoord Projectleider en APPROVALS (procedureel).
3. Aanbeveling: de Engineer verbetert de dunne F-08-plekken uit §B nog even (marge boven 90 %); dat is geen voorwaarde en vraagt geen nieuwe verborgen set, tenzij de Projectleider dat wil.

---

# Addendum CR-01/CR-02 (2026-10-07): swipe om te verwijderen (UX-15, UX-16)

Basis: REQUIREMENTS v0.5, `git diff 2020b20`, de Engineer-fix voor Architect-bevinding S-1 (volledige swipe via Pan-gesture, drempel 50 % van de rijbreedte, `friction` 1) en D-37. Tests: `test/acceptance/ui/ui-swipe.test.tsx` (29 tests, echte facade en hub, echte componenten). De volledige swipe wordt nagebootst met de gebaar-testtools van gesture-handler (layout van 393 pt, daarna `fireGestureHandler` met vingerafstand), niet met een nagemaakte translatiewaarde; de eerdere variant was maskerend en is vervangen. Een echte vinger bestaat in Jest niet: het gevoel van het gebaar is [handmatig] (H-08 in `docs/HANDMATIGE_TEST.md`).

## Resultaat per criterium

**UX-15 (item verwijderen)**

| Criterium | Oordeel | Test |
|---|---|---|
| Swipe naar links toont rode actie "Verwijderen"; dicht = niet bereikbaar; alleen openen verwijdert niets | PASS | ET-UX15-1 |
| Tik op de actie verwijdert direct via de facade; geen dialoog; snackbar "Ongedaan maken" | PASS | ET-UX15-2 |
| Volledige swipe verwijdert direct; drempel 50 %: 47 % niet, 53 % wel; korte veeg, veeg naar rechts en terugslepen vóór loslaten verwijderen niets; ook bij al open rij | PASS | ET-UX15-3, 3b, 3c, 3d |
| Werkt voor afgevinkte en niet-afgevinkte items | PASS | ET-UX15-4, ET-UX15-9 |
| Ongedaan maken herstelt exact hetzelfde item (id, hoeveelheid, eenheid, notitie, afgevinkt); herhaalbaar | PASS | ET-UX15-4, ET-UX15-5, ET-UX15-11 |
| R-DEL: tombstone met HLC hoger dan elke andere wijziging | PASS | ET-UX15-6 |
| Verwijdering en herstel synchen naar het tweede apparaat | PASS | ET-UX15-12 |
| Maximaal één rij open (tweede swipe, tik op een rij, scrollen sluiten) | PASS | ET-UX15-7 |
| Afvinken met een tik blijft werken, ook als een rij open staat; scrollen sluit | PASS | ET-UX15-7, ET-UX15-8 |
| Accessibility action "Verwijderen" op elke itemrij, zelfde uitwerking; onbekende actie doet niets | PASS | ET-UX15-9 |
| Bewerkscherm houdt zijn verwijderknop | PASS | ET-UX15-10 |
| Tekst uit `strings.nl.ts` (UX-01) | PASS | ET-UX15-1; `strings.test` |
| Gevoel van het gebaar (drempel, snelheid, scrollen zonder per ongeluk te swipen); tik op een open rij op een echt toestel | **Nog te doen door Nick (H-08)** | — |

**UX-16 (lijst verwijderen)**

| Criterium | Oordeel | Test |
|---|---|---|
| Swipe toont rode actie "Verwijderen"; openen verwijdert niets | PASS | ET-UX16-1 |
| Tik op de actie toont altijd de bevestiging uit UX-07 (annuleren/verwijderen) | PASS | ET-UX16-2 |
| Volledige swipe verwijdert nooit zonder bevestiging; korte veeg of terugslepen opent niets; 53 % opent de bevestiging | PASS | ET-UX16-3, 3b, 3c |
| Annuleren laat de lijst staan, roept de facade niet aan, sluit de rij | PASS | ET-UX16-4 |
| Bevestigen verwijdert; lijst verdwijnt uit het overzicht; laatste lijst geeft de lege toestand | PASS | ET-UX16-5 |
| Gedeelde lijst: tekst "alle telefoons" en "Lijst verlaten" als alternatief | PASS | ET-UX16-9 |
| Gedeeld + annuleren: niets gewijzigd op beide telefoons | PASS | ET-UX16-10 |
| Gedeeld + "Lijst verlaten": `leave` (niet `deleteList`), alleen deze telefoon, de ander houdt lijst en items | PASS | ET-UX16-11 |
| Gedeeld + "Overal verwijderen": weg op alle apparaten | PASS | ET-UX16-12 |
| Maximaal één rij open; tik op een lijst opent hem nog (en sluit de open rij) | PASS | ET-UX16-6 |
| ⋯-menu in de lijst blijft bestaan | PASS | ET-UX16-8 |
| Accessibility action "Verwijderen" op elke lijstrij; toont de bevestiging, verwijdert nooit direct | PASS | ET-UX16-7 |
| Gevoel van het gebaar op de iPhone | **Nog te doen door Nick (H-08)** | — |

## Regressie (nieuwste code)

| Commando | Resultaat |
|---|---|
| `npm test` | 70 suites geslaagd, 1 overgeslagen (live-rooktest); **452 tests geslaagd, 0 gefaald** |
| `npm run typecheck` | 0 fouten (de vier typefouten in mijn testbestand zijn opgelost) |
| `npm run test:handles` | schoon bij een rustige machine: 452 geslaagd, geen open handles. Eén eerdere run faalde op `S-14 (WS)` met de 5-s-standaardtime-out terwijl er gelijktijdig een andere testketen op dezelfde machine draaide (belasting); herhaald alleen: groen |
| `npx expo-doctor` | 21/21 |
| `npm run check:deps` | "Dependencies are up to date" |
| `npx expo export --platform ios` / `android` | geslaagd (iOS 5,2 MB, Android 5,4 MB Hermes; de bundel groeide ± 1,2 MB door reanimated en gesture-handler) |

Opmerkingen: (1) `test/setup-ui.ts` filtert in de testomgeving één exacte gesture-handler-waarschuwing weg; alle andere `console.error`-meldingen blijven zichtbaar (akkoord). (2) Aanbeveling aan de Engineer: de WS-test S-14 een ruimere time-out geven (kwetsbaar bij zware belasting); geen defect in het product.

## Defecten

Geen nieuwe defecten. Architect-bevinding S-1 (volledige swipe op een toestel) is door de Engineer opgelost en in mijn tests nu realistisch gedekt.

## Advies

**VRIJGEVEN VOOR ROOKTEST (H-08 op de iPhone van Nick).** Alle automatisch te toetsen criteria van UX-15 en UX-16 staan op PASS; de regressieketen is groen. Open voorwaarde voor oplevering: Nick bevestigt H-08 (gevoel van het gebaar: drempel, scrollen zonder per ongeluk te swipen, tik op een open rij), naast de nog openstaande bevestiging van H-01..H-07 uit de eerdere rondes.

---

# Addendum CR-03 (2026-10-08): publicatie in de App Store en Google Play (ST-01..ST-22)

Basis: REQUIREMENTS v0.6.x §6b en DoD 8b, de Engineer-wijzigingen C-1, C-2, C-4, D-ET-11, R-1, K-2, K-3, K-5, K-6 (DEVIATIONS D-38..D-46). Geen productcode gewijzigd door de Eindtester.

## 1. Tests en regressie

Nieuwe acceptatietests: `test/acceptance/store-st.test.ts` (35), `store-legacy-links.test.ts` (5), `restore-c2.test.ts` (3, C-2/R-1), `ui/ui-store-links.test.tsx` (5), plus hulpbestand `png.ts`. Bijgewerkt: ET-F14-1 en ET-F13-2 verwachten nu `boodschap://join#` (ST-10, D-43).
De `config`-tests draaien `expo prebuild` in een tijdelijke map en toetsen de gegenereerde Android-manifest en iOS-Info.plist; het screenshot-script wordt op synthetische invoer gedraaid.

| Controle | Resultaat |
|---|---|
| `npm test` | 78 suites geslaagd, 1 overgeslagen (live-rooktest); **539 tests geslaagd, 0 gefaald** |
| `npm run typecheck` | 0 fouten |
| `npm run test:handles` | schoon: 539 geslaagd, geen open handles |
| `npx expo-doctor` | 21/21 |
| `npm run check:deps` / `check:licenses` | "Dependencies are up to date" / 829 pakketten, alle licenties toegestaan |
| `expo export` ios / android | geslaagd (5,3 MB / 5,6 MB Hermes) |
| `npm run check:secrets` | **werkmap: schoon.** Git-historie: 11 treffers (niet opgelost, zie ST-15) |
| `test/acceptance/` | alleen mijn eigen bestanden en wijzigingen; de enige wijziging van de Engineer is het verwijderen van de `test.failing`-markering bij ET-ST19-1 (D-ET-11 opgelost); eerdere bestanden ongewijzigd |

Hertest: **D-ET-11** (copyrightveld) opgelost: `store/listing.json` heeft `"2026 Nick de Ronde"` (Apple) en een apart `copyrightGoogle`; ET-ST19-1 slaagt. **ET-ST06-5** (placeholder-blokkade): `KVK-NUMMER` is van de site; de pagina's tonen nu een KvK-nummer van 8 cijfers, zonder adres of postcode; de test slaagt.
C-2/R-1: `ET-C2-0..2` slagen: de test-relay weigert `authors: [""]` en `["abc"]` met `CLOSED` (zoals strfry); een herstelde telefoon (database mee, `deviceOnly`-sleutels niet) krijgt een nieuwe pubkey van 64 hex-tekens en een nieuwe device-ID, houdt lijst en items, ontvangt wijzigingen van B via die strikte relay, en B en het origineel zien de wijzigingen van de kopie; alle pubkeys op de relays zijn geldig; een gewone herstart en een tweede start van de kopie roteren niet opnieuw.

## 2. Resultaat per ST-eis

PASS = het `[auto]`-deel is aangetoond. "Nick" = [handmatig] deel dat nog bij hem ligt.

| Eis | Prio | Oordeel | Tests / opmerking |
|---|---|---|---|
| ST-01 App-ID's | M | **PASS** | ET-ST01-1: iOS en Android `nl.derondeengineering.boodschap`; geen ander ID in config |
| ST-02 Naam en identiteit | M | **PASS** (auto) | ET-ST02-1: `BOODSCHAP!`, slug `boodschap`, package `boodschap`, terugvalnaam 28 tekens. **Nick:** naamcontrole in de stores en bij BOIP |
| ST-03 Versiebeheer | M | **PASS** (auto) | ET-ST03-1: `1.0.0`, `appVersionSource: remote`, production `autoIncrement`, AAB voor Play, changelog NL en EN. **Nick/rooktest:** tweede build krijgt hoger nummer |
| ST-04 Icoon en opstartscherm | M | **PASS** (auto) | ET-ST04-1..3: iOS-icoon 1024 zonder alfa (plus donker en getint), adaptive voorgrond 1024 transparant met vorm binnen de middelste 66%, monochroom, Play-icoon 512, splash licht en donker, bronbestanden. **Nick:** uiterlijk in licht en donker |
| ST-05 Permissies en config | M | **PASS** | ET-ST05-1..3 (prebuild): alleen CAMERA en INTERNET, `RECORD_AUDIO` en `AD_ID` verwijderd, camera niet verplicht, `allowBackup` false, geen tablet, `ITSAppUsesNonExemptEncryption` gezet, geen microfoon-/tracking-/locatie-teksten, geen willekeurige netwerktoegang. (netinfo voegt bij het bouwen normale netwerkstatus-permissies toe, D-39) |
| ST-06 Privacybeleid NL en EN | M | **PASS** (auto) | ET-ST06-nl/-en/-3/-4/-5: tien punten, uitgever, contactadres, datum, taalwissel, geen adres of postcode, KvK-nummer van 8 cijfers, geen placeholder, URL's in app, listing en site gelijk. De crashrapport-/statistiekenparagraaf (C-1) breekt de ontkenningscontrole niet. **Nick:** live URL's geven HTTP 200 na publicatie van Pages |
| ST-07 Verwijzingen in de app | M | **PASS** | ET-ST07-1..6: "Privacybeleid", "Support", "Open-source licenties" (en broncode), https-URL's, licentiescherm met alle productiepakketten uit `npm ls --omit=dev` |
| ST-08 Storeteksten NL en EN | M | **PASS** (auto) | ET-ST08-*: alle velden en limieten, claims waar en toetsbaar, verbodslijst schoon, Engelse tekst noemt de Nederlandse interface, reviewnotities. **Nick/PL:** lezen |
| ST-09 Schermafbeeldingen | M | **Deels**: script PASS, beelden open | ET-ST09-1..3: feature graphic 1024x500; script maakt 1320x2868, 1179x2556 en 1080x1920 zonder alfa uit een iPhone 16-opname, NL en EN. **Nick:** ruwe beelden maken (iPhone en Android-emulator), PL beoordeelt |
| ST-10 Deellink en schema | M | **PASS** (auto) | ET-ST10-1..5, ET-F14-1, ET-F13-2: nieuw `boodschap://`; oude `bootschap://`, `BS1-` en de oude volledige deeltekst koppelen nog (gouden vectoren uit commit `2020b20`); beide schema's in app.json, manifest en plist; native-intent verwerkt beide. **Nick:** link in WhatsApp opent de app in een echte build |
| ST-11 Privacy-labels / Data Safety | M | **PASS** (auto) | ET-ST11-1..3: geen analytics-, crash-, advertentie-, attributie- of OTA-pakket (package.json, lockfile, installatie); geen HTTP-verzoeken in de app-code; document aanwezig. **Nick:** formulieren invullen |
| ST-12 Exportverklaring | M | **PASS** (auto) | ET-ST12-1: document met algoritmen, sleutel expliciet gezet. **Nick/uitgever:** bevestigt de uitkomst (geen juridisch advies); Frankrijk bewust niet bij de eerste release |
| ST-13 Leeftijdsclassificatie | M | document aanwezig | ET-ST13-1 (4+, PEGI 3). **Nick:** vragenlijsten invullen |
| ST-14 Open-source repo en licentie | M | **PASS** (auto) | ET-ST14-1..2: MIT, "Copyright (c) 2026 Nick de Ronde", gelijk aan package.json, NOTICE scheidt naam en icoon, README met EN-samenvatting, SECURITY, CONTRIBUTING, `check:licenses` groen. **Nick:** repository aanmaken en publiek zetten na ST-15 |
| ST-15 Geen geheimen/persoonsgegevens | M | **Werkmap PASS; historie FAIL (open)** | `check:secrets`: werkmap schoon (alle eerdere treffers opgelost); git-historie 11 treffers (privé commit-e-mailadres van de auteur in 3 commits; lokale paden in 5 bestanden van de eerste commit). Opgelost door het besluit B-15 (nieuwe, schone root-commit voor de publieke repo) maar **nog niet uitgevoerd**. Na de nieuwe root-commit moet de scan de historie schoon geven en meld ik dat |
| ST-16 Release-build rooktest | M | **Open (Nick)** | handmatig: H-01..H-08, deellink, camera, herstart, koude start op de echte production-build |
| ST-17 Stappenplan | M | **PASS** (documentcontrole) | ET-ST17-1: volgorde en opdrachten aanwezig (EAS login/init/build/submit, credentials, App Store Connect, Play Console, AAB, tijdlijn), `eas.json`-profielen kloppen met de tekst. De account-stappen zelf zijn zonder accounts niet uitgevoerd |
| ST-18 Geen update-dienst | S | **PASS** | ET-ST11-1: `expo-updates` niet geïnstalleerd, geen analytics-, crash-, advertentie- of attributie-SDK |
| ST-19 Uitgever, accounts, DSA | M | **PASS** (document) | ET-ST19-1: copyright "2026 Nick de Ronde" (D-ET-11 opgelost). **Nick:** DSA-gegevens als handelaar invullen in beide stores |
| ST-20 Google Play (organisatie) | M | **Open (Nick)** | Besluit B-19: organisatie-account, de gesloten test van 14 dagen vervalt. **Nick:** organisatieverificatie (D-U-N-S, identiteitsdocument) voltooien en productietoegang aanvragen |
| ST-21 Marketing en website | C | niet getest (Could) | `site/index.html` en `site/en/index.html` aanwezig |
| ST-22 Lokalisatie systeemteksten | C | **PASS** | ET-ST05-3, ET-ST22-1: `CFBundleDevelopmentRegion` nl, `CFBundleLocalizations` nl+en, camera-tekst per taal |

## 3. Definition of Done 8b (CR-03)

| # | Punt | Oordeel |
|---|---|---|
| 1 | Alle Must ST-01..ST-20 voldaan en aantoonbaar | **Gedeeltelijk**: alle `[auto]`-onderdelen PASS (behalve ST-15 historie). Open bij Nick: naamcontrole (ST-02), schermafbeeldingen (ST-09), formulieren (ST-11/12/13), repo aanmaken (ST-14), DSA-gegevens (ST-19), Google-organisatieverificatie (ST-20), rooktest (ST-16). Documenten in `docs/store/` aanwezig; goedkeuring PL volgt |
| 2 | Eerdere Must-eisen groen; volledige regressie herhaald | **PASS** (539/539, typecheck, test:handles, expo-doctor 21/21, exports) |
| 3 | ST-15 schoon vóór de repo publiek wordt, bevestigd door de Eindtester | **Open**: werkmap schoon, historie niet. De nieuwe root-commit (B-15) is nog niet gemaakt |
| 4 | ST-16 door Nick bevestigd | **Open** (Nick) |
| 5 | EAS-builds geslaagd en ingediend | **Open** (nog niet gebouwd) |
| 6 | Geen open blocker of major | **PASS**: geen open defecten; alle bevindingen in deze ronde zijn gesloten |

## 4. Defecten

Geen open defecten. Gesloten in deze ronde: D-ET-11 (copyright; ET-ST19-1), de KvK-placeholder (blokkade ET-ST06-5), R-1 (lege `authors`; ET-C2-1). Observaties: de 11 historie-treffers van `check:secrets` (ST-15), zie boven.

## 5. Advies

**VRIJGEVEN VOOR STORE-INDIENING: NEE, nog niet.** De code, de configuratie, de teksten en de bestanden zijn gereed en aantoonbaar in orde; er is geen defect meer open. Wat ontbreekt ligt buiten de automatische toets:
1. **ST-15:** de nieuwe, schone root-commit (B-15) maken; daarna draai ik `npm run check:secrets` opnieuw en bevestig dat de historie schoon is, voordat de repo publiek gaat. De privacy-URL (GitHub Pages) moet live zijn vóór indiening.
2. **Vrijgeven voor het maken van de production-builds en de rooktest** (ST-16): **JA** (VRIJGEVEN VOOR PRODUCTION-BUILD EN ROOKTEST). Nick test de echte build op zijn toestellen (H-01..H-08, deellink in WhatsApp, camera, herstart, koude start).
3. **Bij Nick:** Google-organisatieverificatie en productietoegang (ST-20), DSA-gegevens als handelaar (ST-19), naamcontrole in de stores en bij BOIP (ST-02), ruwe schermafbeeldingen (ST-09), formulieren voor privacy-labels, exportverklaring en leeftijd (ST-11/12/13), repository aanmaken en publiek zetten (ST-14).
Zodra punt 1 en de rooktest groen zijn, is het advies VRIJGEVEN VOOR STORE-INDIENING.

---

# Addendum CR-04 (2026-10-08): hoofdletter in namen (UX-17)

Basis: REQUIREMENTS v0.6.4 (UX-17), commit `0bbc080` (`src/core/capitalize.ts`, D-48) en commit `208299e` (D-49: `usesNonExemptEncryption` uit `app.json`).

## 1. Bijgewerkte acceptatietests

Na UX-17 faalden **84** van mijn acceptatietests, omdat ze nog namen in kleine letters verwachtten (`'melk'` waar nu `'Melk'` uitkomt). Werkwijze: per falend bestand heb ik de verwachte itemnamen (en de bijbehorende zoekacties, labels en meldingen) naar de weergavevorm met hoofdletter gezet; de assertions, de drempels en de scenario's zijn verder ongewijzigd. Daarna opnieuw gedraaid: 11 tests bleven falen. Van die elf heb ik de foutmelding één voor één gelezen; alle elf gingen alleen over de hoofdletter (een nog niet bijgewerkte tekst als `'van A'` of `'alleen B'`; een zoeksleutel `ids.melk` in kleine letters; een opzoeking `find(…, name)` op een gegenereerde naam; `'a1:true'`), geen enkele verborg een echte regressie. Na de laatste correcties zijn alle 197 tests van dat moment groen. Een gegenereerde naam (1000-itemslijsten) wordt in de test met een eigen uitwerking van de regel (`capName` in `helpers.ts`, inclusief de IJ-regel) opgezocht, zodat de test niet van de implementatie afhangt.
De tests van ST-12/ST-05 zijn door de Engineer bijgewerkt voor D-49 (geen encryptiesleutel meer in `app.json` of de Info.plist, wel de documentatie van de antwoorden per build); ik heb die wijziging nagelezen en akkoord bevonden.

## 2. Nieuwe tests voor UX-17

`test/acceptance/capitalize-ux17.test.ts` (9 tests) en `test/acceptance/ui/ui-capitalize.test.tsx` (3 tests):

| Criterium | Oordeel | Test |
|---|---|---|
| "bananen" → "Bananen"; alleen de eerste letter ("halfvolle melk" → "Halfvolle melk", "coca-cola light" → "Coca-cola light"); trimmen eerst; accent ("éclair" → "Éclair") | **PASS** | ET-UX17-1 |
| IJ-regel: "ijs", "ijsbergsla", "ijzer" en het toetsenbordresultaat "Ijs" → "IJs…" | **PASS** | ET-UX17-1, 5, 10 |
| Blijft gelijk: "iPhone-lader", "eBook", "pH-neutrale zeep", "IJsselmeer", "7up", "0% yoghurt", "(bio) melk", emoji vooraan, "MELK", "Melk" | **PASS** | ET-UX17-1 |
| Idempotent (tweede keer toepassen verandert niets) voor alle bovenstaande gevallen | **PASS** | ET-UX17-2 |
| Hoeveelheid eerst ontleed: "2 melk" → "Melk" ×2; "500 g kaas"; "3x appels"; "1,5 l ijsthee" → "IJsthee" | **PASS** | ET-UX17-3 |
| Notities, eenheden en categorie-ID's niet aangepast | **PASS** | ET-UX17-4 |
| Hernoemen van items en aanmaken en hernoemen van lijsten; blijft na herstart | **PASS** | ET-UX17-5 |
| Dubbel-detectie hoofdletterongevoelig ("melk" na "Melk", "MELK"), "toch toevoegen" werkt | **PASS** | ET-UX17-6, ET-UX17-11 |
| Categorie (F-08), gekozen categorie (F-09) en suggesties (F-11) hoofdletterongevoelig; één suggestie "Melk" voor "mel", "MEL", "Mel" | **PASS** | ET-UX17-7, ET-UX17-11 |
| Bestaande namen worden niet gemigreerd (kleine letters blijven na herstart en na andere bewerkingen); alleen een bewerking van de naam zelf geeft een hoofdletter | **PASS** | ET-UX17-8 |
| Een gesynchroniseerde naam behoudt de schrijfwijze van de afzender; een binnenkomende kleine-letternaam wordt niet aangepast; een hernoeming door de partner synct met hoofdletter | **PASS** | ET-UX17-9 |
| In de UI: getypt "bananen", "ijsbergsla", "2 melk", "iPhone-lader", "7up" verschijnen correct; suggestiechip met hoofdletter; nieuwe lijst "feestje" → "Feestje" | **PASS** | ET-UX17-10..12 |

## 3. Regressie

| Controle | Resultaat |
|---|---|
| `npm test` | 82 suites geslaagd, 1 overgeslagen (live-rooktest); **591 tests geslaagd, 0 gefaald** |
| `npm run typecheck` | 0 fouten |
| `npm run test:handles` | schoon (591 geslaagd, geen open handles) |
| `npx expo-doctor` / `check:deps` / `check:licenses` | 21/21 / "Dependencies are up to date" / 829 pakketten toegestaan |
| `expo export` ios en android | geslaagd |
| `npm run check:secrets` | werkmap **schoon**. De historie-scan telt alle lokale refs: 13 treffers, allemaal in de lokale, niet gepushte branches `master` en `lokale-historie` (oude commits). De branch `main` (de publieke historie, 6 commits, alleen het noreply-adres als auteur en committer) bevat geen e-mailadres of lokaal pad in de commit-metadata; de twee losse treffers in de diffs zijn voorbeeldteksten (een lokaal voorbeeldpad in de beschrijving van ST-15 en een sleutelvoorvoegsel in de scriptbeschrijving) |

## 4. Defecten en advies

Geen nieuwe defecten. UX-17 is aantoonbaar gehaald; het gedrag van de Engineer komt overeen met de eis, ook bij de randgevallen.
Het advies voor ST-15 en de store-indiening uit addendum CR-03 blijft gelden, met de kanttekening dat de publieke historie (`main`) schoon is zolang alleen `main` wordt gepusht; de lokale branches mogen niet worden gepusht.
