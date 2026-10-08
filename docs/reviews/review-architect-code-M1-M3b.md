# Codereview Architect — M1 t/m M3b

- **Reviewer:** Architect
- **Datum:** 2026-10-06
- **Getoetst tegen:** `docs/ARCHITECTURE.md` v0.3, `docs/REQUIREMENTS.md` v0.3.1, `docs/DEVIATIONS.md` (D-01..D-19), `docs/PROGRESS.md`
- **Scope:** `src/core`, `src/storage`, `src/service`, `src/sync`, `test/`. De UI (M4) valt erbuiten.

## Status: AKKOORD MET OPMERKINGEN

De kern is goed gebouwd. De lagen zijn schoon en de importregels worden afgedwongen. HLC, registers, R-DEL en merge doen precies wat §5 vraagt. De versie-, vloer- en CAS-machine plus single-flight volgen §6.6 en §6.8. De tests zijn inhoudelijk en niet triviaal: crashpunten worden aantoonbaar geraakt, er zijn 200 seeds met een oracle, en B-1, B-2, I-3 en D-03 zijn negatief bewezen ("faalt zonder").

Er zijn **zes belangrijke bevindingen** (1–6). Ze blokkeren M4 niet, maar moeten met tests opgelost zijn **vóór de codereview van M4 en vóór de rooktest met Nick**. De kleine bevindingen mogen in M4 of M5.

Eigen controle:
- `npm test`: 51 suites en 220/220 groen, ±14 s parallel, ±71 s `--runInBand`;
- `npm run typecheck`: schoon;
- het lek is gereproduceerd en de oorzaak gevonden (bevinding 6).

---

## 1. Afwijkingen (DEVIATIONS.md)

| ID | Oordeel | Toelichting |
|---|---|---|
| D-01 `Transport` uitgebreid (`isOpen`, `close`, `raw`, `duplicate`) | **Goedgekeurd** | Alle vier zijn nodig en transport-neutraal. Ze komen in M5 in §10. |
| D-02 `SyncHost` | **Goedgekeurd** | Dit is de juiste uitwerking van §2: de engine kent geen SQL en geen facade, en `imports.test` dwingt dat af. Eén aandachtspunt: de host-methoden draaien elk in een eigen transactie via de `WriteQueue`. Houd ze klein en idempotent (zie bevinding 1). |
| D-03 terugrollen via een keten | **Goedgekeurd onder voorwaarde** | De redenering klopt. Een vloer mag terug naar de `floorBefore` van het oudste event in een aaneengesloten keten van aantoonbaar afwezige events, want de vloer-invariant blijft dan gelden. Het restgeval van I-3 bleek in de praktijk erger dan ik in v0.3 aannam (±45 min stilstand), en de test bewijst dat. **Voorwaarden:** de keten volgt de echte voorganger en niet een gelijke versie (bevinding 7), en terugrollen maakt `last_event_*` onverzendbaar (bevinding 1). |
| D-03b ook een laatste event dat van de vloer komt | **Goedgekeurd onder dezelfde voorwaarden** | Veilig, omdat elk element van de keten zelf bewezen afwezig is. De eis "minstens één klok-afgeleid event in de keten" voorkomt een lus: elke ronde verlaagt `offsetSec`. |
| D-04 `lastFlushEndMs` begrensd tot nu | Goedgekeurd | Terechte bugfix. |
| D-05 geen publieke sleutel zonder transport | **Goedgekeurd** | De fix is correct: er is geen terugval meer die het geheim als publieke sleutel gebruikt (`BootschapApp.ts:620-629`). `keys.test` dekt het. Restpunt: `lists.nostr_pubkey` en de eigen rij in `members` worden niet ingevuld als de transport later alsnog ontstaat (`loadCrypto`, `BootschapApp.ts:262-274`). Functioneel onschadelijk, omdat het `#d`-filter eigen events toch levert. Zie bevinding 14. |
| D-06 extra facade-methoden en `CommandError` | Goedgekeurd | Zie ook §4, DTO-typen. |
| D-07 bij een commitfout alleen lokale taken afwijzen | Goedgekeurd | Klopt met I-1. Een remote merge is onafhankelijk geldig. |
| D-08, D-09, D-10, D-11, D-13, D-14, D-16, D-18, D-19 | Goedgekeurd | Uitwerkingen zonder effect op het ontwerp. |
| D-12 voorlopige fixture F-08 | Open (Eindtester) | Correct gemarkeerd. |
| D-15 volgorde bij verlaten | **Goedgekeurd** | Eerst de lopende flush afwachten, en `persistFlush` schrijft niets voor een niet-gedeelde lijst. Dat sluit de race. |
| D-17 eigen events nooit mergen | Goedgekeurd | Een eigen event is per definitie ≤ de eigen staat. Uitzondering: een teruggezette databaseback-up, en die valt buiten v1. |

