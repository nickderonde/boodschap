# Review Engineer — `docs/ARCHITECTURE.md` v0.1

- **Reviewer:** Engineer (bouwkant)
- **Datum:** 2026-10-06
- **Getoetst tegen:** `docs/REQUIREMENTS.md` v0.2, `docs/BRIEF.md`
- **Status: AKKOORD MET OPMERKINGEN**

Het ontwerp is bouwbaar in Expo Go met SDK 57. De kern zit goed in elkaar: de HLC en merge, R-DEL, de snapshots per deel en de eigen-staatcontrole. Er is geen blokkerende bevinding.

Er zijn wel negen belangrijke bevindingen:
- twee over de pakketlijst en de configuratie (1, 2): daardoor lukken `npm install`, `jest` en `tsc` nu niet zoals beschreven;
- vier over gaten in interfaces of mechanismen (3, 4, 5, 6);
- één over het testharnas (7);
- twee over de planning (8, 9).

Voorstel:
- Bevinding 1 en 2 verwerken vóór de start van M1.
- Bevinding 3 tot en met 7 verwerken vóór de start van M3.
- Bevinding 8 en 9 nu vastleggen in §14.

---

## 1. Uitgevoerde proeven

Alle proeven stonden in een tijdelijke map buiten de repository. Omgeving: Node 25.2.1 en npm 11.6.2.

| Proef | Resultaat |
|---|---|
| `npm view` van alle pakketten uit §4, plus `bundledNativeModules.json` van `expo@57.0.26` | Versies kloppen met SDK 57: RN 0.86.3, react 19.2.3, svg 15.15.4, screens ~4.26.0, safe-area ~5.7.0, netinfo 12.0.1 en rngrv ~1.11.0. Afwijkingen staan in bevinding 1. |
| `npm install` met exact de lijst uit §4 | **Faalt** (ERESOLVE), zie bevinding 1. |
| `npx jest` met de config uit §13.1 (projecten node + ui) | **Faalt** met `Cannot find module 'babel-preset-expo'`. Na de reparatie uit bevinding 1 is alles groen: nostr-tools/pure, noble 2.4 ESM, fflate, `node:sqlite`, de `ws`-relay, fast-check en een RTL-render in jest-expo. |
| `npx tsc --noEmit` (TS 6.0.3, `expo/tsconfig.base`, strict) | Appcode groen. **Testbestanden falen** (`Cannot find name 'it'`), zie bevinding 2. |
| `npx expo export --platform ios` en `--platform android` | **Slagen**, met een minimale app die alle kritieke imports gebruikt: nostr-tools/pure, `@noble/ciphers/chacha.js`, `@noble/hashes/hkdf.js`, fflate, expo-sqlite, expo-secure-store, `CameraView` met `barcodeScannerSettings`, netinfo, react-native-qrcode-svg, zustand/vanilla, de routestructuur uit §3 en `+native-intent.tsx`. De Hermes-bytecode is 3,5 MB (iOS) en 3,9 MB (Android). Er zitten geen reanimated, worklets of gesture-handler in de bundel. |
| `npx expo-doctor` | 21/21 checks geslaagd. Het ziet de transitieve versieafwijkingen uit bevinding 1d niet. |
| Expo-runtime | `expo/src/winter` wordt via `getModulesRunBeforeMainModule` vóór de hoofdmodule geladen en installeert al een UTF-8-`TextDecoder` (zie bevinding 10). noble zoekt `globalThis.crypto.getRandomValues` pas op bij aanroep, dus de polyfill uit §4 werkt. |
| Snelheid in Node | Schnorr-ondertekening 1,3 ms, `verifyEvent` 0,8 ms, XChaCha20-Poly1305 over 48 KiB 0,28 ms, deflate van 1000 items 0,9 ms. |
| Licentiescan van `node_modules` tegen de allowlist uit §13.5 | Er vallen 6 pakketten buiten, zie bevinding 19. |
| SDK 58 | `expo@58.0.0` is uitgebracht op 2026-09-29 onder de tag `next` (nu 58.0.5, met RN 0.88.0-rc.3). `jest-expo@58` vraagt **Jest 30** en `@react-native/jest-preset` 0.88. Zie bevinding 8. |

