# Codereview Architect — fixes M1–M3b, M4 (UI) en M5 (README)

- **Reviewer:** Architect
- **Datum:** 2026-10-06
- **Getoetst tegen:** ARCHITECTURE v0.3, REQUIREMENTS v0.3.1, `docs/reviews/review-architect-code-M1-M3b-response.md`, DEVIATIONS D-20..D-29
- **Eigen controle:**
  - `npm test`: 60 suites, 321 geslaagd en 1 overgeslagen (live-rooktest);
  - `npm run test:handles` (`--detectOpenHandles --runInBand`): schoon, zonder "open handle" en zonder "did not exit";
  - beide `tsc`-runs: schoon.

## Status: AKKOORD MET OPMERKINGEN

Alle vijftien bevindingen van de vorige review zijn correct opgelost. Elke fix heeft een test die zonder de fix faalt, en het open-handle-lek is weg. M4 loopt netjes via de facade, en de wss-regel en `allowInsecureRelays = false` gelden in productie.

Er zijn drie nieuwe **belangrijke** bevindingen (N1–N3).
- **N1 en N3** (pause/resume-race en de pollinglus op het deelscherm) raken de rooktest direct (H-01, H-02 en H-06). **Los ze op vóór de rooktest met Nick.**
- **N2** (twee engines tegelijk) moet uiterlijk vóór de oplevering opgelost zijn.

De kleine bevindingen mogen in M5.

---

## 1. Verificatie van de fixes (bevindingen 1–15, D-ET-01, O-ET-02)

| # | Fix in code | Test | Oordeel |
|---|---|---|---|
| 1 | `rollbackFloor` zet in dezelfde transactie `last_event_*` op NULL/0 (`BootschapApp.ts:845-847`); `resendExisting` slaat rijen zonder `lastEventId` over (`Publisher.ts:312`); een heruitzendtimer controleert `lastEvent` | `review-fixes.test.ts:15` (EOSE tijdens de herflush, relay zou `e` accepteren) | **Correct** |
| 2 | `remember()` pas na verify én AEAD (`Receiver.ts`, stap 4–5) | `:62`: vervalste kopie via A, het echte event via B wordt gemerged | **Correct.** Kanttekening: een event met een ongeldige handtekening wordt bij elke levering opnieuw geverifieerd. Dat kost CPU maar is acceptabel, omdat relays zelf ook verifiëren. |
| 3 | `kick()` doet niets tijdens `connecting` (`RelayConnection.ts:149`); verbindingstimer gewist in `pause()` | `:83` | **Correct** |
| 4 | `rebuildTransport()` na `join` met nieuwe hints en na `setRelays` (`BootschapApp.ts:674`, `:712`, `:720-730`) | `:157`, `:176` (WS, zonder herstart) | **Correct**, maar zie N2 (gelijktijdigheid) |
| 5 | `COMMIT` in de `try`, met `ROLLBACK` in een eigen try (`Repository.ts`) | `:103` | **Correct** |
| 6 | Timersets in WsTestRelay, Publisher, NostrTransport en RelayConnection | `npm run test:handles` schoon (zelf gedraaid) | **Correct** |
| 7 | `prevId` + pure `rollbackTarget` (`Publisher.ts:633-649`), stopt bij `prev.version !== newFloor` | `:122` (lokvogel met dezelfde versie) | **Correct.** Na een terugrol is `prevId` null, zodat de keten nooit over een terugrolgrens heen gaat. |
| 8 | `relayAllowed`: `wss://` altijd, `ws://` alleen met `allowInsecureRelays` (standaard `false`, `config.ts:69`, nergens in productiecode op `true`) | `:191` | **Correct** (zie K-6 over de regex) |
| 9 | Volgorde lengte → controlesom → versie | `sharecode.test.ts` | **Correct** |
| 10 | Maximaal 4 generaties | `:205` | **Correct** |
| 11 | Batch-`SELECT … IN` (400 per batch) | `:214` (< 20 statements bij 1000 items) | **Correct** |
| 12 | Eindherstart in `runScenario` | `convergence.test.ts` | **Correct** |
| 13 | `reason: 'geen-antwoord'` | `status.test.ts` | **Correct** |
| 14 | `loadCrypto` vult `nostr_pubkey` en `members` aan | `:230` | **Correct** |
| 15 | `pauseBudgetMs` + `urgent` | `:256` | **Correct**, maar zie N1 (pause/resume-race) |
| D-ET-01 | `resume()` en `syncNow()` resetten de eigen-staatcontrole vóór `kick()`; een open relay krijgt een nieuwe REQ, gevolgd door EOSE en de controle | `ET-S10-4` (Eindtester), nu `it` | **Correct** |
| O-ET-02 | Een zombie-`setTimeout` geeft `null` (bevriezen) | `:278` | **Correct** |
| DTO's | `CategoryId`, `AppErrorCode`, `'geen-antwoord'` | typecheck | **Correct** |