Ik neem alle goedgekeurde afwijkingen in M5 over in ARCHITECTURE (§6.8 keten, §10 interfaces, §2 `SyncHost`).

## 2. Bevindingen

### Belangrijk (oplossen vóór de M4-review en de rooktest)

**1. Na terugrollen blijft `last_event_*` het afwezige event, en de eigen-staatcontrole kan dat later toch laten opslaan. Dat breekt de vloer-invariant.**
`src/service/BootschapApp.ts:800`, `src/sync/engine/Publisher.ts:306-323` en `:482`, `src/sync/engine/SelfCheck.ts:44-48`

`rollbackFloor` zet alleen `floor_version`, `floor_before` en `published_hash`. `last_event_id`/`last_event_raw` blijven naar het teruggerolde event `e` wijzen, met een versie boven de nieuwe vloer.

Het mechanisme:
- Valt er een EOSE tussen de terugrol en het persisteren van het vervangende event, of wordt de app in dat venster gekild, dan stuurt `resendExisting` `e` opnieuw. Na de terugrol is `lastEvent` gewist (`:482`), en `resendExisting` zet hem dan weer op `e` (`:314`).
- Een relay accepteert `e` zodra zijn klok `e.version − tol` passeert.
- Het volgende eigen event heeft dan een lagere `created_at`. De relay houdt `e` vast en het slot blijft oud tot een bewerking met een versie boven `e.version`.
- Bij een gekilde app blijft dat venster tot de volgende start open.

**Fix:** zet in dezelfde transactie van `rollbackFloor` `last_event_id`, `last_event_raw` en `last_version` op NULL of 0 (of markeer ze als "ingetrokken"), en laat `resendExisting` zulke rijen overslaan.

**Test:** terugrol, dan `kill` vóór het persisteren van het vervangende event (`faults.at('after-prepare')` in de herflush), herstart, en daarna een relay die `e` zou accepteren. Verwacht: `e` wordt nooit meer verzonden en de relay houdt het nieuwste event.

**2. Dedup gebeurt vóór de handtekeningcontrole, waardoor één kwaadwillende relay geldige events van andere relays kan onderdrukken.**
`src/sync/engine/Receiver.ts:60-61`

`remember(m.id)` gebeurt vóór `verify()` en AEAD. Een relay die een event-ID met een vervalste inhoud of handtekening als eerste aflevert, zet dat ID in de dedup-set. Het echte event met hetzelfde ID wordt van eerlijke relays daarna genegeerd tot de LRU het vergeet. Dat ondergraaft de redundantie over meerdere relays (S-09, NF-02e).

**Fix:** pas `remember` na een geslaagde `verify()`, en idealiter pas na geslaagde AEAD.

**Test:** relay A levert een event met het ID van een echt event maar met een gewijzigde inhoud; relay B levert het echte event. Verwacht: B's event wordt gemerged.

**3. `kick()` tijdens `connecting` opent een tweede socket en lekt de eerste.**
`src/sync/transports/nostr/RelayConnection.ts:145-153`