## 2. Antwoorden op de reviewvragen

- **Bouwbaar in Expo Go met SDK 57?** Ja. Elke native module staat in de SDK 57-bundel, de iOS- en Android-bundel bouwen, en noble, nostr-tools en fflate werken onder Metro (package exports met `.js`-subpaden). Er zijn alleen aanvullingen in de pakketlijst nodig (bevinding 1 en 2). Het echte risico is de timing van SDK 58 (bevinding 8).
- **Interfaces eenduidig genoeg?**
  - `SqlDriver`, `KeyStore` en de datamodellen zijn eenduidig.
  - `Transport` en `SyncEngine` zijn bijna eenduidig. Rond `prepare`, `created_at` en het herpubliceren is niet duidelijk wie wat bezit en persisteert (bevinding 3).
  - Op de facade ontbreken de DTO-typen, en optimistische UI past niet op de huidige signaturen (bevinding 6 en 18).
- **HLC en merge:** correct. Het bewijs in §5.8 klopt: elk register is een totale orde met `max`, dus een join-halfrooster. De schrijfregel `stamp = max(now(), succ(maxHlc(item)))` geeft causaliteit per item, ongeacht de klok, en een HLC uit de verre toekomst sleept de globale klok niet mee. Er zijn geen aanpassingen nodig, op de kleine punten in bevinding 16 na.
- **R-DEL:** correct en eenvoudig te implementeren: `del > max(alle registers, ook onbekende)`. Herstellen via `r` is netjes. Scenario's S-07a tot en met f volgen direct.
- **Opsplitsen:** correct. Een deel is een geldige deelstaat, dus verschillende `S` per afzender zijn onschadelijk. Er is alleen een detail rond de payloadcodec (bevinding 16).
- **`created_at`:** werkt in het basisgeval, maar heeft drie gaten (bevinding 3).
- **Outbox:** de volgorde commit → prepare → persist → send is goed. Er zijn gaten rond lezen buiten de mutex (bevinding 5), acks op oudere events (bevinding 12) en onbegrensde retries (bevinding 13).
- **Polyfills:** ze werken. Het `TextDecoder`-deel is overbodig (bevinding 10).
- **Testharnas:** sterk ontwerp. Er is een gat bij `kill()` (bevinding 7) en een ordeningsprobleem in de `MemoryHub` (bevinding 3d).
- **Pakketlijst:** de versies kloppen, maar de lijst is onvolledig, waardoor `npm install` en Jest falen (bevinding 1 en 2).
- **Mijlpalen:** de criteria zijn goed en meetbaar. M3 is te groot voor één reviewronde, en A-04 hoort eerder dan M5 (bevinding 8 en 9).

---

## 3. Bevindingen

### Belangrijk

**1. De pakketlijst is onvolledig: `npm install` en Jest falen** — *belangrijk* — §4, §13.1

Gemeten met de lijst uit §4:
- a) `npm install` faalt met ERESOLVE. `@testing-library/react-native@13.3.3` heeft `react-test-renderer >=18.2.0` als peer, en npm kiest dan 19.3.0, die react ^19.3.0 vraagt.
- b) `babel-preset-expo` staat er niet in. npm zet hem alleen genest onder `expo/node_modules`. Daardoor faalt `babel.config.js` (`presets: ['babel-preset-expo']`) in Jest met `Cannot find module 'babel-preset-expo'`. De proef van de Architect had hem wél als devDependency.
- c) `react-dom` staat er niet in. Dan komt 19.3.0 binnen, die tegen react 19.2.3 ongeldig is (optionele peer van `@expo/metro-runtime`/`expo-router`).
- d) `react-native-drawer-layout` (een dependency van expo-router) heeft gesture-handler en reanimated als peers. npm installeert daardoor de nieuwste versies: gesture-handler 3.3.0, reanimated 4.7.1 en worklets 0.13.0. SDK 57 verwacht ~2.32.0, 4.5.1 en 0.10.1. Ze zitten nu niet in de bundel, maar het gaat mis zodra een import ze binnenhaalt, en `babel-preset-expo` reageert op de aanwezigheid van worklets.
- e) `@babel/core` is op npm `latest` 8.0.6. §4 pint 7.29.7, en dat moet ook zo blijven.