## 2. Afwijkingen D-20 t/m D-29

| ID | Oordeel | Toelichting |
|---|---|---|
| D-20 transport opnieuw opbouwen in plaats van `setEndpoints` | **Goedgekeurd** onder voorwaarde N2 | Houdt de Transport-interface stabiel. Lopende `inFlight`-antwoorden vervallen bij de rebuild. Dat is veilig: de eigen-staatcontrole van de nieuwe engine verstuurt opnieuw, en een relay die het event al had, antwoordt `duplicate`. |
| D-21 `allowInsecureRelays` | **Goedgekeurd** | Standaard `false`. Alleen de test-fabrieken zetten de vlag aan. |
| D-22 `pauseBudgetMs` en `urgent` | **Goedgekeurd** onder voorwaarde N1 | |
| D-23 zombie bevriest | Goedgekeurd | Precies de bedoeling van K-1. |
| D-24 korte samenstellingskoppen `ijs` en `jam` | Goedgekeurd | Een expliciete allowlist houdt vals-positieven buiten. |
| D-25 `prevId` / `rollbackTarget` | **Goedgekeurd** | Voorwaarde 7 van D-03 is daarmee vervuld. D-03/D-03b zijn nu onvoorwaardelijk goedgekeurd. |
| D-26 eigen SVG-iconen | Goedgekeurd | Geen nieuwe dependency. |
| D-27 wissen en item verwijderen direct, met undo-snackbar | Goedgekeurd | Conform §12.1, en F-07 is gebouwd. |
| D-28 `nativeAlert`, Android niet wegtikbaar | Goedgekeurd | Voorkomt een `confirmDestructive`-promise die nooit oplost. |
| D-29 Could-eisen niet gebouwd (UX-12, UX-14, F-20, F-21) | Goedgekeurd (technisch) | Dit is een scope-besluit van de Projectleider. F-19 is gebouwd. |

Ik neem ze in M5 over in ARCHITECTURE (§6.8, §6.10, §10, §11, §12).

## 3. Review M4: bevindingen

### Belangrijk

**N1. Een `resume()` tijdens een lopende `pause()` wordt teniet gedaan: de app blijft op de voorgrond gepauzeerd.**
`src/sync/engine/SyncEngine.ts:164-181` en `:183-195`, `src/ui/platform/appState.ts:8-9`, `src/service/BootschapApp.ts:318-321`

`background()` wacht eerst op de schrijfwachtrij en dan op `pause()`. Dat duurt maximaal 3 s (budget) plus de wachtrij. Komt de gebruiker in die tijd terug (snel wisselen tussen apps, of het deelmenu van een andere app), dan:
- zet `foreground()` → `resume()` `paused = false` en doet het een `kick()`;
- maar na de `await`s zet `pause()` alsnog `paused = true` en sluit hij de transport.

De app staat dan op de voorgrond met de status "Offline" tot de volgende overgang in `AppState` of het netwerk. Dat raakt S-13 (sync bij de voorgrond) en de rooktest (H-02, H-06).

