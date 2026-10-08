# Reactie Engineer op de codereview M1–M3b (Architect)

- **Datum:** 2026-10-06
- **Review:** `docs/reviews/review-architect-code-M1-M3b.md` (akkoord met opmerkingen)
- **Ook verwerkt:**
  - de review van de Projectleider (`review-lead-code-M1-M3b.md`);
  - de punten van de Eindtester uit `docs/TEST_REPORT.md`: D-ET-01, O-ET-02 en F-08.

Alle tests bij bugfixes zijn ook **negatief gecontroleerd**: ik heb de fix tijdelijk teruggedraaid en gezien dat de test dan faalt. Daarna heb ik de fix teruggezet.

## Belangrijke bevindingen

| # | Wat gedaan | Test (faalt zonder fix) |
|---|---|---|
| 1 | `rollbackFloor` zet in dezelfde transactie `last_event_id`, `last_event_raw`, `last_version` en `last_clock_derived` op NULL of 0. Het ingetrokken event is daardoor onverzendbaar; `resendExisting` en de eigen-staatcontrole slaan rijen zonder `last_event_id` al over. | `test/integration/review-fixes.test.ts` › "bevinding 1": een terugrol, daarna een EOSE tijdens het voorbereiden van het vervangende event, terwijl de relay `e` nu wél zou accepteren. Verwacht: `e` wordt nooit opgeslagen en de relay houdt het nieuwste event. |
| 2 | `Receiver`: `remember(id)` pas na een geslaagde handtekeningcontrole **én** AEAD. | "bevinding 2": een kwade relay levert sneller hetzelfde ID met vervalste inhoud; het echte event van de tweede relay wordt toch gemerged. |
| 3 | `RelayConnection.kick()` doet niets tijdens `connecting`. De verbindingstimer wordt bijgehouden en in `pause()` gewist. | "bevinding 3": drie `kick()`'s tijdens een uitgestelde open leveren precies 1 socket op. |
| 4 | **Prioriteit volgens de PL.** Na `join` met nieuwe hints en na `setRelays` (bij een gewijzigde set) bouwt de facade de transport opnieuw op (`rebuildTransport`): oude engine en transport sluiten, nieuwe engine starten. Sleutels en identiteiten blijven gelden; de eigen-staatcontrole na EOSE vult de nieuwe relays. | "bevinding 4" (WS, 2 tests): (a) A zit alleen op een eigen relay, B koppelt via de code met hints en convergeert in beide richtingen **zonder herstart**; (b) `setRelays` bereikt de transport zonder herstart. |
| 5 | `Repository.tx`: `COMMIT` staat in de `try`; bij een fout volgt `ROLLBACK` met een eigen try/catch, daarna opnieuw gooien. | "bevinding 5": alleen `COMMIT` faalt → de taak wordt afgewezen, `onError('opslaan-mislukt')`, de cache wordt herladen en de volgende schrijfactie slaagt. |
| 6 | Open handles verwijderd:<br>• `WsTestRelay`: latentie-timers in een `Set`, gewist in `stop()`;<br>• `Publisher`: de `failingAfterMs`-timer per lijst, gewist in `cancelAll`/`forgetList`;<br>• `NostrTransport`: de CLOSED-heraanmelding en `not-connected`-uitkomsten via een eigen timerset, gewist in `close()`;<br>• `RelayConnection`: de verbindingstimer gewist in `pause()`. | Nieuw script `npm run test:handles` (`jest --detectOpenHandles --runInBand`): **schoon**, zonder melding "open handle" of "did not exit" (57 suites, 305 geslaagd bij die run; ±2,5 min). |

## Kleine bevindingen