*Voorstel:* zet in §4:
- in `dependencies`: `react-dom 19.2.3`, `react-native-reanimated 4.5.1`, `react-native-worklets 0.10.1` en `react-native-gesture-handler ~2.32.0` (allemaal in `bundledNativeModules`; dit zijn ook de versies uit `expo-template-default@sdk-57`);
- in `devDependencies`: `babel-preset-expo ~57.0.13`, `react-test-renderer 19.2.3` en `@types/node ~25.9` (zie bevinding 2).

Leg vast dat na de installatie `npx expo install --check` en `npm ls --all` geen fouten geven. Neem die controle op in `deps.test.ts`. De allowlist daar moet de vier extra native modules toestaan.

**2. TypeScript 6 neemt `@types/*` niet meer automatisch mee, dus `tsc --noEmit` faalt op tests** — *belangrijk* — §4, §13.1, NF-09

Met `expo/tsconfig.base` + strict + TS 6.0.3 kent `tsc` de Jest-globals (`it`, `expect`) niet meer: `types` is in TS 6 standaard `[]`. `@types/node` (nodig voor `node:sqlite`, `ws` en de tests) komt nu alleen transitief binnen, als versie 26.6.4 via jest-environment-node.

*Voorstel:* zet in `tsconfig.json` `"types": ["jest", "node"]` en maak `@types/node ~25.9` een expliciete devDependency (die past bij Node 25). Nog netter is een aparte `tsconfig.test.json`, zodat appcode geen Node-typen ziet. Dat ondersteunt meteen de importregel uit §2.

**3. `created_at`: eigenaarschap, persistentie en klokcorrectie zijn niet sluitend** — *belangrijk* — §6.6, §6.8, §10 (`Transport.prepare`), §13.2 (`MemoryHub`)

- a) **Tegenstrijdige interface.** Volgens §6.8 staat de boekhouding (`lastPrepared`) in `transport_kv` en wordt die "persistent, in de transactie van §6.6 stap 4" geschreven. Maar de transport krijgt zijn eigen `kv` (`createNostrTransport({ kv, … })`) en `prepare()` is async en draait buiten `repo.tx`. De transport kan dus niet in de transactie van de engine schrijven.
- b) **Opnieuw voorbereiden na "te laat".** Volgens de tabel in §6.6 bereidt de transport opnieuw voor en verstuurt hij opnieuw. Maar `shard_state.last_event_id`/`last_event_raw` blijven dan naar het geweigerde event wijzen. De eigen-staatcontrole stuurt na elke EOSE dus opnieuw het geweigerde event, en dat leidt opnieuw tot klokcorrectie. Ook de outbox-invariant (eerst persisteren, dan versturen) wordt zo omzeild.
- c) **`offsetSec` staat alleen in het geheugen.** Bij elke appstart herhalen zich dan de weigeringen (met een klok die 1 uur voorloopt: 3 extra ronden per deel, telkens na het venster van 1 s). Erger is het geval met relays die verschillende toleranties hebben (gemeten: 5–15 min).
  - Relay A accepteert `now+10 min` en relay B weigert dat.
  - `lastPrepared := lastAccepted` (afkomstig van A) houdt `created_at` dan in de toekomst.
  - De regel "vastgelopen" (`> nowAdj + 600`) leidt tot `needsNewIdentity`.
  - Omdat `offsetSec` bij elke start weer 0 is, krijgt een lijst **bij elke appstart een nieuwe Nostr-identiteit**. Leden en oude slots groeien dan zonder grens (het `authors`-filter heeft een maximum van 50).
- d) **`MemoryHub`: "het laatste per slot wint" heeft geen ordeningssleutel.** `PreparedMessage` bevat geen versie. Ordent de hub op aankomst, dan overschrijven de replay-tests (S-11) nieuw met oud. Een teller in `MemoryTransport` overleeft `kill()`/`restart()` niet, omdat die transport geen opslag heeft.