**Fix:**
- een pause-generatie: `resume()` verhoogt een teller, en `pause()` controleert na elke `await` of de generatie nog dezelfde is. Zo niet, dan stoppen zonder te sluiten;
- of: `background()` en `foreground()` serialiseren in de facade, waarbij een `foreground` die tijdens `background` binnenkomt na afloop een `resume()` uitvoert.

**Test:** `background()` starten, binnen 100 ms `foreground()` aanroepen, daarna alle virtuele tijd laten lopen. Verwacht: de transport is open, de status is niet `offline`, en een wijziging komt aan.

**N2. `ensureEngine()` en `rebuildTransport()` zijn niet single-flight: twee gelijktijdige aanroepen maken twee transports en engines.**
`src/service/BootschapApp.ts:288-307`, `:623-628` en `:720-730`

Zowel `ensureEngine` als `ensureTransport` controleren eerst of er al iets is, maar wachten (`await repo.read`, `loadCrypto`) voordat ze het veld zetten. Komen twee aanroepen samen, dan:
- worden er twee transports en twee engines gemaakt;
- blijft de eerste met open sockets, timers en een eigen Publisher draaien en publiceert hij dezelfde lijsten. De single-flight per lijst (B-2) geldt dan per engine, niet per app.

Dit kan bijvoorbeeld gebeuren bij `init()` (achtergrondstart) samen met `join`/`share`, bij `setRelays` samen met `join` met hints, of bij `rebuildTransport` samen met `foreground`.

De CAS in `persistFlush` voorkomt dat de vloer-invariant breekt, maar het blijft een lek van sockets en batterij en geeft dubbele events.

**Fix:** één `enginePromise` (single-flight) en een async-mutex om `rebuildTransport` en `ensureEngine` heen.

**Test:** `Promise.all([join(code met hints), setRelays([...]), share(x)])` → precies één open transport en één engine (tel `connectionsAccepted` per relay en de `onStatus`-abonnementen).

**N3. Het deelscherm komt in een eindeloze `shareInfo`-lus zolang de lijst niet "klaar om te koppelen" is.**
`app/lijst/[id]/delen.tsx:32-39`

Het effect hangt af van `info`, en elke `shareInfo()` levert een nieuw object op. `setInfo` start het effect dus meteen opnieuw. Zonder ack, bijvoorbeeld offline of als alle relays weigeren, draait dit continu: twee SQLite-reads per ronde, plus re-renders. Dat kost CPU en batterij (NF-11) precies tijdens H-01.

**Fix:** alleen afhangen van `status` (en `info?.ready`), of een timer van 1–2 s met `clearTimeout`, of alleen `setInfo` aanroepen als `ready` verandert.

**Test:** een rendertest (ui-project) met een nep-`shareInfo` die `ready: false` teruggeeft → binnen 1 s niet meer dan een handvol aanroepen.

### Klein

**K-1. Het deelgeheim blijft op het klembord staan.** `app/lijst/[id]/delen.tsx:66-68`, `app/koppelen.tsx:117`.
"Kopieer code" zet de volledige deeltekst (met het geheim) op het klembord. Die blijft daar staan, ook in de klembordgeschiedenis van Android en toetsenborden, en in het universele klembord van iOS. NF-05 eist dit niet letterlijk, maar het past bij B-02.
- **Advies:** na een geslaagde `join` het klembord leegmaken als het de code bevat. Kort vermelden in de README (§6).

**K-2. 1000 items: elke wijziging maakt alle `ItemView`-objecten opnieuw, waardoor `memo(ItemRow)` niets uitmaakt.**
`src/service/StateCache.ts:62-65`, `src/core/crdt/materialize.ts`, `app/lijst/[id].tsx:90-92`
- `materialize` maakt bij elke wijziging nieuwe objecten voor alle items.
- `sections` wordt inline gemapt en `renderItem` is een inline functie.
- Bij een afvinkactie op een lijst van 1000 items: materialiseren en sorteren van alles, plus een hertekening van ±150 rijen in het venster.

**Advies:**
- `ItemView` hergebruiken per ongewijzigde `ItemState` (`WeakMap`);
- `sections` met `useMemo`;
- `renderItem` met `useCallback`;
- `version` per lijst in plaats van globaal.