| # | Wat gedaan | Test |
|---|---|---|
| 7 | `InFlight.prevId` (het vorige laatste event van het slot). De keten volgt `prevId` en stopt zodra `prev.version !== newFloor` of de voorganger niet aantoonbaar afwezig is. Pure functie `rollbackTarget`. | "bevinding 7": een lokvogel met dezelfde versie maar níét de voorganger wordt niet gevolgd. De D-03/D-03b-tests blijven groen. |
| 8 | Alleen `wss://`. `ws://` alleen met `Config.allowInsecureRelays` (standaard `false`; de WS-tests zetten het aan voor de lokale relay). Dit geldt voor `setRelays` (geweigerd met `CommandError('relay-ongeldig')`) en voor relay-hints bij `join` (worden genegeerd). | "bevinding 8": `setRelays(['ws://…'])` wordt geweigerd; een code met een `ws://`- en een `wss://`-hint voegt alleen de `wss://`-hint toe. |
| 9 | De deelcode controleert lengte → controlesom → versie. | `sharecode.test.ts`: een tikfout in het versiebyte geeft `controlesom`; versie 2 mét een geldige controlesom geeft `nieuwere-versie`; een tikfout in het eerste teken van de tekstcode geeft `controlesom`. |
| 10 | `genLists` bewaart alleen de laatste 4 generaties. Een EOSE van een oudere generatie slaat de eigen-staatcontrole over. | "bevinding 10": na 20× `listsChanged` is de grootte ≤ 4. |
| 11 | `mergeIntoDb`: één `SELECT … WHERE id IN (…)` per batch van 400 (`dao.getItems`); alleen gewijzigde rijen worden geschreven. | "bevinding 11": dezelfde snapshot van 1000 items opnieuw mergen kost < 20 statements (zonder batch ≥ 1000). |
| 12 | `runScenario` herstart aan het eind alle apparaten. De cache wordt dan uit de database geladen, dus S-04 vergelijkt de duurzaam opgeslagen staat. | `convergence.test.ts` (200 seeds, 2/3/5 apparaten) groen. |
| 13 | `SyncStatus.reason` is uitgebreid met `'geen-antwoord'`. De Publisher onderscheidt een expliciete weigering van alleen time-outs. | `status.test.ts`: alleen time-outs → `fout` met `geen-antwoord`; `blocked:` → `fout` met `geweigerd`. |
| 14 | `loadCrypto` vult `lists.nostr_pubkey` en de eigen rij in `members` aan als de transport later ontstaat. | "bevinding 14": delen zonder transport, daarna starten mét transport → beide zijn aangevuld. |
| 15 | `pause()` is begrensd op `Config.pauseBudgetMs` (3 s): `urgent`-modus (geen I-3-wachttijd, wachters worden gewekt), een race met een budgettimer, en de ack-wachttijd binnen het resterende budget. | "bevinding 15": een flush die op het antwoord van een trage relay (6 s) wacht → `background()` klaar in ≤ 3,5 s. Zonder het budget faalt de test. |

## DTO-aanpassingen (§6 van de review)
1. `AddInput.category` en `ItemPatch.category` zijn nu van het type `CategoryId`.
2. `AppError.code: AppErrorCode = 'opslaan-mislukt' | 'lijst-verwijderd-door-ander'`.
3. `SyncStatus.reason` bevat ook `'geen-antwoord'`.

## Punten van de Eindtester
- **D-ET-01:**
  - `resume()` (voorgrond) en `syncNow()` resetten de eigen-staatcontrole vóór de `kick()`, die per open relay een nieuwe REQ stuurt. Na de EOSE wordt een relay die data verloor dus opnieuw gevuld.
  - `ET-S10-4` in `test/acceptance/resilience.test.ts` slaagt nu. Ik heb daar **alleen** de markering `test.failing` vervangen door `it`; verder heb ik niets in `test/acceptance/` gewijzigd.
- **O-ET-02:**
  - de `KillSwitch` laat een zombie-`setTimeout` na een kill niet meer gooien, maar geeft `null` terug (bevriezen in plaats van `SimulatedCrash`);
  - Test: `review-fixes.test.ts` › O-ET-02, met een kill direct na een niet-bevestigde `addItem` → geen onbehandelde rejection.
- **F-08:**
  - De oorzaak van de gemiste woorden lag in de opsplitsing: meerwoordtermen "aten" losse woorden op ("chocolade" verdween). Het woordenboek bestaat nu uit expliciete, met komma's gescheiden termen.
  - Het woordenboek is in algemene zin uitgebreid: meer producten, gangbare Nederlandse supermarktmerken per categorie en samenstellingen. IJs staat nu onder diepvries en koek bij snoep.
  - Een samenstellingskop mag nu ook `ijs` of `jam` zijn (zonder vals-positieven zoals post*zegels* → gel).
  - De F-08-test gebruikt de goedgekeurde fixture van de Eindtester (99%); de eigen fixture blijft als extra test. D-12 is gesloten.
  - Ik heb de woordenlijst niet afgestemd op de fixture van de tester: het enige resterende verschil ("tortilla wraps" → brood) heb ik bewust zo gelaten.

## Stand
- `npm test`: 57 suites, **307 geslaagd, 0 gefaald**, 1 overgeslagen (in `test/acceptance`, van de Eindtester).
- Beide `tsc`-runs zijn schoon.
- `npm run test:handles` is schoon.