*Voorstel (één samenhangende wijziging):*
- De **engine** bezit de versie per slot. Breid de interface uit tot `prepare({ channel, slot, identity, seal, notBefore })` met als resultaat `PreparedMessage & { version: number }`.
- `notBefore` = de versie van het laatst gepersisteerde event van dat slot. Die staat al in `shard_state.last_event_raw`; voeg anders een kolom `last_version` toe. De engine bewaart `version` in de transactie van stap 4. Daarmee vervalt `transport_kv` voor `lastPrepared`.
- Nostr: `version = created_at`. Memory: dezelfde regel op virtuele tijd. Zo hebben beide transports dezelfde semantiek, en kan de contracttest "laatste per slot wint" ook replay en herstart dekken.
- Een uitkomst `clock-ahead` of `clock-behind` gaat naar de **engine**. Die bereidt opnieuw voor, persisteert en verstuurt (zelfde pad als een flush), zodat `last_event_*` altijd het nieuwste event is.
- `offsetSec` wordt persistent (in `meta`). Hij daalt bij elke "te laat" van welke relay ook en stijgt pas na een "te vroeg". Zo past de klok zich aan de strengste relay aan.
- Reset `lastPrepared` niet naar `lastAccepted` van een **andere** relay.
- Draai de identiteit alleen bij een echte wegloper, dus een voorsprong van meer dan 1 u. Is de voorsprong kleiner, dan wacht je. Een event dat door A is geaccepteerd, ligt hooguit ±15 min vóór, dus B accepteert vanzelf na ≤ 15 min.
- Neem een test op met twee relays van verschillende tolerantie (300 s en 900 s), klok +10 min en 3 herstarts. Verwacht: geen nieuwe identiteit en convergentie.

**4. Lezen buiten de mutex ziet niet-gecommitte data** — *belangrijk* — §9.2, §6.6 stap 1, §9.3

expo-sqlite gebruikt één verbinding, en de `NodeSqliteDriver` ook. Alleen schrijfacties gaan via `repo.tx` en de mutex. Een `getAllAsync` van de UI, de suggestie-index of de flush ("leestransactie") die draait terwijl een `BEGIN IMMEDIATE` openstaat, leest op dezelfde verbinding de **niet-gecommitte** wijzigingen. Bij een `ROLLBACK` (validatiefout, `SimulatedCrash`) kan de flush dan een staat publiceren die nooit gecommit is. Dat schendt "het netwerk leest alleen uit de database" en S-02.

*Voorstel:* voeg `repo.read(fn)` toe die dezelfde mutex gebruikt. Alle SQL loopt dan via `tx` of `read`. Leg dat vast in §9.2 en controleer het met een test die `SqlDriver` alleen via `Repository` laat aanroepen. Een alternatief is een tweede, alleen-lezen verbinding met WAL en `BEGIN` voor een momentopname, maar dat is complexer.

**5. Het ack-pad en het opnieuw publiceren hebben geen duidelijke eigenaar** — *belangrijk* — §6.6, §10

Dit valt samen met 3b, maar het reikt verder. Het volgende staat niet vast:
- wie de retry-backoff per endpoint uitvoert (de engine heeft `last_event_raw`, de transport kent de endpoints);
- of `send(m, to)` voor een nog niet verbonden endpoint stilletjes wegvalt.

*Voorstel:* leg in §6.6 vast:
- de **engine** bezit alle (her)verzendingen (`send(m, [ep])`) en de retrytimers;
- de transport rapporteert alleen uitkomsten;
- `send` naar een endpoint dat niet open is, geeft `outcome: not-connected`, en het herstel loopt via de eigen-staatcontrole na de volgende EOSE.

**6. Optimistische UI (UX-05) past niet op de signaturen van de facade** — *belangrijk* — §9.3, §10, §12

Volgens §9.3 stap 2 past de UI-store de wijziging optimistisch toe voordat de facade iets doet. Bij `addItem` kent de store dan nog geen item-ID, HLC of categorie, en weet hij niet of het om een dubbel gaat (F-17). Het antwoord `duplicate` komt pas na de facade. Tegelijk moet de store dan een lokaal model van de CRDT bijhouden.

*Voorstel:* laat de **facade** de wijziging synchroon toepassen op zijn eigen geheugencache (die heeft hij al voor de synchrone `view()`). Hij stuurt meteen `onChange` en geeft `{ result, committed: Promise<void> }` terug. Bij een fout in de commit draait de facade de cache terug en stuurt hij `onChange` plus een foutmelding.
- De store wordt zo een dunne laag zonder eigen optimistische logica.
- S-02 ("bevestigd" = `committed` opgelost) en UX-05 (direct zichtbaar) zijn dan allebei eenduidig.
- De stamp wordt bepaald bij het synchroon toepassen en in de transactie hergebruikt.

