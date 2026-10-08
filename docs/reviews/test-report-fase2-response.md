# Reactie Engineer op het testrapport fase 2 (Eindtester)

- **Datum:** 2026-10-06
- **Rapport:** `docs/TEST_REPORT.md` (advies: NIET VRIJGEVEN zolang D-ET-07 openstaat)

In `test/acceptance/` heb ik alleen de markering `test.failing` van **ET-S17-1** vervangen door `it`; die test slaagt nu. Verder heb ik niets in die map gewijzigd, en de extra root in `jest.config.js` laat ik staan.

## D-ET-07 (major, F-08): verborgen set 88%

Ik heb de matcher **structureel** verbeterd, niet per woord. De volgorde staat bovenin `src/core/categorize/categorize.ts` beschreven:

1. **Bepalend voorvoegsel** (`DETERMINING_PREFIXES`). Een samenstelling of een los eerste woord dat begint met *diepvries/bevroren*, *honden/katten/puppy/kitten/vogel/konijnen/knaagdier*, *baby/peuter*, *vaatwas/afwas/schoonmaak* of *borrel* krijgt die categorie, ongeacht de kop. Voorbeelden: diepvriesframbozen, hondenkluif, babyshampoo, borrelworstjes. Een exacte woordenboekterm gaat voor (Babybel → kaas, kattentong → snoep).
2. **Misleidende koppen** (`UNRELIABLE_HEADS`: *pasta*, kruidennamen als *munt, tijm, dille, basilicum …*, *olie*):
   - Bij zo'n kop beslist het bepalende woord vóór de kop: speculoospasta → speculoos (beleg), sesampasta → sesamzaad.
   - Is dat woord alleen een algemeen bijvoeglijk voorvoegsel (`GENERIC_MODIFIERS`: volkoren, vers, bio, glutenvrij …), dan beslist de kop toch: volkorenpasta → pasta.
3. **Plakjes/beleg:** vlees of kaas met *plakjes/plakken/beleg/gesneden* valt onder vleeswaren & kaas.
4. **Bepalend begin als laatste redmiddel:** zalmmoten → zalm, kipdijen → kip.
5. **Geen boodschappen** (`NON_GROCERY`): bloemen, postzegels, cadeaukaart en dergelijke worden "overig", in plaats van "bloemen" → bloem (meel).
6. **Korte koppen:** naast *ijs* en *jam* nu ook "hagel" en "bollen" als kop in het woordenboek (vruchtenhagel, karnemelkbollen).

**Woordenboek breed uitgebreid** met gangbare producten van AH en Jumbo in alle 15 categorieën (±700 termen extra):
- bakkerij en koek: bagels, appelflappen, boterkoek, eierkoeken, broodsoorten;
- zoet beleg: hagelsoorten, jam, stroop, smeersels;
- snoep en chips met merken;
- diepvries: bladerdeeg, ijs, friet, snacks;
- dierenvoer en -artikelen: kluiven, kattengras, merken;
- vlees, vis en vega;
- huishouden, verzorging, baby, dranken, wereldkeuken en houdbaar.

Ik heb gecontroleerd dat uitbreidingstermen niet ongewild door een eerdere categorie worden overschaduwd, en de betwiste gevallen bewust gekozen:
- tortilla's/wraps → wereldkeuken (zoals AH);
- rijstwafels → bij de crackers (bakkerij);
- bladerdeeg → diepvries;
- kalkoenfilet → vlees, en "kalkoenfilet beleg" → vleeswaren.