`kick()` zet de state op `idle` en roept `connect(true)` aan. Een socket die al aan het verbinden is, wordt dan niet gesloten: `this.ws` wordt overschreven, en de handlers van de oude socket negeren zichzelf maar sluiten niets. Voorgrond, NetInfo-herstel en pull-to-refresh vallen in de praktijk vaak samen, dus dit gebeurt op toestellen echt. Het gevolg is een open verbinding die blijft hangen, wat batterij kost (NF-11) en meetelt voor de verbindings- en abonnementslimieten van relays.

**Fix:** in `kick()` bij `connecting` niets doen, of de bestaande socket eerst netjes sluiten.

**Test:** `kick()` tijdens een uitgestelde open → `connectionsAccepted` op de WsTestRelay is 1.

**4. Relay-hints uit een deelcode en `setRelays` bereiken de transport pas na een herstart.**
`src/service/BootschapApp.ts:609-612` (de transport wordt één keer gemaakt), `:642` (`ensureTransport` vóór het opslaan van de hints op `:651`) en `:682-686`

De transport wordt één keer gemaakt met de relayset van dat moment. Daarna wordt hij niet opnieuw opgebouwd. Een gebruiker die een code met hints koppelt (de deler heeft eigen relays), synchroniseert dus pas na een herstart via die relays, en in het ergste geval helemaal niet. F-14 belooft koppelen met de hints in de code, en §6.10 legt een globale set vast waar de hints aan worden toegevoegd.

**Fix:** na `join` met hints en na `setRelays` de transport opnieuw opbouwen. Dat betekent: de engine pauzeren, een nieuwe transport maken, `listsChanged`, en `resume`. Een alternatief is `Transport.setEndpoints()`; dat is dan een interfacewijziging die je in DEVIATIONS vastlegt.

**Test:** A gebruikt alleen `wss://custom.test`, B heeft de standaardset en koppelt via een code met hints. Verwacht: B convergeert zonder herstart.

**5. Een mislukte `COMMIT` laat de transactie openstaan, waarna alle volgende schrijfacties falen.**
`src/storage/Repository.ts:50`

Gooit `COMMIT` zelf een fout (schijf vol, I/O-fout), dan volgt geen `ROLLBACK`. De volgende `BEGIN IMMEDIATE` faalt dan met "cannot start a transaction within a transaction", en de app kan tot een herstart niets meer opslaan. UX-05 ("bij een opslagfout terugdraaien met melding") moet juist dit pad afdekken.

**Fix:** zet `COMMIT` in de try, en doe bij een fout een `ROLLBACK` met een eigen try/catch, gevolgd door opnieuw gooien.

**Test:** `CrashingSqlDriver` laat alleen `COMMIT` falen → de taak wordt afgewezen, de cache wordt herladen, en de volgende schrijfactie slaagt.

**6. Het open-handle-lek ("worker failed to exit"): timers zonder administratie.**
- **Hoofdoorzaak, test-infra:** `test/relay/WsTestRelay.ts:99`. `later()` gebruikt `setTimeout` met `faults.latencyMs`, en `stop()` ruimt die timers niet op. `test/integration/join.test.ts:92` zet een latentie van **20 s**. Daardoor blijft de worker na de suite nog ±20 s leven (gemeten: los gedraaid duurt join.test 42 s, waarvan 13 s tests, met "Jest did not exit"). Alle andere suites eindigen schoon.
  - **Fix:** timers in een `Set` bijhouden en ze in `stop()` wissen (of `.unref()` gebruiken).
- **Dezelfde klasse in productiecode.** De volgende timers vallen buiten `cancelAll` en `shutdown`, zodat een gesloten engine of transport nog callbacks krijgt:
  - `src/sync/engine/Publisher.ts:548` (status-timer na `failingAfterMs`, 30 s);
  - `src/sync/transports/nostr/NostrTransport.ts:108` (heraanmelding na `CLOSED`, 5 s);
  - `NostrTransport.ts:168` (de `not-connected`-uitkomst).
  - **Fix:** bijhouden en wissen bij `cancelAll`/`close`, of controleren op `closed`.
