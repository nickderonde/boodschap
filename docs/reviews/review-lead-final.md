# Eindoordeel Projectleider

Datum: 2026-10-07. Basis: REQUIREMENTS v0.4, ARCHITECTURE v1.0.1, `docs/TEST_REPORT.md` (ronde 3), `docs/reviews/review-architect-code-M4-M5.md`, `docs/DEVIATIONS.md` (D-01..D-35).

## Eindoordeel: VRIJGEVEN VOOR DE ROOKTEST MET NICK (H-01..H-07)

Niet vrijgegeven voor oplevering: eerst F-08 (besluit hieronder) en de uitkomsten van Nick.

Feiten: 394 tests groen, `tsc`, `test:handles` en `expo-doctor` (21/21) schoon, `expo export` voor iOS en Android werkt, en de README is op een schone kopie gevolgd. Alle Must-eisen in F, S, NF en UX staan op PASS, behalve F-08. Er is geen blocker en één major (D-ET-07).

## 1. Besluit F-08 (Must, automatische categorie)

Stand: de verborgen sets 2 en 3 haalden 88% en 87%. Set 2 haalt nu 99%, maar die is niet meer blind. In set 3 zijn 5 missers duidelijk fout en 8 betwistbaar (95% zonder de betwistbare).

**Uitgangspunt.** F-08 blijft Must en wordt niet verlaagd tot Should. Automatisch indelen is een kernbelofte van "Listonic-niveau", en de gebruiker merkt een lage score direct bij elk toegevoegd product. De schade van een misser is wel beperkt:
- het product staat op de lijst en gaat nergens verloren;
- het staat alleen in een andere groep;
- F-09 (Must, PASS) onthoudt de eerste correctie van de gebruiker voor dat product, dus dezelfde misser komt niet twee keer voor;
- de sync is er niet door geraakt.

**Aanpak (akkoord met het voorstel van de coördinator).** De Engineer lost de vijf duidelijke missers op een algemene manier op, met de patronen die de Eindtester noemt (bepalend voorvoegsel zoals "ongezouten", "zoute", "bleek"; "water" en "-papier" als achtervoegsel; samenstellingen als "hamlappen"). Het is niet genoeg om de vijf woorden toe te voegen. De Eindtester stelt daarna een vierde, verse blinde set op die de Engineer niet kent. De Eindtester markeert **vóór** de meting welke items betwistbaar zijn, en rapporteert de score met én zonder die items. Het criterium blijft de totaalscore ≥ 90%.

**Uitkomst A: set 4 ≥ 90%.** F-08 is groen en het advies wordt VRIJGEVEN voor oplevering. De Eindtester voegt een addendum toe aan het testrapport.

**Uitkomst B: set 4 geeft 85 tot 89%.** Ik accepteer F-08 dan als bekend restpunt, onder deze voorwaarden:
1. De duidelijke missers van set 4 zijn, waar ze een algemeen patroon hebben, ook opgelost en opgenomen als regressietest.
2. De score zonder de betwistbare items is ≥ 90%. Is dat niet zo, dan geldt uitkomst C.
3. De README noemt het onder "Bekende beperkingen" in gewone taal: "Soms komt een product in de verkeerde groep; tik op het product en kies de juiste groep, dan onthoudt de app dat."
4. Nick bevestigt dit restpunt uitdrukkelijk bij de eindacceptatie. Een Must met een bekend restpunt is een afwijking van de eisen, en wijzigingen daarin vragen instemming van de klant.

**Uitkomst C: set 4 onder 85%.** Geen acceptatie. De Engineer werkt verder aan de oorzaak en de Eindtester meet opnieuw met een nieuwe set. Haalt de volgende set nog steeds geen 85%, dan leg ik het besluit bij Nick neer, met de cijfers. Ik verlaag F-08 niet zelf.

Toelichting: de cijfers zijn dus niet afgestemd op het resultaat achteraf. Het criterium van 90% voor set 4 verandert niet, en de betwistbare items worden vooraf vastgelegd.

REQUIREMENTS is op v0.4 gezet met deze procedure.

## 2. Oordeel code M4 en M5

**M4 (UI): goedgekeurd. M5 (afronding): goedgekeurd met opmerkingen.**
- De Architect heeft N1 (pause/resume-race), N2 (dubbele engine en transport) en N3 (pollinglus op het deelscherm) verifieerbaar opgelost, elk met een test die zonder de fix faalt.
- Mijn voorwaarden uit de vorige review zijn vervuld: bevindingen 1 tot 15, D-ET-01 en O-ET-02 zijn gesloten (`review-fixes*.test`), `wss://` is standaard en de convergentietest herstart de apparaten voor de vergelijking.
- UX-02, UX-03, UX-05, UX-06, UX-07, UX-10 en UX-13 zijn aantoonbaar in UI-tests van de Eindtester (ET-UX*) op de echte schermen.
- D-27 (direct verwijderen met 10 s ongedaan maken) voldoet aan UX-07, want die eis staat ongedaan maken ook toe. D-29 (UX-12, UX-14, F-20, F-21 niet gebouwd) zijn Could-eisen, dus geen afwijking van de DoD.
- Opmerkingen: README-punten O-ET-10 (zin over echte relays in §9, "vraag hulp" bij de SDK-melding, uitleg van de QR in een smal Terminal-venster). Cosmetisch, maar voor Nick bedoeld, dus vóór de oplevering.

## 3. Oordeel ARCHITECTURE v1.0.1

**Akkoord.** Het document is bijgewerkt naar de code (DoD 7), neemt D-01..D-35 en de review-fixes op, en heeft akkoord van Architect en Engineer. De afwijkingen die het gedrag raken (D-20 relays zonder herstart, D-21 wss-only, D-22 pausebudget, D-30 en D-31 lifecycle, D-35 retry na weigering) zijn in lijn met de Must-eisen. Na de F-08-fix werkt de Architect §8.1 en D-34 bij.

## 4. Voorwaarden

**Voor de rooktest met Nick (nu):**
1. Nick voert `docs/HANDMATIGE_TEST.md` uit (H-01..H-07) en meldt per scenario Ja of Nee, met screenshot en tijd bij een fout.
2. De rooktest mag parallel lopen aan de F-08-fix, want F-08 raakt alleen de groepering, niet de sync of de gegevens.
3. Wordt tijdens de rooktest een sync-, offline- of koppelfout gevonden (H-01..H-07), dan krijgt die voorrang boven F-08 en geldt een nieuw regressieronde.

**Voor de oplevering (alles moet gelden):**
1. F-08 volgens sectie 1 (uitkomst A, of B met de vier voorwaarden).
2. H-01..H-07 door Nick bevestigd als Ja, of de afwijkingen zijn opgelost en opnieuw getest.
3. README: de cosmetische punten van O-ET-10 gedaan; bij uitkomst B het restpunt in "Bekende beperkingen".
4. Na de F-08-fix een volledige regressie door de Eindtester: `npm test`, `tsc`, `test:handles`, `expo-doctor`, exports voor iOS en Android, en een addendum bij het testrapport. Geen blocker of major open.
5. De Architect werkt ARCHITECTURE bij voor de F-08-wijziging, en APPROVALS toont voor elk deliverable Goedgekeurd.
6. De Engineer past F-08 niet aan door de producten uit de verborgen sets 2 en 3 letterlijk in het woordenboek te zetten als enige maatregel; de oplossing moet algemeen werken.