Meet dit in de rooktest (NF-10, Should; "afvinken direct", UX-04).

**K-3. `AppProvider` sluit de app niet af bij het opruimen** — `src/ui/AppContext.tsx:44-47`.
Bij Fast Refresh in Expo Go draaien er dan twee `BootschapApp`'s met elk een eigen SQLite-verbinding en mutex op hetzelfde bestand, plus dubbele sockets. Dat geldt alleen in ontwikkeling, maar Nick test juist in Expo Go.
- **Advies:** `app.shutdown()` aanroepen in de cleanup, en ook als `alive` false is na `init()`.

**K-4. De camera scant na een fout dezelfde QR direct opnieuw** — `app/koppelen.tsx:42-43` en `:82-86`. Er volgt een herhaalde `join` en de foutmelding knippert.
- **Advies:** een pauze van ±2 s, of pas opnieuw scannen na een tik op "Opnieuw".

**K-5. `fontFamily: 'Courier'` bestaat niet op Android** — `app/lijst/[id]/delen.tsx:94`.
- **Advies:** `Platform.select({ ios: 'Courier', android: 'monospace' })`.

**K-6. De regex van `relayAllowed` is niet verankerd aan het einde** — `src/service/BootschapApp.ts:703-704`.
`"wss://host iets"` komt erdoor. Het instellingenscherm valideert strenger, maar de facade is de grens. Gebruik `^wss:\/\/[^\s/]+(\/\S*)?$`.

**K-7. Bij een startfout is er geen "Opnieuw proberen"** — `src/ui/AppContext.tsx:43`.
Het foutscherm blijft staan tot een herstart. Voeg een knop toe die het effect opnieuw uitvoert.

**K-8. De README noemt bij een SDK-mismatch alleen `expo install --fix`** — `README.md:19`.
Verwijs voor ontwikkelaars ook naar de testketen (Jest 30, §4.3), anders falen de tests na de upgrade.

## 4. Specifieke controles M4

| Controle | Bevinding |
|---|---|
| UI uitsluitend via de facade, `{result, committed}` | **Ja.** `store.ts` roept alleen `BootschapApp` aan. `committed` wordt via `watch()` opgevangen, en fouten komen via `onError` (UX-05). Schermen lezen `app.view()`, `app.lists()`, `app.relays()` en `app.shareInfo()`, en importeren niets uit `storage` of `sync`. Ook de dubbel-detectie (F-17) is goed aangesloten. |
| AppState en NetInfo | Aangesloten (`platform/appState.ts`, `netInfo.ts`): `active` → `foreground`, `background` → `background`, `inactive` genegeerd, NetInfo false→true → `networkRestored`. **Behalve N1.** |
| Transport herbouwen na koppelen en `setRelays` | Ja (bevinding 4). **Behalve N2.** |
| `wss://` afgedwongen; `allowInsecureRelays` uit in productie | Ja. `config.ts:69` `false`; `createApp.ts` geeft geen override mee; nergens in `src`/`app` op `true`. Hints met `ws://` worden genegeerd. Kleine verbetering: K-6. |
| Geheimen in logs of op het klembord | Logs: alleen codes (`devLogger`, alleen in `__DEV__`; selftest logt `selftest.ok`/`fail`). Er staat geen deelcode of geheim in de route-state (`+native-intent` via het geheugen). Klembord: K-1. |
| Expo Go/Hermes: polyfill-volgorde | `index.ts` importeert `./src/polyfills` vóór `expo-router/entry`. Import-evaluatie volgt de bronvolgorde, dus dit is goed. `TextDecoder` komt van Expo winter (E-10). De selftest maakt fouten zichtbaar in de rooktest. |
| Expo Go/Hermes: camera | `useCameraPermissions`, de vraag pas op het koppelscherm (UX-11), verwijzing naar plakken bij weigering (UX-06). `app.json` heeft de tekst voor de camerapermissie, alleen relevant voor builds. Expo Go gebruikt zijn eigen tekst. Dit is in orde. |
| Prestaties bij 1000 items | `SectionList` met `initialNumToRender 30` en `windowSize 11`, en `memo(ItemRow)`. De memo werkt echter niet door nieuwe objecten (K-2). De merge-kant is opgelost (bevinding 11). Meten in de rooktest. |
| M5 README | Volledig volgens DoD 6: Node-versie, Expo Go, starten, koppelen met scannen en plakken, de waarschuwing dat een link de app in Expo Go niet opent (besluit PL), privacy en wat relays zien, testcommando's, bekende beperkingen en EAS. Kleine aanvulling: K-1 en K-8. |