**7. `kill()` in het harnas laat zombie-instanties achter** — *belangrijk* — §13.3, NF-12, S-02

Na `kill()` kunnen lopende promises, timers, hub-verbindingen en `ws`-callbacks van de oude instantie doorlopen. Met `node:sqlite` kan zo'n zombie via een eigen verbinding naar **hetzelfde bestand** schrijven, nadat `restart()` een nieuwe instantie heeft gestart. Dat geeft vals-groene of flakkerende crashtests. Ook BUSY-locks zijn mogelijk als de oude verbinding een transactie openhoudt.

*Voorstel:*
- `createTestDevice` verpakt elke dependency (driver, keystore, timers, transport/`wsFactory`, hub-aansluiting) in een "kill switch". Na `kill()` gooit elke aanroep `SimulatedCrash`, worden timers gewist en geblokkeerd, en gaan berichten van en naar de oude instantie verloren.
- `restart()` wacht op een drain van de microtasks en maakt pas daarna de nieuwe instantie.
- `device.test.ts` bewijst dat na een kill geen I/O meer plaatsvindt.

**8. SDK 58 is dichterbij dan A-04 aanneemt, en de upgrade is groter** — *belangrijk* — §4, §14 (M4/M5), §15, A-04

`expo@58.0.0` is op 2026-09-29 gepubliceerd (nu 58.0.5, tag `next`, met RN 0.88.0-rc.3).
- Bij SDK 56 en 57 zat er 5 tot 15 dagen tussen preview en stabiel. Expo Go in de stores volgt de stabiele release.
- De kans is dus groot dat Expo Go al naar SDK 58 gaat vóór de rooktest in M4.
- De upgrade is bovendien niet alleen `npx expo install expo@^58 --fix`. `jest-expo@58` vraagt **Jest 30**, `babel-jest` 30 en `@react-native/jest-preset` 0.88. RN gaat van 0.86 naar 0.88. Waarschijnlijk is ook een andere versie van RTL of de test-renderer nodig.

*Voorstel:*
- Verplaats de A-04-controle naar het **begin van M4**, plus een snelle check bij elke mijlpaal.
- Houd de Jest-config en tests Jest-30-compatibel: geen verouderde API's van `jest.mock`/fake timers; `@types/jest` vervangen door `@jest/globals`-imports is een optie.
- Laat de Projectleider beslissen: stappen we direct over op SDK 58 zodra die `latest` is? NF-08 noemt SDK 57 nu als Must.
- M1–M3 zijn pure TS en grotendeels SDK-onafhankelijk, dus het risico concentreert zich in M4.

**9. M3 is te groot voor één mijlpaal met review** — *belangrijk* — §14

M3 bevat de engine, twee transports, een eigen `RelayConnection`, RelayCore en WsTestRelay met ±14 foutknoppen, sim-devices met kill en herstart, contracttests en ±20 integratietestbestanden. Ook alle S-eisen moeten groen zijn met ≥ 200 seeds. Een review daarvan in één keer is zwaar, en een fout in de engine wordt pas laat zichtbaar. §14 geeft verder geen tijdsinschatting, en M4 hangt af van Nick (rooktest).

*Voorstel:*
- Splits M3 in twee delen, elk met een eigen review:
  - **M3a — engine + MemoryTransport + sim + seeds.** Groen: S-02, S-04, S-05/S-11 (sync-deel), S-07, S-17, S-18, S-19 (memory), S-20 en S-21.
  - **M3b — NostrTransport + RelayConnection + WsTestRelay.** Groen: S-03, S-08, S-09, S-10, S-12, S-13, S-14, S-15, S-16, S-19 (Nostr), NF-01/02/03/05/06/11 en F-13/14/18.
- Spreek de datum van de rooktest met Nick af zodra M3b klaar is.

### Klein

**10. De `TextDecoder`-polyfill is overbodig** — *klein* — §4 (aandachtspunten), §3 (`polyfills.ts`)