**Overfit-controle:** op een nieuwe, eigen lijst van 96 gangbare producten (niet in de repo), die ik pas ná de regels 1–2 en de woordenboekuitbreiding opstelde, scoorde de matcher bij de eerste meting 93% (89/96). Eerlijk gezegd: daarna heb ik op basis van die missers de algemene regels 3–5 toegevoegd en drie termen gecorrigeerd (eierkoeken, waldkorn, zoute pinda's). Die lijst is daarmee ook niet meer blind. Op de openbare set van de Eindtester: 100%. Alleen een nieuwe verborgen set geeft een eerlijk oordeel.

**Tests die de regels vastleggen** (`src/core/categorize/categorize.test.ts`, blok "D-ET-07: hoe de matcher omgaat met voorvoegsels en achtervoegsels"):
- bepalende voorvoegsels;
- exacte term vóór het voorvoegsel;
- kop van de samenstelling;
- misleidende koppen en de uitzondering voor algemene voorvoegsels.

**Verzoek:** maak een nieuwe verborgen set; de vorige is bekend en dus verbrand.

## D-ET-05 (minor): status blijft op "fout" na een periode van weigeringen

Na een expliciete weigering (`blocked:`/`restricted:`/`other`) probeert de engine het nu **zelf** opnieuw bij dezelfde relay:
- schema 30 s, 1, 2 en 5 min (`Config.refusedRetryDelaysMs`), maximaal 12 keer (`refusedRetryMax`);
- daarmee blijft het binnen NF-11: geen polling korter dan 30 s, en het stopt bij een nieuwer event, bij `pause` en bij een ack.

Test: **ET-S17-1** slaagt nu (markering verwijderd).

## D-ET-06 (minor): "Code gekopieerd" niet zichtbaar

Het deelscherm (een modal) toont nu zelf de snackbar.

Test: `src/ui/screens-fase2.test.tsx` › D-ET-06 (rendert het deelscherm, drukt op "Kopieer code" en verwacht de tekst op het scherm). Zonder de fix faalt de test.

## D-ET-08: expo-doctor faalt op patchversies

`npx expo install --fix` bijgewerkt naar expo 57.0.27, expo-constants 57.0.21, expo-linking 57.0.12, expo-router 57.0.25 en expo-sqlite 57.0.4.
- `expo install --check`: "Dependencies are up to date".
- `expo-doctor`: 21/21.
- `check:deps` en `check-licenses` (825 pakketten): schoon.
- De keten hieronder is groen.

## O-ET-09: hetzelfde label voor veld en knop

Het invoerveld heeft nu het label "Nieuw adres invoeren" (`strings.relayInputLabel`); de knop houdt "Relay toevoegen". Bewust zonder het woord "relay", zodat de jargonscan ET-UX01-1 groen blijft.

Test: `screens-fase2.test.tsx` › O-ET-09. Zonder de fix faalt de test.

## README voor Nick
- **§2 Installeren:**
  - de projectmap staat al op de Mac (met een `cd` naar de projectmap); er is geen `git clone` nodig, GitHub alleen als optie;
  - Node installeren via nodejs.org (LTS) of Homebrew; minimaal **22.13**, op deze Mac staat Node 25;
  - meldingen over "vulnerabilities" mag hij negeren, en hij moet geen `npm audit fix` uitvoeren.
- **§3:** stoppen met **Ctrl+C**, en een verwijzing naar `docs/HANDMATIGE_TEST.md`.
- Test: `test/arch/readme.test.ts` › "fase 2 Eindtester".

## Volledige keten (eindrun)
- `npm test`: 69 suites, **394 geslaagd, 0 gefaald**, 1 overgeslagen (de live-relaytest van de Eindtester).
- `npm run test:handles`: schoon (geen open handles, geen "did not exit").
- `npm run typecheck` (beide configs): schoon.
- `npx expo export --platform ios` en `--platform android`: geslaagd.
- `npx expo-doctor`: 21/21. `npm run check:deps`: schoon.

---

# Ronde 3 (2026-10-07): D-ET-07 heropend (blinde set 3: 87%) en O-ET-10

## D-ET-07: oorzaken van de vijf duidelijke missers, algemeen opgelost

| Misser | Oorzaak | Algemene regel (`categorize.ts`) |
|---|---|---|
| boter ongezouten → houdbaar | het bijvoeglijk woord ("ongezouten" → kop "zout") won van het zelfstandig naamwoord | `NOISE_WORDS`: bijvoeglijke woorden (ongezouten/gezouten/zoute/droog/zoet/pikant …), verpakkings- en hoeveelheidswoorden (pak, fles, liter, maat, stuks …) en voorzetsels tellen niet mee, behalve als de hele naam zelf in het woordenboek staat (zoute drop). |
| zoute stengels → overig | idem, plus "stengels" onbekend | idem, plus snackkoppen (stengels, zoutstengels, pretzels …) |
| bleekwater → dranken | de kop "water" won altijd | "water" en "papier" zijn misleidende koppen: drank of huishouden alleen na zo'n woord (bronwater, toiletpapier staan zelf in het woordenboek); anders beslist het woord ervoor |
| rijstepapier → zuivel | het langste begin "rijstepap" won; "-papier" niet herkend | idem, plus `modifierOf` probeert eerst steeds kortere begindelen (rijste → rijst) en pas daarna, begrensd, een langere sleutel |
| hamlappen → overig | koppen "-lappen", "-filet", "-schnitzel" … ontbraken | vleeskoppen in het woordenboek (lappen, lapjes, filet, schnitzel, rollade, burgers, dijen, spiesjes …) |

Extra algemene regels, gevonden met eigen blinde controles:
- **wereldkeuken:** kruiding of saus bij een wereldgerecht ("nasi goreng kruiden", "taco kruidenmix", "nasikruiden") valt onder wereldkeuken;
- **smaakwoord achteraan** (AH/Jumbo-stijl): bij "pastasaus basilicum", "drop zout" en "hagelslag melk" bepaalt het product ervoor;
- **conserven:** groente, fruit, vlees of vis "in blik" of "in pot" valt onder houdbaar;
- **losgeschreven samenstellingen:** "koffie melk" en "zuurdesem bol" worden gelezen als één woord;
- **losse misleidende kop:** bij "chocolade pasta" telt "pasta" niet als kop, en een "-pasta" van iets zoets is beleg;
- **zachte koppen** ("-bonen", "-tabletten"): beslist het woord ervoor niets, dan telt de kop zelf. Voorbeelden: kapucijnerbonen, espressobonen;
- **ander woord als het laatste onbekend is:** dan wordt van achteren naar voren gezocht ("jonge kaas blokjes" → kaas);
- **langere sleutels** worden niet meer gezocht in de laatste stap, waar ze "droog" als "droogvoer" lazen.

**Woordenboek:** ongeveer 1.000 extra gangbare termen, vooral in de dunne categorieën: baby & kind, huisdieren, ontbijt & beleg, diepvries, zuivel en vleeswaren. Daarnaast huishouden en schoonmaak, wereldkeuken (Indisch, Aziatisch, Mexicaans, Midden-Oosten, Italiaanse pastasoorten), verzorging en snacks. Overschaduwingen gecontroleerd; kaasstengels verplaatst van vleeswaren naar snacks.

**Tests:** in `src/core/categorize/categorize.test.ts` staat het blok "D-ET-07 ronde 3", met per regel een test met meerdere voorbeelden, niet alleen de vijf missers.

**Eerlijke meting:** vóór de extra regels heb ik een eigen blinde set van 102 producten opgesteld; daarop scoorde de code **86%**. Dat bevestigde dat het om structurele gaten ging. Na de regels heb ik een tweede, nieuwe blinde set van 93 producten opgesteld en daarop eenmalig gemeten: **92,5% (86/93)**. Daarna heb ik drie algemene punten nog bijgesteld (losgeschreven samenstellingen, smaakwoorden melk/puur/pinda, en "bol"), dus ook die set is niet meer blind. De drie resterende fouten daar zijn betwistbaar: pindasaus → wereld, zoute crackers → brood, verse kruidenmix → houdbaar. Openbare set van de Eindtester: 100%. Een vierde blinde set blijft het echte oordeel.

## O-ET-10: README
- **§9:** de standaardrun praat niet met echte relays; de optionele rooktest `LIVE_RELAYS=1 npx jest test/acceptance/live-relays` wordt nu genoemd.
- **SDK-melding:** de zin "Geen ontwikkelaar? … vraag hulp aan een ontwikkelaar" is toegevoegd.
- **QR-code:** bij een afgebroken QR-code maak je het Terminal-venster breder.
- Test: `test/arch/readme.test.ts` › O-ET-10.

## Volledige keten (ronde 3)
- `npm test`: **408 geslaagd, 0 gefaald**, 1 overgeslagen (de live-relaytest).
- `npm run test:handles`: schoon.
- `npm run typecheck`: schoon.
- `expo export` ios en android: geslaagd.
- `expo-doctor`: 21/21.
- `check:deps`: schoon.