## 5. Conclusie en volgorde
1. **Vóór de rooktest met Nick:** N1 en N3, met tests.
2. **Vóór de oplevering (M5-akkoord):** N2 met een test, plus K-1 tot en met K-8 (of gemotiveerd laten liggen in DEVIATIONS).
3. **Daarna:** werk ik ARCHITECTURE bij naar de code (DoD 7): D-01..D-29, `SyncHost`, DTO's en §12-details.

---

## 6. Hercontrole na de fixes (2026-10-06)

Gebaseerd op `review-architect-code-M4-M5-response.md` en DEVIATIONS D-30..D-32.

**Eigen controle:** `npm test` geeft 66 suites, 382 geslaagd en 1 overgeslagen (live-relays). `tsc` is schoon.

**Status: AKKOORD.**

| # | Fix | Test | Oordeel |
|---|---|---|---|
| N1 | `SyncEngine.lifeGen`: `resume()` verhoogt de generatie en zet `urgent`/`paused` terug; `pause()` sluit na de `await`s alleen bij een ongewijzigde generatie (`SyncEngine.ts:166-186`) | `review-fixes-m4.test.ts` › N1 (relaylatentie 1 s, `foreground` na 100 ms → transport open, niet offline, wijziging komt aan) | **Correct** |
| N2 | `serialLifecycle` om `ensureTransport`, `ensureEngine` en `rebuildTransport`, met `*Unlocked`-varianten binnen de sectie, dus zonder re-entrancy (`BootschapApp.ts:293-307`, `:639-647`, `:740-751`) | › N2 (`Promise.all` van join, setRelays en 2× share → 1 transport, 1 engine) | **Correct** |
| N3 | `useShareInfo`: één keer `share()`, daarna `shareInfo()` alleen bij een gewijzigde statussleutel zolang niet klaar; `setInfo` alleen bij `ready` | `review-m4.test.tsx` › N3 (≤ 3 aanroepen per seconde; "klaar" wordt opgepikt) | **Correct** |
| K-1 | `clipboard.ts` wist een deelcode na koppelen; README §6 legt het uit | review-m4 › K-1, `readme.test` › K-1 | Correct |
| K-2 | `ItemView`-cache in een `WeakMap`; `useMemo`/`useCallback` in het lijstscherm | rendertelling: 1000 rijen, afvinken → 1 rij-render | **Correct**. De invariant "ItemState is onveranderlijk" staat nu in §5.5. |
| K-3..K-8 | shutdown bij unmount, `scanGate`, `monoFont`, verankerde wss-regex, retry, README-testketen | review-m4 en review-fixes-m4 › K-3..K-8 | Correct |

**Afwijkingen:** D-30 (single-flight lifecycle) en D-31 (pause-generatie) zijn **goedgekeurd**. D-32 (`ItemView`-cache) is **goedgekeurd**, met de immutability-invariant uit §5.5 als voorwaarde voor toekomstige wijzigingen. Daarmee zijn ook de voorwaarden bij D-20 en D-22 vervuld.

**ARCHITECTURE v1.0** is bijgewerkt naar de code (DoD 7). Het bevat §3 en §10 volgens de code, alle afwijkingen D-01..D-32 in §18 en de genoemde secties, de normatieve review-fixes, en de stand van de mijlpalen.

Er staan geen open bevindingen van de Architect meer open op de code. Volgende stap: de rooktest met Nick (H-01..H-07).