Expo 57 laadt `expo/src/winter` via `getModulesRunBeforeMainModule` vóór `index.ts` en installeert dan een UTF-8-`TextDecoder` (plus `URL`, `structuredClone`). *Voorstel:* laat de eigen `TextDecoder` weg. `polyfills.ts` doet alleen `globalThis.crypto ??= {}` en `crypto.getRandomValues ??= ExpoCrypto.getRandomValues`. Voeg bij het opstarten een zelftest toe (een HKDF-, AEAD- en sign/verify-ronde, met logcode `selftest.ok`/`selftest.fail`) als hulpmiddel bij de rooktest in M4.

**11. Willekeur loopt deels buiten de geïnjecteerde `Random` om** — *klein* — §10 (`Random`), §6.1

`generateSecretKey()` van nostr-tools en `randomBytes` van noble gebruiken `globalThis.crypto` rechtstreeks. Sleutels en nonces zijn dan in seed-tests niet herhaalbaar. *Voorstel:* Nostr-sleutels via `random.bytes(32)` (met een geldigheidscontrole van de scalar) en nonces via `random.bytes(24)`. Gebruik `generateSecretKey` niet.

**12. Acks op oudere events** — *klein* — §6.6 (Ack)

Alleen `last_event_id` is opgeslagen. Een ack op een ouder event dat nog onderweg is, kan dus niet aan een `rev` worden gekoppeld. *Voorstel:* een map in het geheugen `messageId → {shard, rev}` voor events die nog onderweg zijn. Onbekende ID's worden genegeerd. Ze vallen altijd onder een latere ack of de eigen-staatcontrole. Leg dit vast.

**13. Onbegrensde retries bij een time-out** — *klein* — §6.6, NF-11

Een stille relay (zoals nos.lol) krijgt per deel elke 60 s een retry, zolang de app open is. Zijn alle relays stil, dan blijft de status eeuwig `bezig`. *Voorstel:* maximaal 5 retries per event per endpoint. Daarna alleen nog via de eigen-staatcontrole of `kick()`. De Projectleider beslist of "alle relays ≥ 30 s alleen time-outs" ook `fout` is (S-17 noemt nu alleen expliciete weigeringen).

**14. Het verwijderen van een gedeelde lijst moet op de staat zijn gebaseerd** — *klein* — §7 (Lijst verwijderen), §9.1

"Na de eerste ack: wissen" moet ook werken na een kill. *Voorstel:*
- `D` in `regs` verbergt de lijst meteen in de UI.
- Bij opstarten en bij elke ack geldt: is `D` gezet en heeft ≥ 1 deel een ack, dan wordt de lijst afgerond.
- Ruim expliciet de tabellen zonder FK op: `shard_state`, `pending_changes`, `relay_acks`, `members`, `future_events` en `list_relays`.

**15. Geen lege publicaties en geen `pending_changes` zonder sync** — *klein* — §7 (Koppelen), §9.3

- Zolang `joined_pending = 1` geldt (nog geen EOSE of data), publiceert het apparaat niet. Anders gaat er een lege snapshot naar de relays.
- Voor niet-gedeelde lijsten schrijft het geen `pending_changes`, of het wist ze bij de eerste ack na het delen.

**16. Details van de payloadcodec** — *klein* — §6.4, §5.6

- Definieer `b` = de kleinste `ms` van alle HLC's in het deel, zodat `(ms−b)` nooit negatief is.
- Valideer per item-record in plaats van per event. Eén ongeldig record (bijvoorbeeld door een bug bij een peer) laat nu het hele deel van die peer vallen, en de apparaten convergeren dan nooit. Een deelverzameling van geldige records blijft een geldige ondergrens (§5.8 punt 3), dus records overslaan is veilig. Log er één regel van.
- Inflate met een limiet vraagt de streaming-`Inflate` van fflate (met tellen per chunk). `inflateSync` heeft geen limiet.

**17. Kleine onduidelijkheden in de `Transport`-interface** — *klein* — §10, §6.7, §6.10