- **Borging:** voeg `--detectOpenHandles` toe aan een CI-variant, of een `afterAll`-controle in `test/setup-node.ts` die faalt als er nog actieve timers van de test-relay zijn.

### Klein

**7. De keten-terugrol zoekt de voorganger op versie en niet op identiteit** — `src/sync/engine/Publisher.ts:471`.
`find(x.version === newFloor)` kan na een eerdere terugrol een ouder, ook afwezig event met dezelfde versie vinden in plaats van de echte voorganger, die misschien wél ergens staat. Versies binnen een slot zijn na een terugrol niet meer uniek. De kans is klein, maar het is precies de invariant van D-03.
- **Fix:** sla in `InFlight` `prevId` op (het `lastEvent` van het slot bij `registerNewEvent`) en volg de keten via `prevId`. Stop de keten als `prev.version !== newFloor`.

**8. De relay-hints in de deelcode staan `ws://` toe** — `src/core/codec/sharecode.ts:58`.
Een (vertrouwde, B-02) deler kan zo een onversleutelde relay aan de globale set laten toevoegen. De inhoud blijft door AEAD beschermd, maar metadata en IP lekken. Sta in productie alleen `wss://` toe, en `ws://` alleen via een testconfiguratie. Hetzelfde geldt voor `setRelays` (`BootschapApp.ts:683`).

**9. De versiecontrole van de deelcode komt vóór de controlesom** — `src/core/codec/sharecode.ts:46`.
Een tikfout in het eerste teken van de tekstcode geeft nu "Werk de app bij" (`nieuwere-versie`) in plaats van "controlesom".
- **Fix:** eerst de controlesom controleren. Alleen bij een geldige controlesom met `versie > 1` volgt `nieuwere-versie`.

**10. `genLists` groeit onbegrensd** — `src/sync/engine/SyncEngine.ts:152`.
Er komt een map-item bij per generatie. Bewaar alleen de laatste paar generaties. Een EOSE van een oude generatie mag de eigen-staatcontrole overslaan (nu levert dat hooguit dubbele heruitzendingen op, omdat `selfCheck.reset()` alle leveringen wist).

**11. `mergeRemote` doet per item een eigen `SELECT` en `UPSERT`** — `src/service/BootschapApp.ts:391-398`.
Bij een snapshot van 1000 items via de asynchrone expo-sqlite zijn dat 2000 heen-en-weerrondes. Op een toestel kost dat naar schatting 0,5–2 s per ontvangen deel, en de `WriteQueue` blokkeert zolang.
- **Fix:** één `SELECT … WHERE id IN (…)` per batch, en alleen gewijzigde rijen schrijven. Meet dit in de rooktest van M4 (NF-10).

**12. De convergentietest vergelijkt de cache en niet de database** — `test/sim/scenario.ts:187-190`.
`stateOf` leest de `StateCache`. Herstart alle apparaten vóór `assertConverged` (of vergelijk ook met `readFlush`), zodat S-04 ook bewijst dat de geconvergeerde staat duurzaam is opgeslagen.

**13. `reason: 'geweigerd'` dekt ook alleen time-outs** — `src/sync/engine/status.ts:38-39`.
Na het PL-besluit is "geweigerd" bij stille relays inhoudelijk onjuist. Splits dit in `'geweigerd' | 'geen-antwoord'`, zodat de UI-tekst klopt (UX-02, rustige tekst).

**14. Na D-05 worden `nostr_pubkey` en de eigen rij in `members` niet aangevuld als de transport later ontstaat** — `src/service/BootschapApp.ts:262-274`. Vul ze aan in `loadCrypto`. Dat is cosmetisch en voor diagnose.

**15. `pause()` kan langer duren dan iOS toestaat** — `src/sync/engine/SyncEngine.ts:163-164`.
`flush` kan tot 8 s wachten op klokantwoorden (`clockWaitMaxMs`), en daar komt `backgroundAckWaitMs` nog bij. Begrens de hele `pause()` op ±3 s (bijvoorbeeld door in de achtergrond de I-3-wachttijd over te slaan).