- `setSubscriptions(...).slots`: leg vast dat dit altijd 16 is (alle mogelijke delen), niet de `S` van het apparaat zelf.
- Per lijst een eigen relayset (`list_relays`) is met deze interface niet uit te drukken, want `setSubscriptions` en `send` kennen geen endpoints per kanaal. *Voorstel:* in v1 gebruiken alle gedeelde lijsten de unie (de hints worden aan de globale set toegevoegd), of geef `endpoints` mee per abonnement.
- `endOfStored` moet bij de huidige REQ-generatie horen, zodat een EOSE van een oud REQ geen eigen-staatcontrole start voor een lijst die er nog niet in zat.
- Laat de engine de AAD opbouwen uit `(sender, channel, slot)` in plaats van de transport. Dan is de AAD in beide transports gelijk en blijft "bootschap/v1" uit de transportlaag.

**18. Typen van de facade ontbreken** — *klein* — §10

`ListView`, `ListSummary`, `AddInput`, `AddResult`, `ItemPatch`, `UndoToken`, `ShareInfo`, `JoinResult`, `SyncStatus`, `Suggestion` en `Config` ontbreken, en `Logger.warn(...)` en `onSyncStatus(cb: …)` zijn onvolledig. *Voorstel:* de Engineer definieert ze in M1/M2 in `src/core/types.ts` en `src/service/types.ts`. De Architect toetst ze bij de codereview van M2, en ze komen in M5 in ARCHITECTURE.

**19. De licentiecontrole moet SPDX-expressies begrijpen** — *klein* — §13.5, NF-07

Gemeten buiten de allowlist:
- `node-forge` (BSD-3-Clause OR GPL-2.0);
- `type-fest` (MIT OR CC0-1.0);
- `text-encoding` (Unlicense OR Apache-2.0);
- `fb-dotslash` (MIT OR Apache-2.0);
- `@expo-google-fonts/material-symbols` (MIT AND Apache-2.0);
- `lightningcss` (MPL-2.0, Expo-buildtooling).

*Voorstel:* `check-licenses.mjs` evalueert `OR` (één toegestaan is genoeg) en `AND` (alle toegestaan). Voeg MPL-2.0 toe aan de allowlist. Die is open source en voldoet dus aan NF-07.

**20. De status toont kort "offline" bij het opstarten** — *klein* — §6.9

Direct na de start geldt `relaysOpen == 0`, dus de status is `offline`, totdat de eerste verbinding open is. *Voorstel:* bij `relaysOpen == 0` en ≥ 1 relay in `connecting` binnen de eerste verbindingspoging (≤ 10 s) wordt de status `bezig`.

**21. Tijdsbeheer en looptijd van de seed-tests** — *klein* — §13.3, §13.4, M3-criterium "< 5 min"

- `VirtualScheduler.runUntilQuiet()` moet de microtasks leegmaken tussen twee timerstappen, omdat de driver via promises werkt.
- Een importtest verbiedt globale `setTimeout`/`Date.now` buiten de adapters.
- Laat `MemoryTransport` niet met Schnorr ondertekenen. In Node kost ondertekenen 1,3 ms en verifiëren 0,8 ms. Bij 200 seeds × 5 apparaten telt dat op tot minuten.
- Let op: `node:sqlite` is synchroon achter een promise-wrapper. Races die alleen met de echt asynchrone expo-sqlite optreden, vangen deze tests dus niet. Daar dient de mutex uit bevinding 4 voor.

---

## 4. Wat goed is (behouden)

- De strikte scheiding van lagen met importtests, en een `core` zonder I/O.
- Volledige snapshots per apparaat in eigen slots met een eigen sleutel. Daardoor is overschrijven door anderen onmogelijk en blijft het bewijs eenvoudig.
- De eigen-staatcontrole na EOSE als één herstelmechanisme voor wipe, stil laten vallen, herstart en kill.
- Een eigen `RelayConnection` in plaats van `SimplePool`. Dat is goed voor de controle over OK-redenen en backoff.
- De gemeten feiten: de relays, de grens van 64 KiB, de `created_at`-tolerantie en `react-native` 0.86.3 bij SDK 57.
- De traceerbaarheidsmatrix §13.6 is direct bruikbaar als takenlijst.
- De sleutelnamen van de secure store (`bs.list.<base64url>.secret`) voldoen aan de tekenset van expo-secure-store (`[A-Za-z0-9._-]`).