## 3. Correctheid van de sync-kern

| Onderdeel | Oordeel |
|---|---|
| HLC (`src/core/hlc.ts`) | Correct: `now`, `observe` met een drift van 24 u, `stamp = max(now, succ(seen))` en overloop van de teller. De klok sleept niet mee met verre toekomst. |
| Registers, merge en R-DEL (`src/core/crdt/*`) | Correct en totaal geordend (gelijkspel via de canonieke waarde). R-DEL kijkt ook naar onbekende registers. `merge.property.test` dekt de wetten (S-05). |
| Codec (`src/core/codec/snapshot.ts`) | `b` = de kleinste ms, validatie per record, begrensde streaming-inflate, `__proto__` uitgesloten via `UNKNOWN_KEY_RE`. Goed. |
| Slotversie, vloer, CAS en single-flight (`Publisher.ts`) | Volgt §6.6. CAS werkt via een controle vóór het schrijven, en alle paden lopen via `flush()` met `again`-samenvoeging. Uitzonderingen: bevindingen 1 en 7. |
| Outbox en retry | Maximaal 5 retries per (event, endpoint). Retries stoppen bij een nieuwer event, en de eigen-staatcontrole vangt de rest op. Goed. |
| Multi-relay en dedup | Goed, behalve bevinding 2. De OK-classificatie (`okReason.ts`) is robuust tegen variaties in de tekst. |
| Opsplitsen | Bij `too-large` verdubbelen en een herflush. De opruimregel voor `pending_changes` is conservatief correct bij een gegroeid `S`, omdat buckets alleen verfijnen. |
| Facade (`WriteQueue`, I-1) | Deltamerge in de transactie; na een fout herladen uit de database plus de nog niet gecommitte delta's. Goed, behalve bevinding 5. |

## 4. Beveiliging
- **HKDF:** SHA-256, salt `bootschap/v1`, info `list-tag`/`enc-key`, lengtes 16 en 32 (`kdf.ts`). Conform §6.1.
- **AEAD:** XChaCha20-Poly1305 met een willekeurige nonce van 24 bytes uit `Random`. De AAD wordt door de engine gebouwd als `bootschap/v1|sender|channel:slot` (`aead.ts`) en bij openen gecontroleerd op versiebyte en lengte. Conform §6.2 en E-17.
- **Sleutels:** alleen in `KeyStore` (`AFTER_FIRST_UNLOCK`). Bij verwijderen en verlaten eerst de sleutels en dan de database. `keys.test` scant SQLite en de logs. Conform NF-04.
- **D-05:** correct opgelost (zie §1).
- **Aandachtspunten:** bevindingen 2 en 8.

## 5. Tests: echt of triviaal?
De tests zijn sterk.
- `crash.test` controleert dat elk crashpunt echt is geraakt.
- `convergence` draait 200 seeds met een HLC-oracle.
- `versions-hub` bevat negatieve bewijzen.
- De WS-varianten draaien tegen een echte socketrelay.
- `mutex.test` en `imports.test` dwingen architectuurregels af.

Wat ontbreekt:
- tests voor bevindingen 1–5;
- een S-04-controle op de database (bevinding 12);
- het ui-project heeft nog geen tests. Dat is terecht, die volgen in M4 (UX-02, UX-05 store, UX-07, UX-10).

## 6. DTO-typen (E-18), `src/service/types.ts`
**Goedgekeurd**, met drie kleine aanpassingen:
1. `AddInput.category` en `ItemPatch.category` als `CategoryId` typen in plaats van `string`.
2. `AppError.code` als een union van bekende codes (`'opslaan-mislukt' | 'lijst-verwijderd-door-ander' | …`), zodat `strings.nl.ts` volledig te controleren is (UX-01).
3. `SyncStatus.reason` uitbreiden met `'geen-antwoord'` (bevinding 13).

`Pending<T>`, `AddResult`, `JoinResult`, `ShareInfo` en `UndoToken` voldoen aan §10.
