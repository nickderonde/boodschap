# Bootschap — Architectuur (v1.1.1)

Auteur: Architect. **Status: v1.1: v1.0.2 plus store-publicatie (CR-03, §19).** Bevat alle goedgekeurde afwijkingen D-01..D-35, D-37 en D-38..D-43. Zie `docs/APPROVALS.md` voor de goedkeuringen.
Bron van waarheid voor de eisen: `docs/REQUIREMENTS.md` v0.3.1. Eis-ID's tussen haakjes verwijzen daarnaar. Bij een verschil tussen dit document en de code geldt de code, en is dit document aan herziening toe.
Feiten zijn op 2026-10-06 geverifieerd met `npm view`, Jest-proeven, een publicatieproef tegen publieke relays en de opgeleverde testsuite: 66 suites, 382 tests groen en 1 overgeslagen (live-relays); `tsc` en `test:handles` schoon.

---

## 1. Uitgangspunten

1. **State-based CRDT + volledige snapshots.** Elk apparaat publiceert per gedeelde lijst zijn *volledige, gemergede* staat als versleuteld, vervangbaar Nostr-event. Ontvangers mergen. Geen delta's in v1 (§6.4).
2. **Eerst lokaal committen, dan versturen.** De UI-bevestiging volgt op een SQLite-commit. Het netwerk leest altijd uit de database, nooit uit het geheugen (§9.3).
3. **Elke laag is los testbaar in Node.** Klok, timers, willekeur, opslag, sleutelopslag en transport worden geïnjecteerd (NF-12). Alleen `app/` en `src/ui/` importeren React Native.
4. **De relay is dom en onbetrouwbaar.** Correctheid hangt nooit af van wat een relay bewaart, in welke volgorde hij levert of of hij antwoordt. De relay is alleen een brievenbus. De eigen-staatcontrole (§6.8) repareert wat verdwijnt.
5. **Geen eigen server, geen andere hosts.** De enige netwerkverbinding van de app-code is WebSocket naar de ingestelde relays (NF-06). Er is ook geen NIP-11 HTTP-verkeer.

## 2. Lagen en afhankelijkheden

```
 app/ (Expo Router-schermen)          ← React Native
 src/ui/ (zustand-store, componenten, strings.nl.ts, platform-adapters)
        │  roept alleen de facade aan
 src/service/  BootschapApp-facade: commando's, queries, bedrading     ← puur TS
        │                     │
 src/sync/ (SyncEngine,       src/storage/ (SqlDriver-interface, migraties,
  Transport-interface,          Repository, KeyStore-interface,
  transports/nostr,             ExpoSqliteDriver, ExpoSecureKeyStore)
  transports/memory)
        │                     │
 src/core/  datamodel, HLC, CRDT-merge, crypto, codecs, categorisatie, suggesties, parser   ← puur TS, geen I/O
```

Regels (gecontroleerd met een importtest, `test/arch/imports.test.ts`):
- Buiten `src/ui/platform/**`, `src/service/createApp.ts`, `src/polyfills.ts`, `src/selftest.ts` (K-2) en `test/**` gebruikt geen code de globale `setTimeout`, `setInterval`, `Date.now`, `Math.random` of `crypto`. Alles gaat via `Clock`, `Timers` en `Random` (review E-21, E-11).
- `core` importeert niets uit andere lagen en geen `react-native`/`expo-*`.
- `sync` importeert `core`, `config` en `sync`. Alles wat de engine van opslag en facade nodig heeft, loopt via de eigen interface `SyncHost` (`src/sync/SyncHost.ts`, D-02), die de facade implementeert. De engine kent geen SQL en geen facade. `src/sync/engine/**` importeert niets uit `src/sync/transports/**` en niets met `nostr` in de naam (S-19).
- `storage` importeert `core`. Alleen de bestanden `ExpoSqliteDriver.ts` en `ExpoSecureKeyStore.ts` importeren `expo-*`.
- `service` importeert `core`, `storage` en `sync` (de interfaces plus de fabrieken).
- Node-only code (`node:sqlite`, `ws`) staat uitsluitend onder `test/`, zodat Metro hem nooit bundelt.

## 3. Mappenstructuur (zoals opgeleverd)

```
/
├─ app/                              Expo Router (routes)
│  ├─ _layout.tsx                    Stack, AppProvider (start, retry), splash/foutscherm
│  ├─ index.tsx                      overzicht van lijsten (F-01, UX-10)
│  ├─ lijst/[id].tsx                 lijstscherm (F-02..F-12, F-17, UX-02..05, UX-07, UX-13)
│  ├─ lijst/[id]/item/[itemId].tsx   item bewerken (modal, F-04, F-09)
│  ├─ lijst/[id]/delen.tsx           QR, deeltekst, code kopiëren, waarschuwing (F-13, NF-05)
│  ├─ koppelen.tsx                   scannen + plakken (F-14, F-15), klembord wissen na koppelen
│  ├─ instellingen.tsx               relays (F-19, alleen wss://), privacy-uitleg
│  └─ +native-intent.tsx             vangt bootschap://join#… af (voor EAS-builds)
├─ index.ts                          import './src/polyfills'; import 'expo-router/entry';
├─ src/
│  ├─ config.ts                      Config + DEFAULT_CONFIG (vensters, limieten, standaardrelays, allowInsecureRelays=false)
│  ├─ polyfills.ts                   alleen crypto.getRandomValues (expo-crypto)
│  ├─ selftest.ts                    HKDF/AEAD/sign-verify-ronde → selftest.ok / selftest.fail
│  ├─ core/                          puur TS, geen I/O
│  │  ├─ types.ts hlc.ts ids.ts bytes.ts canonical.ts validate.ts ops.ts
│  │  ├─ crdt/ register.ts item.ts list.ts materialize.ts (ItemView-cache per ItemState, D-32)
│  │  ├─ crypto/ kdf.ts aead.ts
│  │  ├─ codec/ snapshot.ts shard.ts sharecode.ts
│  │  ├─ categorize/ categories.ts dictionary.nl.ts normalize.ts categorize.ts
│  │  └─ suggest.ts parseInput.ts sort.ts duplicate.ts
│  ├─ storage/
│  │  ├─ SqlDriver.ts Repository.ts (tx/read onder één mutex) mutex.ts migrations.ts dao.ts KeyStore.ts index.ts
│  │  └─ ExpoSqliteDriver.ts ExpoSecureKeyStore.ts      (enige expo-imports in storage)
│  ├─ sync/
│  │  ├─ Transport.ts                interface (S-19, D-01)
│  │  ├─ SyncHost.ts                 interface engine ↔ facade (D-02)
│  │  ├─ engine/ SyncEngine.ts Publisher.ts Receiver.ts SelfCheck.ts JoinTracker.ts status.ts context.ts
│  │  └─ transports/ nostr/ (NostrTransport, RelayConnection, event, okReason)  memory/ (MemoryTransport, MemoryHub)
│  ├─ service/ BootschapApp.ts (facade + SyncHost) createApp.ts (productiebedrading) StateCache.ts WriteQueue.ts types.ts
│  └─ ui/
│     ├─ AppContext.tsx store.ts selectors.ts strings.nl.ts statusText.ts theme.ts confirm.ts
│     ├─ clipboard.ts scanGate.ts pendingJoin.ts hooks/useShareInfo.ts
│     ├─ components/ AddBar.tsx ItemRow.tsx Icon.tsx (eigen SVG-iconen, D-26) basics.tsx
│     └─ platform/ appState.ts netInfo.ts timers.ts
├─ test/
│  ├─ setup-node.ts                  fetch/XHR gooien; SimulatedCrash in unhandledRejection genegeerd
│  ├─ support/ NodeSqliteDriver MemoryKeyStore FakeClock/VirtualScheduler CrashingSqlDriver KillSwitch SeededRandom CapturingLogger arbitraries single
│  ├─ relay/ RelayCore.ts WsTestRelay.ts relay.test.ts
│  ├─ sim/ device.ts hub.ts ws.ts scenario.ts device.test.ts
│  ├─ contract/ transport.contract.ts memory.contract.test.ts nostr.contract.test.ts
│  ├─ storage/ migrations.test.ts mutex.test.ts
│  ├─ arch/ imports deps licenses strings readme (.test.ts)
│  ├─ integration/ *.test.ts         per eisgroep + review-fixes(.test, -m4.test)
│  ├─ acceptance/                    van de Eindtester (o.a. resilience, partner-scenarios, F-08, ui/, live-relays: overgeslagen)
│  └─ fixtures/ categorize-100.json (Engineer) categorize-f08-eindtester.json (Eindtester, normatief)
├─ scripts/ check-licenses.mjs
├─ app.json  babel.config.js  jest.config.js  tsconfig.json  tsconfig.test.json  package.json  README.md
└─ docs/ BRIEF REQUIREMENTS ARCHITECTURE DEVIATIONS PROGRESS TEST_REPORT APPROVALS reviews/
```

Unit-tests staan naast de code (`src/**/*.test.ts(x)`). Integratie-, contract- en acceptatietests staan in `test/`.

## 4. Packages, versies en polyfills

**SDK-keuze (review E-8, coördinator): SDK 57.** Op npm is dat `latest` (`expo@57.0.26`). SDK 58 is `next` (58.0.5, met RN 0.88.0-rc.3). De code blijft waar mogelijk SDK-onafhankelijk:
- `core`, `storage` (op de drivers na), `sync` en `service` zijn pure TypeScript zonder Expo-imports;
- in `src/ui` alleen stabiele API's.

De A-04-controle staat aan het begin van M4, met een snelle check bij elke mijlpaal (§14). Het upgradepad staat in §4.3.

Geverifieerd met `npm view`, de `bundledNativeModules.json` van `expo@57.0.26`, de template `expo-template-default@sdk-57` en de proef van de Engineer (`npm install`, `jest`, `tsc`, `expo export` ios/android en `expo-doctor` 21/21 groen, na de aanvullingen hieronder). SDK 57 hoort bij **`react-native` 0.86.3 en `react` 19.2.3**. Installeer Expo-pakketten altijd met `npx expo install <pkg>`.

### 4.1 Volledige pakketlijst (exact zo in `package.json`)

**dependencies**

| Package | Versie | Doel |
|---|---|---|
| expo | ~57.0.27 | SDK (patchversies via `npx expo install --fix`, D-ET-08) |
| react / react-dom / react-native | 19.2.3 / 19.2.3 / 0.86.3 | `react-dom` expliciet; anders komt 19.3.0 binnen (E-1c) |
| expo-router | ~57.0.25 | routes |
| expo-linking / expo-constants / @expo/metro-runtime | ~57.0.12 / ~57.0.21 / ~57.0.16 | peers van expo-router |
| react-native-screens / react-native-safe-area-context | ~4.26.0 / ~5.7.0 | peers van expo-router |
| react-native-reanimated / react-native-worklets / react-native-gesture-handler | 4.5.1 / 0.10.1 / ~2.32.0 | Gepind op SDK 57 (E-1d). Sinds v1.0.2 direct gebruikt voor swipe-rijen (`ReanimatedSwipeable`, D-37). De worklets-Babel-plugin wordt automatisch toegevoegd door `babel-preset-expo` |
| expo-status-bar | ~57.0.1 | |
| expo-sqlite | ~57.0.4 | opslag |
| expo-secure-store | ~57.0.4 | sleutels (NF-04) |
| expo-crypto | ~57.0.3 | `getRandomValues` (polyfill en `Random`) |
| expo-camera | ~57.0.6 | QR scannen (`CameraView` met `barcodeScannerSettings`) |
| expo-clipboard | ~57.0.2 | code plakken/kopiëren |
| @react-native-community/netinfo | 12.0.1 | netwerkherstel |
| react-native-svg / react-native-qrcode-svg | 15.15.4 / 6.3.26 | QR tekenen |
| nostr-tools | 2.25.2 | alleen `nostr-tools/pure`: `finalizeEvent`, `verifyEvent`, `getPublicKey` |
| @noble/ciphers / @noble/hashes | 2.4.0 / 2.4.0 | `chacha.js` (xchacha20poly1305); `hkdf.js`, `sha2.js`, `utils.js` |
| fflate | 0.8.3 | deflate en streaming-`Inflate`, UTF-8 |
| zustand | 5.0.15 | UI-store (`zustand/vanilla`) |

**devDependencies**

| Package | Versie | Opmerking |
|---|---|---|
| typescript | ~6.0.3 | template-versie; **niet** 7.x |
| @types/react | ~19.2.2 | |
| @types/node | ~25.9.9 | expliciet (E-2); past bij Node 25 |
| @types/jest | 29.5.14 | |
| @types/ws | 8.18.2 | |
| jest / babel-jest | 29.7.0 / 29.7.0 | jest-expo 57 gebruikt Jest 29 |
| jest-expo | ~57.0.5 | |
| @react-native/jest-preset | 0.86.3 | peer van jest-expo |
| babel-preset-expo | ~57.0.13 | **expliciet**; anders vindt Jest hem niet (E-1b) |
| @babel/core / @babel/runtime | 7.29.7 / 7.29.7 | npm-`latest` van @babel/core is 8.x: **niet** gebruiken (E-1e) |
| react-test-renderer | 19.2.3 | expliciet; anders ERESOLVE (E-1a) |
| @testing-library/react-native | 13.3.3 | |
| fast-check | 4.10.2 | |
| ws | 8.22.0 | alleen voor tests |

Optioneel (S): `eslint` en `eslint-config-expo`.

**Controles**:
- Na `npm install` moeten `npx expo install --check` en `npm ls --all` zonder fouten eindigen. Script: `npm run check:deps`, onderdeel van de DoD-commando's.
- `test/arch/deps.test.ts` vergelijkt elke dependency die in `node_modules/expo/bundledNativeModules.json` staat met de daar opgegeven range. Het controleert ook de allowlist van native modules: de lijst hierboven, inclusief reanimated, worklets en gesture-handler. Dit werkt offline.

### 4.2 TypeScript en polyfills
- **TypeScript 6** zet `types` standaard op `[]`, dus Jest- en Node-typen komen niet meer vanzelf mee (E-2; geverifieerd in de proef van de Engineer). Daarom zijn er twee configuraties:
  - `tsconfig.json` (app): `extends: "expo/tsconfig.base"`, `strict: true`, `types: []`, sluit `**/*.test.ts(x)` en `test/**` uit. Zo ziet de appcode geen Node-typen.
  - `tsconfig.test.json`: `extends: "./tsconfig.json"`, `types: ["jest", "node"]`, met alles erin.
  - `npm run typecheck` = `tsc -p tsconfig.json && tsc -p tsconfig.test.json`.
- **noble 2.x** is alleen ESM, met subpaden inclusief `.js`. Het accepteert **geen strings** als bytes, dus gebruik altijd `utf8ToBytes(...)` voor salt en info.
- `nostr-tools` pint zijn eigen noble-versies. Dubbele kopieën zijn acceptabel.
- **`TextDecoder`**: Expo 57 installeert via `expo/src/winter` (`getModulesRunBeforeMainModule`) al een UTF-8-`TextDecoder` vóór `index.ts` (E-10). Er komt dus geen eigen polyfill.
- **`polyfills.ts`** doet alleen `globalThis.crypto ??= {}` en `globalThis.crypto.getRandomValues ??= ExpoCrypto.getRandomValues`. Dat is nodig, omdat `verifyEvent`/`getPublicKey` noble gebruiken en `randomBytes` als terugval aanwezig moet zijn. Eigen code haalt willekeur altijd uit `Random` (§10, E-11).
- `index.ts` = `import './src/polyfills'; import 'expo-router/entry';` met `"main": "index.ts"`.
- **`selftest.ts`** draait na de eerste render één HKDF-, AEAD- en sign/verify-ronde en logt `selftest.ok` of `selftest.fail`. Dat is een hulpmiddel bij de rooktest in M4.

### 4.3 Upgradepad naar SDK 58 (bekende vervolgstap, A-04)
Uitvoeren zodra Expo Go in de stores SDK 58 vraagt. De controle staat aan het begin van M4.
1. `npx expo install expo@^58 --fix`. Dit brengt react-native naar 0.88 en zet alle `expo-*`, reanimated, worklets, gesture-handler, screens, safe-area en svg op de versies van SDK 58.
2. Testketen: `jest@30`, `babel-jest@30`, `jest-expo@~58`, `@react-native/jest-preset@0.88`, `@types/jest@30`. Kies de versies van `react-test-renderer` en `@testing-library/react-native` volgens de peers van `jest-expo@58`.
3. Daarna `npm run check:deps`, `npm run typecheck`, `npx jest`, `expo export` ios/android en `expo-doctor`.

Om de upgrade klein te houden, schrijven we de tests nu al Jest-30-compatibel:
- geen verouderde aliassen (`toBeCalled`, `toThrowError` enzovoort);
- fake timers alleen via `jest.useFakeTimers()` zonder legacy-optie;
- bij voorkeur geen fake timers, maar de eigen `VirtualScheduler`.

## 5. Datamodel en CRDT

### 5.1 Identificatie
- **Apparaat-ID** (`node`): 8 willekeurige bytes als 16 hex-tekens, eenmalig per installatie, in `meta.device_id`. Geen geheim.
- **Lokaal lijst-ID**: 16 willekeurige bytes, base64url. Verlaat het toestel nooit.
- **Item-ID**: 12 willekeurige bytes, base64url (16 tekens). Globaal en reist mee in de payload. Een nieuw item krijgt altijd een nieuw ID (sectie 3, "dubbel toevoegen").
- **Lijst-tag** (relay-zichtbaar) en **encryptiesleutel**: afgeleid uit het lijstgeheim (§6.1).
- Alle willekeurige waarden (ID's, geheimen, nonces, Nostr-sleutels) komen uit de geïnjecteerde `Random`. In tests is die geseed en dus herhaalbaar (E-11).

### 5.2 Hybrid Logical Clock
- **Formaat**: 32 lowercase hex-tekens = `ms` (12 hex, 48 bit Unix-ms) + `c` (4 hex, teller) + `node` (16 hex). Voorbeeld: `0199b7e2c4a1` `0003` `a1b2c3d4e5f60718`.
- **Vergelijking**: gewone stringvergelijking. Dat is gelijk aan lexicografisch (ms, c, node), dus bij gelijke (ms, c) beslist het apparaat-ID (S-06).
- **Klokstaat** `(l, c)` staat in `meta.hlc` en wordt in elke schrijftransactie bijgewerkt. Bij opstarten geldt `max(opgeslagen, nu)`.
- `now()`: `pt = clock.nowMs()`. Is `pt > l`, dan `(pt, 0)`, anders `(l, c+1)`. Bij `c = 0xffff` wordt het `(l+1, 0)`.
- `observe(remote)`: is `remote.ms ≤ pt + 24 u`, dan `(l, c) = max((l, c), (remote.ms, remote.c))`. Anders wordt de klok **niet** bijgesteld (drift-bescherming, S-16): het register zelf wordt wel gemerged, en er komt één logregel (`hlc.future`).
- **Schrijfregel (causaliteit per item, S-16 en sectie 3)**: `stamp(item) = max(now(), succ(maxHlc(item)))`. Hierin is `maxHlc` het maximum over alle registers en de verwijder-HLC van dat item (of van de lijstregisters bij een lijstoperatie). `succ(h) = (h.ms, h.c+1, eigen node)`, met overloop naar `(h.ms+1, 0)`. Gevolg: wat het apparaat van een item heeft gezien, wordt altijd overruled door zijn volgende schrijfactie, hoe de klokken ook staan. Een HLC van ver in de toekomst sleept de globale klok niet mee.
- **Validatie bij ontvangst**: `/^[0-9a-f]{32}$/` en `ms < 2^48`, anders is het event ongeldig (S-14).

### 5.3 Registers en item
Een **register** is `[waarde, hlc]`. Merge: de hoogste HLC wint. Bij gelijke HLC wint de grootste `canonicalJSON(waarde)` als string. Dat komt bij correcte apparaten niet voor, maar maakt de merge totaal.

Een **item** is `{ id, regs: Map<sleutel, Register>, del: Hlc | null }`.

| Sleutel | Betekenis | Type (v1-validatie) |
|---|---|---|
| `n` | naam | string 1–80, getrimd |
| `q` | hoeveelheid | number ≥ 0, ≤ 1e6, of null |
| `u` | eenheid | string ≤ 20 of null |
| `o` | notitie | string ≤ 200 of null |
| `k` | categorie-ID (§8.1) | string ≤ 32; onbekend ID → tonen onder Overig, maar behouden |
| `x` | afgevinkt | boolean |
| `a` | toegevoegd (waarde = wandklok-ms, alleen ter info) | number. **Sorteersleutel = de HLC van `a`** |
| `r` | herstelmarkering (undo, F-07) | `true` |
| overige | onbekend (nieuwere versie) | elke JSON-waarde. Sleutel moet voldoen aan `/^[A-Za-z][A-Za-z0-9_]{0,15}$/`. **Bewaren en doorgeven** |

- **Aanmaken**: alle opgegeven velden plus `a`, `x=false` en `k` krijgen dezelfde HLC `h0`.
- **Bewerken**: alleen de gewijzigde velden krijgen `stamp(item)`.
- **Verwijderen**: `del = stamp(item)`.
- **"Afgevinkte wissen"**: per afgevinkt, levend item een verwijdering, allemaal in één transactie.
- **Herstellen (undo)**: `r = [true, stamp(item)]`. Die stamp is groter dan `del`, dus het item leeft weer met exact de oude waarden (S-07f).
- **R-DEL** (sectie 3): `deleted(item) ⇔ del ≠ null ∧ del > max(hlc van alle registers, ook onbekende)`.

### 5.4 Lijst
Lijststaat = `{ readonly regs: Regs, readonly items: ReadonlyMap<id, ItemState> }`. De lijstregisters zijn:
- `n` (naam, 1–40);
- `D` (verwijderd: waarde `true`; de lijst is verwijderd zodra `D` bestaat — "wint altijd" — en de staat is groeiend);
- onbekende registers worden bewaard.

De volgorde van lijsten (F-20) is alleen lokaal (`lists.position`) en wordt niet gesynct. De Could F-20 "synct" vraagt dan een LWW-register `p`; dat is pas bij uitvoering te beslissen.

### 5.5 Merge
- `mergeItem(a, b)`: unie van de registersleutels, per sleutel registermerge; `del = max(a.del, b.del)` (null is het kleinst).
- `mergeList(a, b)`: unie van de registers en unie van de items, per item `mergeItem`.
- Een **snapshot-deel** (§6.5) is een gedeeltelijke lijststaat (een deelverzameling van de items) en wordt op dezelfde manier gemerged.
- Het resultaat van merge is altijd een nieuwe waarde (immutable). `materialize(list)` geeft het `ListView`: levende items, zichtbare waarden en sortering (§8.2).
- **Invariant (v1.0, D-32):** een `ItemState` wordt nooit in-place gewijzigd. Een ongewijzigd item behoudt zijn referentie over een merge heen. `materialize` hergebruikt daarom één `ItemView` per `ItemState` (`WeakMap`), zodat `memo(ItemRow)` ongewijzigde rijen overslaat (§12). Afgedwongen tijdens het compileren (`Regs = Readonly<…>`, nieuwe objecten via `MutableRegs`, `ReadonlyMap`, D-33) en tijdens het draaien (`test/integration/immutability.test.ts`, negatief bewezen).

### 5.6 Vooruitcompatibiliteit (S-20)
- **Onbekende registersleutels** (item of lijst) binnen schemaversie 1 worden opgeslagen in de JSON-kolom `regs`, gemerged met de generieke registerregel, meegenomen in de eigen snapshots en meegeteld in R-DEL. Zo gaat er nooit iets verloren.
- **Onbekende top-level velden** in de payload worden genegeerd.
- **Bekende sleutel met het verkeerde type**: het event is ongeldig (S-14). Een nieuwere versie die een type wil wijzigen, moet de hoofdversie ophogen.
- **Payload met `v > 1`**:
  - het ruwe event wordt opgeslagen in `future_events` (laatste per afzender en d-tag), niet gemerged;
  - `lists.future_schema = 1` wordt gezet, de status wordt `fout` en de UI toont "Werk de app bij om deze lijst te synchroniseren";
  - de eigen v1-snapshots worden gewoon verder gepubliceerd;
  - na een update verwerkt de migratie `future_events` opnieuw.

### 5.7 Canonieke serialisatie ("gelijke staat", sectie 3)
`canonical(list) = JSON` met:
- gesorteerde sleutels;
- `regs` als object met gesorteerde sleutels;
- `items` als array gesorteerd op `id`, elk `{id, regs, del}`;
- getallen via `JSON.stringify`;
- geen witruimte.

Dezelfde functie levert de deel-hash (`sha256`) voor "deel ongewijzigd?" (§6.6).

### 5.8 Bewijsschets van convergentie (S-04, S-05)
1. **Halfroosters.** Registers zijn totaal geordend op (hlc, canonieke waarde). `max` is dan een join: commutatief, associatief en idempotent. `del` is `max` over `Option<Hlc>` en ook totaal geordend. Een map van sleutel naar halfroosterwaarde is met puntsgewijze unie+join weer een halfrooster. Een product van halfroosters is een halfrooster. Dus `mergeItem` en `mergeList` zijn joins, wat S-05 bewijst. De property-tests verifiëren dit.
2. **Inflatie.** Elke lokale operatie is `s' = s ⊔ δ` met `δ` een register met een strikt grotere stamp. Elke ontvangst is `s' = s ⊔ m`. De staat van een apparaat stijgt dus alleen.
3. **Snapshots zijn ondergrenzen.** Een gepubliceerd deel is een deelverzameling van de staat van de afzender op dat moment, dus `≤ s_afzender`. Oude, dubbele of herordende snapshots mergen tot hooguit wat al bekend is (idempotent), wat S-11 bewijst.
4. **Aflevering.** Een apparaat dat online is geweest, heeft na zijn laatste wijziging per deel een event op ≥ 1 relay. De eigen-staatcontrole (§6.8) herstelt verlies. De versie per slot (`created_at`) ligt strikt boven alles wat ergens kan staan (de vloer-invariant van §6.6), dus een relay vervangt nooit nieuw door oud. Elk apparaat haalt van alle leden het laatste event per deel op.
5. **Gelijke staat.** Na quiescentie (geen nieuwe operaties, alle laatste events afgeleverd) geldt `s_X = ⊔ (alle operaties)` voor elk apparaat X. Elke operatie zit namelijk in de staat van wie hem maakte, die staat is gepubliceerd en iedereen heeft gemerged. Omdat join een functie is, zijn alle `s_X` gelijk. `materialize`, R-DEL en `D` zijn functies van de staat, dus de getoonde lijst is ook gelijk.
6. **Opsplitsen.** De deelfunctie is deterministisch voor een gegeven aantal delen, en een deel is altijd een geldige deelstaat. Verschillende aantallen delen bij verschillende afzenders schaden dus niet.
7. **Causaliteit.** De schrijfregel (§5.2) geeft `stamp > alles wat gezien is van dat item`. Dat bewijst S-16 en de regel uit sectie 3.
8. **Terminatie.** Een apparaat publiceert alleen als de deel-hash veranderd is. Een ontvangen staat die niets toevoegt, verandert niets, dus er ontstaat geen publicatielus.

## 6. Sync-protocol over Nostr

### 6.1 Geheim en afgeleide sleutels
- **Lijstgeheim `S`**: 32 willekeurige bytes. Wordt aangemaakt bij de eerste keer delen, of overgenomen bij koppelen.
- HKDF-SHA256 met `salt = utf8("bootschap/v1")`:
  - `listTag = hex(HKDF(S, info="list-tag", 16))`, 32 hex-tekens. Basis van de d-tag en zichtbaar voor relays;
  - `encKey = HKDF(S, info="enc-key", 32)`, de XChaCha20-Poly1305-sleutel.
- **Nostr-identiteit**: per **installatie per lijst** een eigen willekeurige secp256k1-sleutel: `random.bytes(32)`, gecontroleerd met `transport.identityFromSecret` (geldige scalar, anders opnieuw trekken; geen `generateSecretKey`, E-11), **niet** afgeleid uit `S`. Daardoor:
  - kan een ander lid de vervangbare slot van dit apparaat niet overschrijven;
  - kan een relay twee lijsten van hetzelfde toestel niet via de publieke sleutel koppelen (NF-03).
- **Opslag** (NF-04), in `expo-secure-store` met `keychainAccessible: AFTER_FIRST_UNLOCK`:
  - `bs.list.<lokaalId>.secret` (hex van `S`);
  - `bs.list.<lokaalId>.nostr` (hex van de privésleutel).
  SQLite bevat alleen de afgeleide `list_tag` en de publieke sleutel. Sleutels worden lui en parallel geladen en zijn niet nodig om lijsten te tonen (NF-10).
- **Authenticiteit**: alleen wie `S` kent, kan een geldige AEAD-tag maken. De ontvanger accepteert inhoud uitsluitend als AEAD-decryptie slaagt. De Nostr-handtekening wordt ook gecontroleerd (S-14), maar bepaalt het lidmaatschap niet. Elk lid is gelijkwaardig (B-02).

### 6.2 Envelop
- `content = base64( 0x01 ‖ nonce(24) ‖ ciphertext )`. Hierin is `0x01` de versie van de envelop en is de nonce 24 willekeurige bytes per bericht (NF-01).
- `AAD = utf8("bootschap/v1|" + sender + "|" + channel + ":" + slot)`, met `sender` = pubkey, `channel` = listTag en `slot` = deelnummer. Voor Nostr is `channel:slot` precies de d-tag. De **engine** bouwt de AAD, zodat die in beide transports gelijk is (E-17). Dat bindt de inhoud aan afzender en slot: inhoud die naar een andere sleutel of slot is gekopieerd, faalt (NF-02c).
- `plaintext = deflate(utf8(JSON(payload)), niveau 6)`. Inflate gebeurt streamend met de fflate-klasse `Inflate`, met een teller per chunk die afbreekt boven 4 MiB (bescherming tegen een zip-bom). `inflateSync` is niet toegestaan, omdat die geen limiet heeft (E-16). Bij overschrijding is het event ongeldig.

### 6.3 Nostr-event
```
kind: 30078                       (NIP-78, parameterized replaceable)
tags: [["d", "<listTag>:<i>"]]   i = deelnummer 0..15, decimaal
content: envelop (§6.2)
created_at: de versie van het slot (§6.6, §6.8)
```
Er zijn **geen andere tags** (geen `p`, `t`, `client` of `alt`). Er worden geen andere kinds gepubliceerd, ook geen profiel (kind 0).

### 6.4 Payload en de keuze voor snapshots
```jsonc
{ "v": 1,                 // schema-hoofdversie (S-20)
  "dev": "<node hex16>",  // afzender-apparaat (alleen informatief)
  "rev": 123,             // lists.state_rev van de afzender (monotoon per lijst)
  "sh": [i, S],           // deelnummer en aantal delen
  "b": 1759740000000,     // = kleinste ms van alle HLC's in dit deel (E-16), dus (ms − b) ≥ 0
  "nodes": ["a1b2…", …],  // nodetabel
  "l": { "n": ["Boodschappen", "<h>"], "D": … },   // lijstregisters, in ELK deel
  "it": [ ["<itemId>", { "n": ["melk", "<h>"], "x": [true, "<h>"], … }, "<delH>"?], … ] }
```
- **Compacte HLC** in de payload: `"<(ms-b) base36>.<c base36>.<node-index>"`. De codec zet die om van en naar de canonieke 32-hex-vorm. Validatie: de envelop-velden zijn streng, de itemrecords worden per record gecontroleerd (§6.7, E-16).
- **Gemeten grootte** (realistische lijst, willekeurige ID's, 30% tombstones): ±41 bytes per item na deflate, ±55 bytes per item in het event. 100 items ≈ 6 KB, 1000 items ≈ 55 KB (2 delen).
- **Waarom volledige snapshots en geen delta's in v1:**
  - een state-based CRDT met volledige staat is eenvoudig te bewijzen (§5.8);
  - het overleeft relays die oude events opruimen, omdat alleen het laatste event per slot nodig is;
  - nieuwe leden hoeven geen historie te verzamelen;
  - de latentie wordt al gehaald (§6.6).
- **Delta's** (bijvoorbeeld ephemeral kind 2xxxx voor snelle live-updates) zijn een latere optimalisatie. Ze zijn mogelijk zonder protocolbreuk, omdat delta's ook deelstaten zijn.

### 6.5 Opsplitsen en grootte (S-15, A-02)
- **Harde grens**: 65.536 bytes per geserialiseerd event. **Doel**: ≤ 48 KiB (`config.targetEventBytes = 49152`).
- `Transport.maxPayloadBytes` vertaalt dat naar een limiet voor de envelop. Voor Nostr is dat `floor((49152 − 450) × 3/4) − 41`.
- Een item zit in deel `fnv1a32(utf8(itemId)) & (S−1)`, met `S ∈ {1, 2, 4, 8, 16}` per lijst (`lists.shard_count`).
- De lijstregisters zitten in elk deel. Item en tombstone gaan altijd samen (één item-record).
- **Groeien**: is een opgebouwd deel groter dan `maxPayloadBytes`, of weigert een relay met een grootte-reden (`invalid: event too large…`), dan `S := min(16, 2S)`. Dat wordt persistent opgeslagen en alle delen worden opnieuw gepubliceerd.
- `S` krimpt in v1 nooit, dus er blijven geen verweesde delen achter.
- **Capaciteit**: 16 × 48 KiB ≈ 14.000 item-records. Is dat zelfs bij `S = 16` te weinig, dan wordt de status `fout` met de tekst "Lijst te groot om te synchroniseren". Dat staat als bekende beperking in de README (S-22, opruimen van tombstones, is een Could).
- **Ontvanger**: een event van meer dan 100.000 tekens wordt vóór verdere verwerking genegeerd (S-14).

### 6.6 Publiceren: venster, versies, outbox, acks en retry

**Eigenaarschap (E-3, E-5).**
- De **engine** bezit:
  - vensters en flushes;
  - de **versie per slot** (`shard_state.last_version`, `floor_version`, `floor_before`);
  - de klokcorrectie (`meta.clock_offset_sec`, persistent);
  - de in-flight-administratie;
  - **alle** (her)verzendingen en retrytimers.
- De **transport** ondertekent (`prepare`), verstuurt frames naar de endpoints die de engine noemt, en meldt per `(endpoint, messageId)` één uitkomst. De transport zet niets in een wachtrij en probeert nooit zelf opnieuw. `send` naar een endpoint dat niet open is, geeft meteen de uitkomst `not-connected`. Herstel loopt dan via de eigen-staatcontrole na de volgende EOSE (§6.8).

**Trigger.**
- Na elke lokale commit: `notifyLocalChange(listId)`. Het eerste ongepubliceerde wijzigmoment opent een venster van **1000 ms** (S-21). Bij het einde van het venster volgt een flush. Tussen twee flushes van dezelfde lijst zit minstens 1000 ms.
- Alleen door ontvangst veroorzaakte wijzigingen gebruiken een venster van **3000 ms**.
- De eerste publicatie na "delen" gaat direct.
- Bij `AppState → background`: flush direct.
- Geen flush zolang `joined_pending = 1` geldt (E-15), zodat er geen lege snapshot uitgaat.

**Single-flight per lijst (B-2).**
- **Elk** pad gaat via dezelfde functie `Publisher.flush(listId)`: venster, delen, `background`, `syncNow`/`kick`, `too-large`, terugrollen, rotatie en het wachten van I-3.
- Die functie loopt onder een **async-lock per lijst**. Een aanvraag tijdens een lopende flush zet alleen de vlag `again`. Na afloop volgt precies één extra flush; aanvragen worden samengevoegd.
- Er lopen dus nooit twee flushes van dezelfde lijst tegelijk.
- Het opnieuw versturen van een **bestaand** event (retry, eigen-staatcontrole, de timer van §6.8 stap 3) bereidt niets voor en wijzigt geen versie. Dat hoeft dus niet onder de lock.

**Flush(listId):**
1. `repo.read`: lijststaat, `state_rev`, `shard_count` en de rijen van `shard_state`. Dat is alleen gecommitte data (§9.2). Onthoud per slot `floor_version` als `floorRead`.
1b. **Wachten op klokantwoorden (I-3).** Heeft het huidige `last_event` van een slot ≥ 1 `clock-*`-weigering en staan er nog antwoorden open, dan wacht de flush tot die binnen zijn. Dat duurt maximaal 8 s (de publicatie-time-out). Daarna volgt de beslissing van §6.8 stap 2, en dan stap 1 opnieuw. Normaal is er geen weigering, dus dit raakt S-12 en S-09 ("trage relay") niet.
2. Verdeel de items over delen. Bereken per deel `hash = sha256(canonical(deel))` en sla delen over met `hash == published_hash`.
3. Bepaal per gewijzigd deel:
   - `nowAdj = floor(clock.nowMs()/1000) + offsetSec` en de versie `v = max(nowAdj, floor_version + 1)`;
   - **één definitie** (B-1): `clockDerived = (v == nowAdj)`. Als `nowAdj == floor_version + 1`, is `clockDerived` dus waar;
   - de AAD (§6.2) en de envelop, gevolgd door `transport.prepare({ channel, slot, identity, version: v, envelope })` → `{ id, raw, version }`.
   - Geldt `floor_version − nu_aangepast > 3600`, dan eerst identiteitsrotatie (§6.8).
4. **Eén transactie met CAS (B-2)**:
   - eerst per slot controleren: `floor_version == floorRead`. Wijkt die af, dan `ROLLBACK`, de voorbereide events weggooien (nooit verstuurd) en de flush herstarten bij stap 1. Dit is een vangnet: met de lock komt het niet voor;
   - `published_rev`, `published_hash`, `last_event_id`, `last_event_raw`, `last_version = v`, `last_clock_derived = clockDerived`;
   - `floor_before = floor_version`;
   - `floor_version = max(floor_version, v)`.
5. Pas daarna `transport.send(prepared, openEndpoints)`, met de `inFlight`-registratie (zie hieronder).

**Invariant**: `floor_version` ≥ de versie van elk eigen event dat op enige relay kan staan. Door de lock en de CAS heeft elk nieuw event een strikt hogere versie dan alles daarvoor, dus de relay vervangt altijd oud door nieuw (S-10b). `last_event_*` is altijd het nieuwste event van het slot (E-3b).

**`inFlight` (E-12, B-1)**:
- In het geheugen, **gesleuteld op event-ID**: `inFlight[id] = { listId, shard, rev, version, clockDerived, sentTo: Set, answers: Map<endpoint, uitkomst>, deliveredBy: Set }`.
- **Elke** verzending van hetzelfde event **voegt samen** met de bestaande regel (`sentTo ∪= …`): een eerste verzending, een retry, de eigen-staatcontrole en de timer van §6.8 stap 3.
- `deliveredBy` krijgt een endpoint erbij zodra die relay het event bij een REQ of EOSE levert (§6.7, stap 3).
- Na een herstart is de regel leeg en begint de run opnieuw. `version` en `clockDerived` komen dan uit `shard_state` (`last_version`, `last_clock_derived`).
- Een regel vervalt bij een nieuwer event voor het slot, of na 15 min.
- Een uitkomst voor een `messageId` zonder regel wordt genegeerd. Een latere ack of de eigen-staatcontrole dekt hem toch.

**Uitkomsten per endpoint**:

| Uitkomst | Actie van de engine |
|---|---|
| `accepted` (OK true, ook `duplicate:`) | Transactie: `acked_rev = max(acked_rev, rev)`, `relay_acks(…, event_id, version)`, `pending_changes` opruimen (`rev ≤ acked_rev` en `shardOf(item_id) = i`; rijen met `item_id IS NULL` bij een ack van een willekeurig deel). Correctieteller `k := 0`. |
| `timeout` (geen OK binnen 8 s) of `rate-limited:` | Hetzelfde event (`last_event_raw`) opnieuw naar dat endpoint na 2, 4, 8, 16 en 32 s: **maximaal 5 retries per event per endpoint** (E-13). Daarna alleen nog via de eigen-staatcontrole of `kick()`. Vervalt als het deel een nieuwer event heeft. |
| `rejected: too-large` | `shard_count := min(16, 2·shard_count)`, persistent, en direct een flush van alle delen (§6.5). |
| `rejected: clock-ahead` / `clock-behind` | Zie §6.8, klokcorrectie. |
| `rejected: refused` (`blocked:`, `restricted:`, `auth-required:`, `pow:`) | Endpoint "weigert" voor deze lijst. Telt mee voor `fout` (S-17). Hetzelfde event gaat langzaam en begrensd opnieuw naar dit endpoint (ook bij `other`): na 30 s, 1 min, 2 min en daarna elke 5 min, maximaal 12 keer (`refusedRetryDelaysMs`/`refusedRetryMax`, D-35, D-ET-05). Daarnaast bij `kick()` of een reconnect. |
| `not-connected` | Niets doen. De eigen-staatcontrole na de volgende EOSE verstuurt het. |

Een `inFlight`-regel vervalt pas bij een nieuwer event voor het slot, of na 15 min (zie hierboven). Antwoorden blijven dus samengevoegd beschikbaar voor de terugrolbeslissing (B-1).

Het aantal wachtende wijzigingen (S-17, UX-02) is `COUNT(pending_changes)` voor de lijst. `pending_changes` worden alleen geschreven voor gedeelde lijsten (E-15).

### 6.7 Abonneren en ontvangen
**Eén abonnement per relay** (nos.lol en primal staan maar 20 subscriptions toe):
- `setSubscriptions(subs)` geeft een **generatie** `g` terug;
- de transport stuurt per open relay `CLOSE bs<g−1>` en `REQ bs<g>`;
- `endOfStored(endpoint, g)` hoort bij die generatie, en de engine voert de eigen-staatcontrole alleen uit voor de lijsten van generatie `g` (E-17).

Er zijn twee filters:
1. `{kinds:[30078], "#d": [alle "<listTag>:<0..15>"]}` — `slots` is altijd 16, dus alle mogelijke delen, ongeacht de eigen `S` (E-17);
2. hetzelfde, plus `authors: [bekende leden, max 50]` uit `members`, tegen verdringing door spam.

Het abonnement blijft open na EOSE (live, S-12).

**Ontvangstpijplijn** (goedkoopste controles eerst; elke fout leidt tot negeren, een teller en één logregel per code per minuut, zonder inhoud):
1. Vorm: `kind == 30078`, event-JSON ≤ 100.000 tekens, d-tag bekend in `dIndex`.
2. Elke levering telt voor de eigen-staatcontrole (`observe`), ook duplicaten (D-17).
3. **Eigen sleutel?** Bestaat er een `inFlight`-regel voor `eventId`, dan `deliveredBy ∪= {endpoint}` (B-1). Eigen events worden **nooit** gemerged (D-17), dus hier stoppen.
4. **Dedup** op event-ID (LRU van 10.000): een al verwerkt ID stopt hier.
5. `msg.verify()` (Nostr: id-hash en Schnorr; Memory: altijd waar).
6. Base64 decoderen. De AAD bouwt de engine zelf uit `(sender, channel, slot)`. Daarna AEAD ontsleutelen met `encKey`. **Pas nu wordt het event-ID in de dedup-set opgenomen** (v1.0, review M1–M3b bevinding 2). Zo kan één relay met een vervalste kopie het echte event van andere relays niet onderdrukken.
7. Streamend inflaten (limiet 4 MiB), JSON parsen.
   - De **envelop-velden** (`v`, `sh`, `b`, `nodes`, `l`) worden streng gevalideerd. Bij een fout gaat het hele event weg.
   - **Item-records** worden **per record** gevalideerd: een ongeldig record wordt overgeslagen en gelogd (`payload.record-invalid`), de rest wordt gemerged. Een deelverzameling van geldige records is nog steeds een ondergrens (§5.8, punt 3) (E-16).
   - Bij `v > 1` → §5.6.
8. **Merge** via de schrijfwachtrij van de facade (§9.3): transactie (items laden, mergen, gewijzigde rijen schrijven, `state_rev++` als er iets veranderde), daarna dezelfde merge op de geheugencache. Vervolgens `clock.observe(max HLC)`, `members` bijwerken, `onChange` en bij een wijziging `notifyRemoteChange`.
9. **Koppelen (F-14)**: zolang `joined_pending = 1`, telt de engine per afzender welke delen `sh=[i,S]` binnen zijn. Zie §7 voor de afsluitregel.

### 6.8 Eigen-staatcontrole, versies en klokcorrectie (S-10, S-16)
**Eigen-staatcontrole.** Na elke `endOfStored(R, g)` controleert de engine, voor elke gedeelde lijst in generatie `g` en elk deel `i < S`, of R het eigen event `last_event_id` heeft geleverd. Zo niet, dan stuurt hij `last_event_raw` naar R, met een nieuwe `inFlight`-regel (`sentTo = {R}`). Dit dekt:
- een relay die terugkomt (S-09);
- wipe (S-10a);
- een oud eigen event (S-10c);
- stil laten vallen (S-10d);
- een kill tussen persisteren en versturen (S-02);
- uitgeputte retries (E-13).

Bij opstarten volgt een flush per gedeelde lijst (ongewijzigde delen worden overgeslagen), daarna de controle na elke EOSE.

**Versie = `created_at`.** De engine kent de versie toe (§6.6, stap 3). `NostrTransport` zet die in `created_at`. `MemoryHub` ordent er per slot op (§13.2). Beide transports hebben dus dezelfde semantiek: de hoogste versie wint, en bij gelijkspel het laagste ID. Omdat de versie per slot persistent en strikt stijgend is, overleeft dit kill en herstart (E-3d).

**Klokcorrectie** (`offsetSec` in `meta.clock_offset_sec`, **persistent**, E-3c). Bij een uitkomst `clock-*` van een relay voor event `e` (`clockDerived` komt uit `inFlight`, of na een herstart uit `last_clock_derived`):
1. **Correctie, maximaal één keer per event.**
   - Is `e.clockDerived`, dan bij `clock-ahead`: `offsetSec −= 300 · 2^k`, `k++`, met een totaal van maximaal −48 u. Persisteren. De klok gaat zo naar de **strengste** relay.
   - Bij `clock-behind`: `offsetSec += 300 · 2^k`, daarna een normale flush van dat slot via de lock. De nieuwe versie is hoger dan `e`, dus terugrollen is niet nodig en ook zinloos.
   - Een correctie gebeurt alleen bij een weigering, nooit door een relay die accepteert.
2. **Terugrollen (B-1)** alleen als **alle** voorwaarden waar zijn:
   - (a) **elke relay uit de relayset** gaf in deze run voor `e` het antwoord `clock-ahead` (`answers` bevat alle endpoints met `clock-ahead`);
   - (b) geen relay accepteerde `e` (ook niet `duplicate:`);
   - (c) `deliveredBy` is leeg, dus geen relay leverde `e` bij een REQ;
   - (d) `e.version == floor_version`, `e` is `last_event` en `e.clockDerived`. Bij een keten mag `e` vloer-afgeleid zijn, mits de keten een klok-afgeleid event bevat (D-03b, zie hieronder).

   Dan, via `rollbackFloor` (transactie met CAS, binnen de lock):
   - `floor_version := newFloor`;
   - **`last_event_id`, `last_event_raw`, `last_version` en `last_clock_derived` worden ingetrokken** (NULL/0), zodat het event nooit meer wordt verzonden, ook niet door de eigen-staatcontrole of na een herstart (v1.0, review bevinding 1);
   - daarna `flush(listId)`. Dat geeft een nieuwe, lagere versie (want `offsetSec` daalde), een nieuw event, persisteren en versturen.

   **Terugrollen via een keten (D-03/D-03b, D-25).** `newFloor` is standaard `floor_before`. De pure functie `rollbackTarget` volgt daarnaast de echte voorgangers via `InFlight.prevId`, zolang:
   - elke voorganger dezelfde bewijslast (a)–(c) haalt;
   - `prev.version == newFloor` geldt.

   Bij elke stap wordt `newFloor := prev.floorBefore`.

   Ook een vloer-afgeleid laatste event mag via de keten terugrollen, mits de keten minstens één klok-afgeleid event bevat. Dat levert een klokcorrectie op, dus vooruitgang en geen lus.

   Na een terugrol is `prevId` van het volgende event `null`, waardoor een keten nooit over een terugrolgrens heen gaat.

   Is één relay niet open of heeft hij nog niet geantwoord, dan wordt er **niet** teruggerold, maar volgen stap 3 of 4.

   **Waarom dit veilig is, ook na een herstart**:
   - Een relay die `e` ooit heeft opgeslagen, kan voor `e` geen `clock-ahead` meer geven. Hij antwoordt `duplicate:` of levert `e`, en dan zijn (b) of (c) onwaar.
   - De S-16-situatie van de Engineer (A accepteerde vóór de herstart, B weigert erna) rolt dus niet terug: A antwoordt `duplicate` of levert `e`.
   - Een versie die van de vloer komt (`!clockDerived`), wordt nooit teruggerold. Zo ontstaat er geen lus. Herhaling convergeert, begrensd door −48 u.
3. **Wachten in plaats van roteren.** Wordt er niet teruggerold en heeft een relay `e` met `clock-ahead` geweigerd, dan zet de engine een **timer per slot** (K-3): `resendAt = tijdstip waarop e.version ≤ nu_aangepast + 240`, minimaal 30 s. Op dat moment wordt `last_event_raw` naar die relay gestuurd (samengevoegd in `inFlight`). De timer wordt geannuleerd bij een nieuwer event of bij `pause`. Na een herstart vangt de eigen-staatcontrole het op.

   **Geen nieuwe identiteit.** Een relay met een ruimere tolerantie (300–900 s) houdt `e` hooguit ±15 min voor, dus de strenge relay accepteert vanzelf binnen ≤ 15 min. Intussen loopt de sync via de andere relay.

   **Restgeval**: een relay die blijvend dicht is, blokkeert (a). Dan blijft de vloer staan, en bij een voorsprong van > 1 u volgt rotatie (stap 4). Dat is veilig, want bij een voorsprong van > 1 u heeft geen enkele strenge relay het event.
4. **Identiteitsrotatie** alleen bij een echte wegloper: `floor_version − nu_aangepast > 3600` bij een flush. Dan volgt:
   - een nieuwe sleutel via `Random` (in de secure store, `lists.nostr_pubkey`);
   - de rijen van `shard_state` voor deze lijst krijgen versies 0;
   - de eigen nieuwe pubkey komt in `members`;
   - alle delen worden opnieuw gepubliceerd.
   Het oude slot bevat een oudere staat en is dus onschadelijk.

`k` gaat terug naar 0 bij elke accept. Met maximaal 1 publicatie per seconde per slot loopt de versie niet weg van de klok.

**Gemeten op 2026-10-06**: alle vijf relays weigerden +1 u met `invalid: created_at too late`. De toleranties zijn 300 s (nostr.wine) en 900 s (strfry-standaard).

**Tests** (S-16, S-10b, E-3; zie §13.6):
- klok +1 u met tolerantie 900 s;
- klok −1 u met een relay die "too early" geeft bij meer dan 30 min oud (L-3);
- twee relays met tolerantie 300 s en 900 s, klok +10 min, 3 herstarts → geen nieuwe identiteit en convergentie;
- **B-1, herstart en eigen-staatcontrole**:
  - A (900 s) accepteert `e`, B (300 s) weigert;
  - kill en herstart;
  - EOSE: A levert `e`, B krijgt `e` opnieuw en weigert;
  - verwacht: **geen** terugrol (`floor_version` ongewijzigd);
  - daarna een bewerking: A houdt uiteindelijk het nieuwste event, en B accepteert na de wachttimer;
- **B-1 positief**: klok +1 u, beide relays weigeren `e` → terugrol, nieuw event aanwezig ≤ 30 s, geen rotatie;
- **I-3**: klok +1 u, 5 bewerkingen in 2 s, relay-latentie 200 ms → geen rotatie, aanwezig ≤ 30 s;
- **B-2**:
  - twee flushes in dezelfde seconde forceren: `too-large` tijdens een venster-flush, plus de hook `faults.at('in-prepare')` die `prepare` laat wachten;
  - verwacht: strikt stijgende versies per slot, de relay houdt het nieuwste event;
  - een geforceerde CAS-afwijking geeft een herstart van de flush;
- twee publicaties in dezelfde seconde.

### 6.9 Sync-status (S-17, UX-02)
Status per lijst is een **pure functie** `deriveSyncStatus(input)` in `src/sync/engine/status.ts`. De invoer:
```ts
{ shared, joinedPending, relaysTotal, relaysOpen, relaysConnectingFirstAttempt /* E-20 */, pendingCount,
  initialFetchDone /* EOSE van ≥1 relay sinds laatste (re)connect/trigger */, inFlight,
  failingSinceMs /* zie hieronder */, futureSchema, tooLarge, nowMs }
```
Volgorde (de eerste die waar is, wint):
1. `!shared` → `lokaal`
2. `relaysOpen == 0 && !relaysConnectingFirstAttempt` → `offline` (met `pendingCount`). Bij de eerste verbindingspoging na start, voorgrond of kick (≤ 10 s) is de status dus `bezig` en niet `offline` (E-20).
3. `futureSchema || tooLarge || (pendingCount > 0 && relaysOpen ≥ 1 && failingSinceMs && now − failingSinceMs ≥ 30 s)` → `fout`
4. `joinedPending || relaysOpen == 0 || !initialFetchDone || inFlight || pendingCount > 0` → `bezig`. Bij `joinedPending` toont de UI "Ophalen…" (F-14).
5. `relaysOpen < relaysTotal` → `beperkt (x van y)`
6. anders → `gesynchroniseerd`

**`failingSinceMs`** (besluit van de Projectleider, v0.2-review (a): `timeoutsCountAsFailure = true`, S-17 in REQUIREMENTS v0.3.1):
- Het moment vanaf wanneer **onafgebroken** geldt:
  - `pendingCount > 0`;
  - ≥ 1 relay open;
  - **geen** relay heeft sinds dat moment een publicatie van deze lijst bevestigd;
  - de laatste uitkomst van elke open relay voor deze lijst is een expliciete weigering (`refused`, `other`, of een `clock-*` die niet is opgelost) **of een time-out**.
- Een ack van een willekeurige relay zet `failingSinceMs` op `null`. De status herstelt dan via `bezig` naar `gesynchroniseerd` of `beperkt`.
- Zonder open relay blijft het `offline`, want regel 2 gaat voor.
- De vlag `timeoutsCountAsFailure` staat standaard op **`true`**. Met `false` tellen alleen expliciete weigeringen; dat is uitsluitend bedoeld voor tests van het oude gedrag.

**UI-tekst bij `fout`** (UX-02, rustig): "Synchronisatiefout" met de subregel "Je wijzigingen staan veilig op deze telefoon. De app blijft het opnieuw proberen." Bij `reason = 'nieuwere-versie'` (S-20): "Werk de app bij om deze lijst te synchroniseren." De mogelijke redenen zijn `'nieuwere-versie' | 'te-groot' | 'geweigerd' | 'geen-antwoord'`. `geweigerd` betekent minstens één expliciete weigering; `geen-antwoord` betekent alleen time-outs (v1.0).

**Test** (`status.test.ts`):
- alleen time-outs op beide open relays met `pendingCount = 2` → na 29 s `bezig`, na 30 s `fout`;
- daarna een ack → `gesynchroniseerd`;
- hetzelfde met 0 open relays → `offline`;
- time-outs zonder wachtende wijzigingen → geen `fout`.

De engine stuurt een statusgebeurtenis bij elke wijziging van de invoer, gethrottled op 250 ms. `statusText(status)` (`src/ui/statusText.ts`) levert de teksten en iconen van UX-02.

### 6.10 Relayverbindingen en multi-relay (S-09)
`RelayConnection` per URL (eigen implementatie op een geïnjecteerde `WebSocketFactory`; `nostr-tools/relay` en `SimplePool` worden **niet** gebruikt, omdat we volledige controle willen over backoff, OK-redenen en status):
- **Toestanden**: `idle → connecting → open → backoff → connecting …`, plus `paused` (achtergrond).
- **Time-outs**: 10 s voor verbinden, 8 s voor een publicatie.
- **Backoff**: `min(60 s, 1 s · 2^poging) · jitter(0,8–1,2)`, terug naar 0 na een geslaagde open. `kick()` (voorgrond, netwerkherstel, pull-to-refresh) breekt de backoff af en verbindt direct. Op een open relay stuurt hij de REQ opnieuw, en **tijdens `connecting` doet hij niets**, zodat er geen tweede socket ontstaat (v1.0).
- **Bij elke `open`**: REQ opnieuw sturen. Na EOSE volgt de eigen-staatcontrole (§6.8).
- **Berichten**: `EVENT`, `EOSE`, `OK`, `NOTICE` (alleen loggen), `CLOSED` (REQ opnieuw na backoff), `AUTH` (negeren).
- **Multi-relay**: publiceren gaat parallel naar alle open relays en ontvangen gebeurt van alle relays, met dedup op event-ID. Eén trage of weigerende relay vertraagt de andere niet. Een flapperende relay is onschadelijk door idempotentie en dedup.
- **Relayset**: één globale set voor alle gedeelde lijsten (E-17). Relay-hints uit een deelcode worden bij het koppelen aan de globale tabel `relays` toegevoegd (`source = 'hint'`), en zijn in de instellingen te verwijderen. Relaysets per lijst zijn niet nodig voor v1.
- **Alleen `wss://` (D-21).** `setRelays` en relay-hints accepteren alleen `^wss:\/\/[^\s/]+(\/\S*)?$`. `ws://` kan alleen met `Config.allowInsecureRelays` (standaard `false`, uitsluitend voor tests met een lokale relay). Hints die niet voldoen, worden genegeerd; `setRelays` geeft dan `CommandError('relay-ongeldig')`.
- **Transport opnieuw opbouwen (D-20, D-30).**
  - Na `join` met nieuwe hints, en na `setRelays` met een gewijzigde set, sluit de facade de oude engine en transport en start een nieuwe. Sleutels en identiteiten blijven gelden, en de eigen-staatcontrole na EOSE vult de nieuwe relays.
  - `ensureTransport`, `ensureEngine` en `rebuildTransport` lopen in één single-flight-wachtrij (`serialLifecycle`). Er bestaat dus altijd hooguit één transport en één engine.
- **Geen wachtrij en geen retry in de transport**: `send` naar een niet-open relay geeft `not-connected`. Alle herverzending gebeurt door de engine (§6.6).

### 6.11 Standaardrelays (A-01)
`wss://relay.damus.io`, `wss://relay.primal.net`, `wss://offchain.pub`, `wss://nostr.mom`. Op 2026-10-06 accepteerden en leverden alle vier een kind-30078-event van 48 KiB (damus en primal ook 70 KB). Ze draaien strfry.

Bewust **niet** gekozen:
- `nos.lol`: liet onze events stil vallen, zonder OK en zonder opslag;
- `relay.nostr.band`: onbereikbaar;
- `relay.snort.social`: alleen in geheugen.

Aanpasbaar via instellingen (F-19, Could). Het datamodel (`relays`-tabel) ondersteunt dat al vanaf M2. Minimaal 1 relay.

### 6.12 Metadata-lekkage (NF-02, NF-03; uitleg in de README)
**Wat een relay ziet:**
- IP-adres en tijdstip van verbinden;
- per lijst een willekeurige `listTag` en de publieke sleutels die eronder publiceren (dus "deze N pseudoniemen delen iets");
- grootte en frequentie van updates (dus ongeveer de omvang van de lijst en wanneer er wordt geshopt).

**Wat een relay niet ziet:** namen, items, aantallen, categorieën, lijstnamen of het aantal lijsten per persoon. Sleutels zijn per lijst, er is geen profiel en tags zijn niet afgeleid van namen.

**Waarom dit acceptabel is:** voor een gedeelde boodschappenlijst van een stel is "twee IP-adressen wisselen versleutelde blobs uit via een publieke relay" een laag risico. Inhoud en identiteit blijven beschermd.

**Beperkingen die bewust zijn gelaten:**
- Tor of een proxy is niet mogelijk in Expo Go.
- Wisselende tags zouden het ophalen van oude snapshots breken.

## 7. Delen en koppelen (F-13..F-15, F-18)

**Binaire payload van de deelcode:**
```
byte 0      versie = 0x01
byte 1..32  lijstgeheim S
byte 33     vlaggen (bit0 = relay-hints aanwezig)
[bit0]      1 byte lengte L + L bytes UTF-8: relay-URL's gescheiden door '\n' ('wss://' weggelaten; 'ws://' voluit)
laatste 2   controlesom = sha256(alle voorgaande bytes)[0..2]
```
- Relay-hints worden alleen meegestuurd als de relayset van de deler afwijkt van de standaard. Een naam zit er bewust niet in: die komt versleuteld van de relay.
- **QR-inhoud en link**: `bootschap://join#<base64url(payload)>`. Het fragment houdt de code uit de route-parameters en router-state.
- **Tekstcode**: `BS1-` + Crockford-base32(payload) in groepjes van 4 met `-`. Zonder hints zijn dat 36 bytes, ofwel 58 tekens.
- **Deeltekst** (via `Share.share`): "Doe mee met mijn boodschappenlijst in Bootschap. Open de app → Lijst toevoegen → plak deze tekst. <link> Code: <code>". Daaronder de waarschuwing van NF-05.
- **Expo Go (B-04)**: `bootschap://` opent de app in Expo Go niet. De primaire routes zijn daarom scannen in de app (`expo-camera`) en plakken. `app/+native-intent.tsx` zet `bootschap://join#X` om naar `/koppelen` met de code in het geheugen (niet in de URL-state), voor latere EAS-builds.
- **Parser** (`core/codec/sharecode.ts`): zoekt in willekeurige tekst naar `join#([A-Za-z0-9_-]+)` of `BS1-[0-9A-Za-z-]+`. De base32 is hoofdletterongevoelig, met O→0 en I/L→1. Dan volgt de controle van versie, lengte en controlesom. Foutcodes: `geen-code`, `beschadigd`, `controlesom`, `nieuwere-versie`. Elke fout krijgt een Nederlandse tekst en er wordt niets aangemaakt (F-14).

**Delen:**
1. `S` (`random.bytes(32)`) en de Nostr-sleutel aanmaken (secure store), `shared = 1` en `list_tag` zetten. Vanaf nu worden `pending_changes` geschreven (E-15).
2. Alle delen als dirty markeren en direct publiceren.
3. Het deelscherm toont "Klaar om te koppelen" zodra ≥ 1 ack binnen is, en anders de sync-status.

**Koppelen:**
1. Parse de code. Bestaat `list_tag` al lokaal, open dan die lijst ("Deze lijst staat al op je telefoon").
2. Maak anders een nieuwe lokale lijst (`shared = 1`, `joined_pending = 1`, geen registers; de UI toont de naam "Gedeelde lijst" tot er data is) en een nieuwe Nostr-sleutel. Alleen relay-hints met `wss://` worden toegevoegd. Nieuwe hints leiden direct tot het opnieuw opbouwen van de transport (§6.10).
   - Zolang `joined_pending` geldt, levert `view()` geen items (D-18).
   - Na een geslaagde koppeling wist het koppelscherm het klembord, als dat een deelcode bevat (`src/ui/clipboard.ts`; ander klembord blijft staan).
3. Abonneer. Zolang `joined_pending = 1` geldt, toont het lijstscherm **"Ophalen…"** en publiceert dit apparaat niets (E-15). `joined_pending` wordt 0 (in een transactie) bij de **eerste** van deze drie (L-2):
   - (a) van ≥ 1 afzender zijn alle delen `0..S−1` van zijn `sh=[i,S]` geldig ontvangen;
   - (b) **alle** open relays gaven EOSE voor de huidige generatie;
   - (c) er is 10 s verstreken sinds het koppelen.

   Is er bij (b) of (c) niets ontvangen, dan toont het scherm een lege lijst met "Nog niets gevonden. Vraag de ander om de app te openen." Wat later binnenkomt, verschijnt live. Een snelle, lege relay maakt dus nooit een lege of halve lijst zichtbaar zolang een andere relay nog levert. Test: `join.test.ts` met één lege, snelle relay en één gevulde relay met 500 ms vertraging.
4. Een ontvangen `D` betekent: "Deze lijst is verwijderd door een ander", gevolgd door lokaal verwijderen.

**Verlaten (F-18):**
- sleutels uit de secure store verwijderen;
- `shared = 0`, met `list_tag`, `nostr_pubkey`, `shard_state`, `pending_changes`, `relay_acks`, `members` en `future_events` gewist;
- desgewenst blijft de lijst lokaal staan (zelfde lokaal ID, dat nooit naar buiten ging), en anders worden de items verwijderd.

Er wordt niets gepubliceerd. Het oude snapshot op de relays blijft onschadelijk.

**Lijst verwijderen** (op de staat gebaseerd en bestand tegen een kill, E-14):
1. Na de bevestiging (§12.1) wordt `D` gecommit. Een lijst met `D` verdwijnt direct uit de UI (de cache filtert hem weg).
2. Een niet-gedeelde lijst wordt meteen afgerond. Een gedeelde lijst wordt direct gepubliceerd.
3. **Afronden** gebeurt bij elke ack en bij elke start, voor elke lijst met `D` die niet gedeeld is of waarvan ≥ 1 deel een ack heeft met `rev ≥` de rev van `D`:
   1. Eerst de sleutels in de secure store wissen. Dat is idempotent; `KeyStore.delete` op een ontbrekende sleutel is geen fout.
   2. Dan één transactie: `items`, `shard_state`, `pending_changes`, `relay_acks`, `members` en `future_events` van die lijst verwijderen (expliciet, deze tabellen hebben geen FK), en daarna de lijstrij.
   3. Tot slot `engine.listsChanged()`.

   Na een kill tussen stap 1 en 2 blijft de rij met `D` staan, en de volgende start rondt hem opnieuw af. Er blijven dus nooit verweesde sleutels achter. Dat is nodig, omdat SecureStore geen sleutels kan opsommen. Bij "Verlaten" geldt dezelfde volgorde: eerst de sleutels, dan de database. Een gedeelde lijst waarvan bij het opstarten de sleutels ontbreken, wordt als "verlaten" afgerond (`shared = 0`, tabellen opgeschoond, met logcode `keys.missing`).
4. Ontvangers die `D` binnenkrijgen, ronden meteen af, zonder te herpubliceren. De UI meldt: "‘{naam}’ is verwijderd door iemand met wie je deze lijst deelde."

## 8. Categorieën, sortering, suggesties en invoer

### 8.1 Categorieën en vaste volgorde (F-08, F-10, B-05)
De volgorde, ID's en namen staan in `src/core/categorize/categories.ts`. Dit is de normatieve volgorde:

| # | ID | Naam |
|---|---|---|
| 1 | `groente-fruit` | Groente & fruit |
| 2 | `brood-gebak` | Brood & gebak |
| 3 | `vlees-vis` | Vlees & vis |
| 4 | `vleeswaren-kaas` | Vleeswaren & kaas |
| 5 | `zuivel-eieren` | Zuivel & eieren |
| 6 | `ontbijt-beleg` | Ontbijt & beleg |
| 7 | `pasta-rijst-wereld` | Pasta, rijst & wereldkeuken |
| 8 | `houdbaar-conserven` | Houdbaar & conserven |
| 9 | `snacks-snoep` | Snacks & snoep |
| 10 | `dranken` | Dranken |
| 11 | `diepvries` | Diepvries |
| 12 | `huishouden` | Huishouden & schoonmaak |
| 13 | `verzorging` | Verzorging & drogisterij |
| 14 | `baby-kind` | Baby & kind |
| 15 | `huisdieren` | Huisdieren |
| 16 | `overig` | Overig |

**Categoriseren** (`categorize(name, prefs)`):
1. **Normaliseren**: lowercase, NFD en diakrieten weg, leestekens weg, witruimte samengevoegd.
2. **Voorkeur** (F-09, tabel `category_prefs`, alleen lokaal).
3. **Exacte match** in het woordenboek (≥ 400 sleutels).
4. **Enkelvoudsvormen**: strip `'s` / `s` / `en` / `eren` en herstel klinkerverdubbeling (`tomaten` → `tomaat`).
5. **Laatste woord** (en de enkelvoudsvormen daarvan).
6. **Langste woordenboeksleutel van ≥ 4 tekens die achteraan in het laatste woord staat**. Dat is het hoofd van een Nederlandse samenstelling: `volkorenbrood` → `brood`.
7. Anders `overig`. Deze functie gooit nooit een fout.

De testfixture van 100 producten stelt de Eindtester op (F-08).

### 8.2 Sortering (F-03, F-10)
De functie is `materialize` → `sections`:
- Niet-afgevinkte items worden gegroepeerd per categorie in de volgorde van §8.1. Lege categorieën worden overgeslagen. Een onbekend ID valt onder `overig`.
- Binnen een categorie wordt gesorteerd op `hlc(a)` oplopend, en bij gelijkspel op `id`.
- Daarna volgt één sectie "Afgevinkt" met dezelfde sortering (eerst categorie, dan `hlc(a)`).

### 8.3 Suggesties (F-11)
- **Index**: opgebouwd bij het opstarten uit `items`. Dat zijn alle lijsten, **inclusief verwijderde items**: verwijderen wist geen suggestie. De index wordt per `name_norm` geaggregeerd tot `{weergavenaam, count, lastMs, category, unit}` en daarna incrementeel bijgewerkt na commits en merges. Woordenboekitems vormen een tweede bron met een lagere rang.
- **Matchen**: vanaf 1 teken matcht een prefix van `name_norm` of het begin van een woord. Maximaal 8 resultaten. Historie komt eerst, met score `count · 0,5^(dagen sinds lastMs / 30)`, daarna de naam.
- **Snelheid**: bij 5000 historie-items een lineaire scan met een voorberekende woordenlijst. Doel in Node ≤ 20 ms (de eis is < 100 ms).

### 8.4 Invoer ontleden (F-12) en dubbel-detectie (F-17)
**Invoer.** Dit zijn de patronen, op de getrimde invoer:
- `^(\d+(?:[.,]\d+)?)\s*(g|gr|gram|kg|kilo|l|liter|ml|cl|st|stuks?|pak|pakken|fles|flessen|blik|zak)\s+(.+)$`, voor "500 g kaas" en "500g kaas";
- `^(\d+(?:[.,]\d+)?)\s*[x×]?\s+(.+)$`, voor "2 melk", "3x appels" en "3 x appels".

Elke andere invoer, of een getal ≤ 0, wordt in zijn geheel de naam.

**Dubbel.** `addItem` geeft `{kind:'duplicate', existingId}` als er een levend, niet-afgevinkt item met dezelfde `name_norm` op de lijst staat, tenzij `force` gezet is. "Hoeveelheid verhogen" doet `q := (q ?? 1) + (nieuw ?? 1)`.

## 9. Opslag

### 9.1 SQLite-schema (migratie 1)
```sql
PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  -- schema_version, device_id, hlc ("<ms>:<c>"), first_run_done, clock_offset_sec (§6.8, persistent)
CREATE TABLE lists (
  id TEXT PRIMARY KEY,               -- lokaal
  regs TEXT NOT NULL,                -- JSON {sleutel:[waarde,hlc]} incl. onbekende
  name TEXT NOT NULL,                -- afgeleid
  position INTEGER NOT NULL,         -- lokaal (F-20)
  shared INTEGER NOT NULL DEFAULT 0,
  list_tag TEXT UNIQUE,              -- hex32, alleen als gedeeld
  nostr_pubkey TEXT,                 -- eigen huidige identiteit (publiek)
  shard_count INTEGER NOT NULL DEFAULT 1,
  state_rev INTEGER NOT NULL DEFAULT 0,
  joined_pending INTEGER NOT NULL DEFAULT 0,
  future_schema INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE items (
  list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  regs TEXT NOT NULL, del_hlc TEXT, max_hlc TEXT NOT NULL,
  deleted INTEGER NOT NULL, checked INTEGER NOT NULL, category TEXT NOT NULL,
  name TEXT NOT NULL, name_norm TEXT NOT NULL, added_hlc TEXT NOT NULL,   -- afgeleide kolommen
  PRIMARY KEY (list_id, id)
) WITHOUT ROWID;
CREATE INDEX items_view ON items(list_id, deleted, checked, category, added_hlc);
CREATE INDEX items_name ON items(name_norm);
CREATE TABLE pending_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, list_id TEXT NOT NULL, item_id TEXT, rev INTEGER NOT NULL);
CREATE INDEX pending_list ON pending_changes(list_id);
CREATE TABLE shard_state (list_id TEXT NOT NULL, shard INTEGER NOT NULL, published_rev INTEGER NOT NULL DEFAULT 0,
  published_hash TEXT, acked_rev INTEGER NOT NULL DEFAULT 0, last_event_id TEXT, last_event_raw TEXT,
  last_version INTEGER NOT NULL DEFAULT 0,   -- versie (= created_at) van last_event (§6.6)
  last_clock_derived INTEGER NOT NULL DEFAULT 0, -- 1 als last_version == nowAdj bij prepare (B-1)
  floor_version INTEGER NOT NULL DEFAULT 0,  -- ≥ versie van elk eigen event dat ergens kan staan
  floor_before INTEGER NOT NULL DEFAULT 0,   -- vloer vóór last_event (terugrollen, §6.8)
  PRIMARY KEY (list_id, shard));
CREATE TABLE relay_acks (list_id TEXT, shard INTEGER, relay_url TEXT, event_id TEXT, version INTEGER, acked_ms INTEGER, PRIMARY KEY (list_id, shard, relay_url));
CREATE TABLE members (list_id TEXT, pubkey TEXT, last_seen_ms INTEGER, PRIMARY KEY (list_id, pubkey));
CREATE TABLE future_events (list_id TEXT, pubkey TEXT, d_tag TEXT, raw TEXT NOT NULL, received_ms INTEGER, PRIMARY KEY (list_id, pubkey, d_tag));
CREATE TABLE relays (url TEXT PRIMARY KEY, position INTEGER NOT NULL, source TEXT NOT NULL);  -- 'default' | 'user' | 'hint' (E-17)
CREATE TABLE category_prefs (name_norm TEXT PRIMARY KEY, category TEXT NOT NULL, updated_ms INTEGER NOT NULL);
```
`list_relays` en `transport_kv` uit v0.1 vervallen (E-17, E-3). Er is geen schemagebonden tabel met een FK naar `lists` behalve `items`. Opruimen gebeurt expliciet (§7).

**Migraties (NF-13)**: een array van functies in `migrations.ts`, met de huidige versie in `meta.schema_version`. Elke migratie draait in een eigen transactie. De test bouwt een v1-database, vult hem en migreert die naar de huidige versie.

### 9.2 Driver, transacties en leesacties
```ts
interface SqlDriver { exec(sql: string): Promise<void>; run(sql: string, params?: SqlParam[]): Promise<{ changes: number }>;
  all<T>(sql: string, params?: SqlParam[]): Promise<T[]>; close(): Promise<void>; }
```
- **Implementaties**:
  - `ExpoSqliteDriver` (`openDatabaseAsync('bootschap.db')`, `execAsync`, `runAsync`, `getAllAsync`);
  - `test/support/NodeSqliteDriver` (`node:sqlite` `DatabaseSync`, ingebouwd vanaf Node 22.13; geverifieerd: een bestand overleeft heropenen en een niet-gecommitte transactie verdwijnt).
- **Alle SQL loopt via `Repository`, en `Repository` gebruikt één async-mutex** (E-4):
  - `repo.tx(fn)`: `BEGIN IMMEDIATE` … `COMMIT`. Ook de `COMMIT` staat binnen de `try`, dus bij elke fout (ook een mislukte `COMMIT`) volgt een `ROLLBACK` in een eigen try/catch, waarna de fout opnieuw wordt gegooid (v1.0);
  - `repo.read(fn)`: alleen-lezen statements onder dezelfde mutex, zonder eigen `BEGIN`. Er staat dan nooit een schrijftransactie open, dus een read ziet alleen gecommitte data.
- Beide drivers gebruiken één verbinding. Zonder de mutex zou een leesactie tijdens een open `BEGIN IMMEDIATE` niet-gecommitte rijen zien. Dat geldt voor de flush, de suggestie-index en het laden van de UI-cache. Na een `ROLLBACK` zou dat S-02 schenden.
- `withTransactionAsync` van expo-sqlite wordt niet gebruikt.
- **Afdwingen**: `storage/index.ts` exporteert de driver niet. `test/storage/mutex.test.ts` verpakt de driver in een spion die faalt als een aanroep plaatsvindt zonder dat de mutex vastgehouden wordt. Dat test de hele service-suite eenmaal met de spion.

### 9.3 Eerst lokaal committen, dan versturen; optimistische UI in de facade (S-01, S-02, UX-05)
De facade houdt de staat bij in een **geheugencache** (`StateCache`). Die bevat per lijst de `ListState`, het gematerialiseerde `ListView` en de suggestie-index, en wordt bij `init()` geladen via `repo.read`. Alle schrijfacties naar de database lopen door één FIFO-**`WriteQueue`**, die elke taak in `repo.tx` uitvoert (E-6).

**Lokaal commando** (bijvoorbeeld `toggleChecked`):
1. Valideren (`core`).
2. **Synchroon**:
   - de HLC-klok in het geheugen levert de stamp;
   - de facade past de operatie toe op de cache, inclusief de dubbel-detectie van F-17;
   - `onChange` gaat meteen uit. De UI toont de wijziging dus direct (UX-05).
3. De taak gaat in de `WriteQueue` en draagt **alleen haar delta** (I-1): de gewijzigde registers met hun stamps, en/of `del` of de lijstregisters (`n`, `D`). In de transactie:
   - per betrokken item de rij lezen, `merge(rij, delta)` doen (een nieuw item wordt `delta` zelf), en het resultaat met de afgeleide kolommen schrijven. Een taak schrijft **nooit** een complete record uit de cache. Zo overschrijft ze geen eerder gecommitte remote merge, en neemt ze geen effecten van latere, nog niet gecommitte taken mee;
   - `lists.state_rev++`;
   - `pending_changes` (alleen bij een gedeelde lijst);
   - `meta.hlc`.
4. Het commando geeft direct `{ result, committed }` terug. **`committed` lost op na `COMMIT`**: dan is de wijziging *bevestigd* (S-02). Daarna volgt `engine.notifyLocalChange`.

**Bij een commitfout**:
- `ROLLBACK`;
- alle nog niet gecommitte **lokale** taken van dezelfde lijst worden ook afgewezen. Remote merges in de wachtrij gaan door, want die zijn onafhankelijk geldig (D-07);
- de facade wacht tot de wachtrij leeg is, laadt de lijst opnieuw uit de database in de cache, en stuurt `onChange` plus `onError({ code: 'opslaan-mislukt', listId })`;
- de UI toont de melding. De weergave is dan teruggedraaid.

**Ontvangen merge** (§6.7, stap 8; `mergeIntoDb` leest per batch van 400 items met één `SELECT … WHERE id IN (…)` en schrijft alleen gewijzigde rijen): de taak in de `WriteQueue` merget in de transactie. Na de commit merget de facade dezelfde payload in de cache. Merge is commutatief en idempotent, dus **`cache = database ⊔ niet-gecommitte lokale delta's`** blijft precies kloppen, ongeacht de volgorde in de FIFO.

**Test (I-1, `optimistic.test.ts`)**:
- lokale operatie op item X (in de wachtrij), daarna een remote merge op X en op item Y (in de wachtrij), dan alle commits → de database bevat beide wijzigingen op X plus Y;
- variant: de lokale taak faalt → de database bevat alleen de remote merge, en de cache wordt na het herladen gelijk aan de database.

**De store** (`src/ui/store.ts`) is een dunne laag zonder eigen optimistische logica. Hij abonneert op `onChange`, `onSyncStatus` en `onError` en roept de facade aan.

**De engine** leest alleen via `repo.read`, dus het netwerk ziet uitsluitend gecommitte data.

**Kill-semantiek**:
- vóór `COMMIT`: niet bevestigd, mag verloren gaan;
- na `COMMIT`: `pending_changes` blijft staan. Bij opstarten volgt een flush en de eigen-staatcontrole regelt de aflevering (S-02, S-03).

### 9.4 Sleutelopslag
```ts
interface KeyStore { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void>; delete(key: string): Promise<void>; }
```
Implementaties: `ExpoSecureKeyStore` en `test/support/MemoryKeyStore`. Bij "kill en herstart" blijft dezelfde instantie bestaan, net als een echte Keychain.

## 10. Kerninterfaces (zoals opgeleverd)

De bron van waarheid is de code. Hieronder staan de signaturen, ingekort.

```ts
// src/core/types.ts
type Hlc = string;                                            // 32 hex
type Register = [unknown, Hlc];
type Regs = Readonly<Record<string, Register>>;  type MutableRegs = Record<string, Register>;   // alleen voor nieuwe objecten (D-33)
interface ItemState { readonly id: string; readonly regs: Regs; readonly del: Hlc | null }   // ONVERANDERLIJK (D-32/D-33)
interface ListState { readonly regs: Regs; readonly items: ReadonlyMap<string, ItemState> }   type ListDelta = ListState;
interface Clock { nowMs(): number }  interface Timers { setTimeout(fn, ms): unknown; clearTimeout(h): void }
interface Random { bytes(n: number): Uint8Array }             // ALLE ID's, geheimen, nonces, Nostr-sleutels (E-11)
interface Logger { info(code, data?); warn(code, data?); error(code, data?) }   // data zonder inhoud (NF-05)

// src/sync/Transport.ts  (S-19; D-01: isOpen, close, raw, accepted.duplicate)
type RejectReason = 'too-large' | 'clock-ahead' | 'clock-behind' | 'rate-limited' | 'refused' | 'other';
type PublishOutcome = { kind: 'accepted'; duplicate?: boolean } | { kind: 'timeout' } | { kind: 'not-connected' }
  | { kind: 'rejected'; reason: RejectReason };
interface Transport {
  readonly endpoints: readonly string[]; readonly maxPayloadBytes: number;
  connect(): void; pause(): void; kick(): void /* no-op tijdens connecting */; close(): void;
  setSubscriptions(subs: { channel: string; knownSenders: string[] }[]): number;   // generatie; slots altijd 0..15
  identityFromSecret(secret: Uint8Array): Identity | null;
  prepare(p: { channel; slot; identity; version; envelope }): Promise<PreparedMessage /* incl. version */>;
  send(m: PreparedMessage, to: readonly string[]): void;      // geen wachtrij, geen retry
  isOpen(ep: string): boolean;
  on('message' | 'endOfStored' | 'endpoint' | 'outcome', …): () => void;   // InboundMessage bevat generation, version, raw
}

// src/sync/SyncHost.ts  (D-02): wat de engine van de facade gebruikt; geen SQL en geen facade in de engine
interface SyncHost {
  readonly deviceId: string; sharedLists(): SyncListInfo[]; futureSchema(listId): boolean;
  readFlush(listId): Promise<FlushSnapshot | null>; readShards(listId): Promise<{ shardCount; shards } | null>;
  persistFlush(listId, writes: PersistShard[]): Promise<boolean>;            // CAS op floor_version (B-2)
  recordAck(listId, shard, rev, endpoint, eventId, version): Promise<void>;
  rollbackFloor(listId, shard, expectFloor, newFloor?): Promise<boolean>;    // CAS; trekt last_event_* in (§6.8)
  growShards(listId, n): Promise<void>; getClockOffset(): Promise<number>; setClockOffset(sec): Promise<void>;
  pendingCount(listId): Promise<number>; members(listId): Promise<string[]>; addMember(listId, pubkey): Promise<void>;
  mergeRemote(listId, delta): Promise<boolean>; storeFuture(listId, sender, dTag, raw): Promise<void>;
  rotateIdentity(listId): Promise<Identity>; completeJoin(listId): Promise<void>; afterAck(listId): Promise<void>;
}

// src/sync/engine/SyncEngine.ts
interface SyncEngine {
  start(); pause() /* begrensd, generatie (D-22, D-31) */; resume(); networkRestored(); syncNow(listId?);
  notifyLocalChange(listId); notifyRemoteChange(listId); listsChanged(); flushNow(listId);
  status(listId): SyncStatus; onStatus(cb); shutdown(); readonly debug: EngineDebug;
}
interface SyncStatus { kind: 'lokaal' | 'gesynchroniseerd' | 'bezig' | 'offline' | 'beperkt' | 'fout';
  pending: number; relaysOpen: number; relaysTotal: number; fetching: boolean;
  reason?: 'nieuwere-versie' | 'te-groot' | 'geweigerd' | 'geen-antwoord' }

// src/service/BootschapApp.ts  (enige API voor de UI; optimistisch, §9.3; D-06)
interface Pending<T> { result: T; committed: Promise<void> }
interface BootschapApp {
  init(); lists(): ListSummary[]; view(listId): ListView; suggest(prefix): Suggestion[];
  createList(name): Pending<{ listId }>; renameList(id, name): Pending<void>;
  addItem(listId, input: AddInput, opts?: { force? }): Pending<AddResult>; increaseQuantity(listId, itemId, by?): Pending<void>;
  updateItem(listId, itemId, patch: ItemPatch): Pending<void>; toggleChecked(listId, itemId): Pending<void>;
  deleteItem(listId, itemId): Pending<UndoToken>; clearChecked(listId): Pending<UndoToken>; undo(t): Pending<void>;
  deleteList(id): Promise<void>; share(listId): Promise<ShareInfo>; shareInfo(listId): Promise<ShareInfo>;
  join(text): Promise<JoinResult>; leave(listId, keepCopy): Promise<void>;
  setRelays(urls): Promise<void> /* alleen wss://; rebuild */; relays(): Promise<string[]>;
  syncStatus(listId): SyncStatus; syncNow(listId?): Promise<void>;
  onChange(cb); onSyncStatus(cb); onError(cb: (e: AppError) => void);
  foreground(); background(): Promise<void>; networkRestored(); shutdown(): Promise<void>;
  whenSyncStarted(): Promise<void>; flushWrites(): Promise<void>;          // voor tests
}
// src/service/types.ts (E-18, goedgekeurd)
interface ListSummary { id; name; shared; total; checkedCount; position }
interface AddInput { text: string; quantity?: number | null; unit?: string | null; note?: string | null; category?: CategoryId }
type AddResult = { kind: 'added'; itemId } | { kind: 'duplicate'; existingItemId };
interface ItemPatch { name?; quantity?; unit?; note?; category?: CategoryId; checked? }
interface UndoToken { readonly id; readonly listId; readonly itemIds: readonly string[]; readonly expiresAtMs }
interface ShareInfo { link; code; text; ready: boolean }
type JoinResult = { kind: 'joined' | 'already-present'; listId } | { kind: 'error'; code: 'geen-code' | 'beschadigd' | 'controlesom' | 'nieuwere-versie' };
type AppErrorCode = 'opslaan-mislukt' | 'lijst-verwijderd-door-ander';  interface AppError { code: AppErrorCode; listId? }
// Fouten bij synchrone commando's: InputError (validatie) en CommandError ('undo-verlopen', 'item-onbekend', 'relay-ongeldig', 'niet-gedeeld', …)
```

**Fabrieken**:
- `createBootschapApp(deps: AppDeps)`, met `transport?` optioneel (zonder transport geen sync);
- `createApp(over?, strings?)` voor productie: expo-sqlite, SecureStore, expo-crypto en NostrTransport op de RN-`WebSocket` (D-19);
- `createNostrTransport({ relays, wsFactory, clock, timers, log, publishTimeoutMs, connectTimeoutMs, backoffMaxMs })` (D-14);
- `createMemoryTransport(hub, …)`.

**Config** (`src/config.ts`, standaardwaarden):

| Instelling | Waarde |
|---|---|
| `localWindowMs` | 1000 |
| `remoteWindowMs` | 3000 |
| `minFlushGapMs` | 1000 |
| `publishTimeoutMs` | 8000 |
| `retryDelaysMs` | 2/4/8/16/32 s |
| `refusedRetryDelaysMs` / `refusedRetryMax` | 30 s / 1 / 2 / 5 min, max 12 (D-35) |
| `connectTimeoutMs` | 10 s |
| `backoffMaxMs` | 60 s |
| `inFlightTtlMs` | 15 min |
| `clockWaitMaxMs` | 8 s |
| `failingAfterMs` | 30 s |
| `timeoutsCountAsFailure` | `true` |
| `joinTimeoutMs` | 10 s |
| `statusThrottleMs` | 250 |
| `targetEventBytes` | 49 152 |
| `maxEventChars` | 100 000 |
| `undoWindowMs` | 10 s |
| `syncNowTimeoutMs` | 5 s |
| `backgroundAckWaitMs` | 2 s |
| `pauseBudgetMs` | 3 s |
| `allowInsecureRelays` | `false` |
| `defaultRelays` | A-01 |

## 11. Levenscyclus

**App-start:**
1. `polyfills`.
2. `createBootschapApp` met de Expo-drivers.
3. `init()`:
   - migraties;
   - bij de eerste start `device_id`, de standaardrelays en de lijst "Boodschappen" (F-01, UX-11);
   - lijsten met `D` afronden (§7);
   - lijsten en items via `repo.read` in de `StateCache` laden, gevolgd door de eerste render (NF-10, zonder te wachten op netwerk of sleutels).
4. Daarna, op de achtergrond:
   - `selftest` (§4.2);
   - sleutels laden voor gedeelde lijsten; ontbreken die, dan wordt de lijst als verlaten afgerond (§7);
   - `engine.start()`: `connect` (de status is `bezig` tijdens de eerste poging, E-20), een flush voor gedeelde lijsten zonder `joined_pending`, en de eigen-staatcontrole na elke EOSE.

Zonder gedeelde lijsten wordt er niet verbonden (F-13: "gebruikt geen netwerk").

**`AppState`** (`src/ui/platform/appState.ts`):
- `active` → `app.foreground()`: `transport.kick()` (verbinden, REQ opnieuw), flush (S-13).
- `background` → `app.background()`: wacht op de schrijfwachtrij en voert dan `engine.pause()` uit.
  - **Budget (D-22):** het geheel duurt maximaal `pauseBudgetMs` (3 s). In de `urgent`-toestand is er geen I-3-wachttijd en worden wachters gewekt. Er volgen een flush en daarna maximaal 2 s wachten op acks binnen het resterende budget.
  - **Afsluiten:** daarna `transport.pause()` (sockets dicht, en alle retrytimers van de engine stoppen; NF-11). Wachtende retries vervallen.
  - **Pause-generatie (D-31):** komt er tijdens een lopende `pause()` een `resume()`, dan sluit `pause()` niet alsnog. De voorgrond wint altijd.
- `foreground` → `engine.resume()`: zet de eigen-staatcontrole terug, doet `kick()` (nieuwe REQ per open relay, dus EOSE en controle) en een flush. Zo wordt ook een relay die data verloor zonder dat de verbinding brak, opnieuw gevuld (D-ET-01). `syncNow()` doet hetzelfde voor één lijst.
- `inactive` → negeren (bijvoorbeeld het bedieningspaneel).

In de achtergrond is er geen sync en zijn er geen foutmeldingen (S-13).

**Netwerk** (`@react-native-community/netinfo`, `src/ui/platform/netInfo.ts`): een overgang van `isConnected false → true` leidt tot `app.networkRestored()` en dus `kick()` en flush (S-03 ≤ 10 s). De netwerkstatus is alleen een hint. "offline" in de status komt uitsluitend uit de relayverbindingen.

**Start van de UI** (`src/ui/AppContext.tsx`):
- `createApp()` → `init()` → de store, gevolgd door het binden van AppState en NetInfo, en daarna de selftest;
- bij een startfout toont het scherm "Opnieuw proberen" (het effect wordt opnieuw uitgevoerd);
- bij een unmount (ook Fast Refresh in Expo Go) volgt `app.shutdown()`, ook als `init()` nog liep.

**Reconnect**: per relay met backoff (§6.10). Er is geen polling (NF-11). Live-updates komen via het open abonnement.

**Pull-to-refresh** (UX-13): `syncNow` = de eigen-staatcontrole terugzetten, `kick()` en een flush. De status is `bezig` tot een EOSE of een time-out van 5 s.

## 12. UI-laag
- **Store**: `src/ui/store.ts` is een zustand-store (`zustand/vanilla`, testbaar in Node). Het is een dunne laag op de facade: abonnementen op `onChange`, `onSyncStatus` en `onError`, plus acties die de facade aanroepen. Er zit geen eigen optimistische logica in, want die zit in de facade (§9.3). Commitfouten verschijnen als melding (UX-05).
- **Selectors**: in `selectors.ts`, waaronder "x van y afgevinkt" (UX-10).
- **Strings**: alle teksten staan in `src/ui/strings.nl.ts` (UX-01). Geen "relay", "HLC" of "Nostr" buiten het instellingenscherm (UX-06).
- **Lijstscherm**:
  - `SectionList` per categorie (500–1000 items, NF-10). De secties staan in `useMemo`, `renderItem`, `onToggle` en `onEdit` in `useCallback`, en `memo(ItemRow)` met stabiele `ItemView`-referenties (D-32). Afvinken op een lijst van 1000 items tekent precies één rij opnieuw (test `review-m4.test.tsx`);
  - invoerveld dat gefocust blijft (UX-03), met suggesties;
  - tikdoel ≥ 44 pt (UX-04);
  - snackbar "Ongedaan maken" van 10 s (F-07);
  - de statusbalk is altijd zichtbaar (UX-02), met "Ophalen…" bij `fetching` (F-14);
  - `RefreshControl` (UX-13).
- **Deelscherm**: QR (`react-native-qrcode-svg`), knoppen "Delen…" (`Share.share`) en "Kopieer code" (`expo-clipboard`), met de waarschuwing van NF-05/B-02: "Deel deze code alleen met mensen die je vertrouwt. Wie de code heeft, kan altijd meedoen." Daarnaast de status "Klaar om te koppelen" (F-14).
  - De hook `useShareInfo` voert één keer `share()` uit. Daarna vraagt hij `shareInfo()` alleen opnieuw op als de statussleutel verandert, en stopt hij zodra de lijst klaar is (geen pollinglus).
  - De code staat in een monospace-lettertype per platform (`theme.monoFont`: iOS `Courier`, Android `monospace`).
- **Koppelen**: `CameraView` met `barcodeScannerSettings={{ barcodeTypes: ['qr'] }}`. De camerapermissie wordt pas hier gevraagd (UX-11). Bij weigering volgt een verwijzing naar "Plak code" (UX-06, F-15). `scanGate` laat één scan tegelijk toe, met 2 s pauze na een mislukte koppeling. Na het koppelen wordt het klembord gewist als het de code bevat (§7).
- **Donkere modus**: `useColorScheme` (UX-08). `accessibilityLabel` op alle knoppen en items (UX-09).
- **Iconen**: eigen lijn-iconen op `react-native-svg` (`components/Icon.tsx`, D-26), zonder icon-font.
- **Dialogen**: via `nativeAlert`. Op Android is een dialoog niet weg te tikken, zodat `confirmDestructive` altijd een uitkomst geeft (D-28).
- **Niet gebouwd (Could, D-29)**: UX-12, UX-14, F-20 en F-21.
- **Swipe-rijen (UX-15/UX-16, D-37)**: `src/ui/components/SwipeRow.tsx` met `ReanimatedSwipeable` en `GestureHandlerRootView` bovenaan in `app/_layout.tsx`.
  - Swipe naar links toont de rode actie "Verwijderen".
  - **Item:** een tik op de actie of een volledige swipe roept `ui.actions.deleteItem` aan: direct, met de snackbar "Ongedaan maken" en zonder dialoog.
  - **Lijst:** een tik, een volledige swipe en de accessibility action gaan altijd via `ui.actions.deleteList`, dus via `confirmDestructive` (UX-07). Annuleren klapt de rij dicht.
  - Per scherm staat maximaal één rij open (`SwipeGroup` met een stabiele context, K-2 blijft intact). Scrollen (`onScrollBeginDrag`) en een tik op een rij sluiten de open rij.
  - **Toegankelijkheid:** de accessibility action "Verwijderen" zit op het focusbare element (de checkbox van een item, de kaart van een lijst). De rode actie is verborgen voor de schermlezer zolang de rij dicht is.
  - **Volledige swipe:** de drempel wordt gemeten op de sleepafstand van de vinger, en niet op de door wrijving verminderde translatie die bij het loslaten al terugveert (review CR-01/02, S-1).
  - **Testomgeving:** de officiële mocks van gesture-handler, reanimated en worklets (`test/setup-ui.ts`).

### 12.1 Bevestiging bij destructieve acties (UX-07, Must; review L-1)
Alle destructieve acties lopen via `src/ui/confirm.ts`: `confirmDestructive(kind, ctx): Promise<Keuze>`. Dat is een injecteerbare wrapper om `Alert.alert`, met teksten uit `strings.nl.ts`. Een store-actie roept de facade **pas na** de keuze aan.

| Actie | Vorm | Tekst (strings.nl.ts) | Knoppen |
|---|---|---|---|
| Lijst verwijderen, niet gedeeld | dialoog | "‘{naam}’ en alle items worden verwijderd. Dit kan niet ongedaan worden gemaakt." | Annuleren · **Verwijderen** (destructief) |
| Lijst verwijderen, gedeeld (sectie 3) | dialoog | "‘{naam}’ wordt ook verwijderd op alle telefoons waarmee je deze lijst deelt. Wil je hem alleen van deze telefoon halen? Kies dan ‘Lijst verlaten’." | Annuleren · Lijst verlaten · **Overal verwijderen** (destructief) |
| Afgevinkte items wissen (F-06) | direct uitvoeren + snackbar 10 s "{n} items gewist · Ongedaan maken" (F-07) | — | Ongedaan maken. **Wordt F-07 (Should) niet gebouwd, dan een dialoog**: "{n} afgevinkte items wissen?" · Annuleren · **Wissen** |
| Stoppen met delen / lijst verlaten (F-18) | dialoog | "Deze telefoon synchroniseert ‘{naam}’ niet meer. De anderen houden de lijst. Wie de code heeft, kan altijd weer meedoen." | Annuleren · Verlaten, kopie houden · **Verlaten en verwijderen** (destructief) |
| Item verwijderen | direct + snackbar "Ongedaan maken" (geen eis, maar consistent) | — | Ongedaan maken |

**Test**:
- [auto] `src/ui/confirm.test.ts` (ui-project):
  - per rij: bij annuleren wordt de facade niet aangeroepen, bij bevestigen wel;
  - een gedeelde lijst toont "alle telefoons";
  - "Lijst verlaten" roept `leave` aan en niet `deleteList`.
- [handmatig] UX-07 in het testplan van de Eindtester: per actie de dialoog of snackbar op het toestel.

## 13. Teststrategie

### 13.1 Jest- en TypeScript-configuratie (geverifieerd door Architect en Engineer: Jest 29.7, babel-preset-expo 57, nostr-tools 2.25.2, noble 2.4, `node:sqlite`, ws-relay en een RTL-render in jest-expo, in Node 25)
```js
// jest.config.js
const esm = ['@noble', '@scure', 'nostr-tools', 'nostr-wasm', 'fflate'].join('|');
module.exports = {
  projects: [
    { displayName: 'node', testEnvironment: 'node',
      roots: ['<rootDir>/src/core', '<rootDir>/src/storage', '<rootDir>/src/sync', '<rootDir>/src/service', '<rootDir>/test'],
      testMatch: ['**/*.test.ts'], transform: { '^.+\\.[jt]sx?$': 'babel-jest' },
      transformIgnorePatterns: [`/node_modules/(?!(${esm})/)`], setupFiles: ['<rootDir>/test/setup-node.ts'] },
    { displayName: 'ui', preset: 'jest-expo', roots: ['<rootDir>/src/ui', '<rootDir>/app'],
      testMatch: ['**/*.test.ts?(x)'], transformIgnorePatterns: [`/node_modules/(?!(${esm}|(jest-)?react-native|@react-native|expo(nent)?|@expo|expo-.*|react-navigation|@react-navigation|react-native-svg|react-native-qrcode-svg)/)`] },
  ],
};
// babel.config.js: module.exports = (api) => { api.cache(true); return { presets: ['babel-preset-expo'] }; };
```
- **TypeScript**: `tsconfig.json` (app) en `tsconfig.test.json` met `types: ["jest", "node"]`, zie §4.2.
- **Scripts**:
  - `"test": "jest"`;
  - `"test:seeds": "SEEDS=1000 jest test/integration/convergence"`;
  - `"typecheck": "tsc -p tsconfig.json && tsc -p tsconfig.test.json"`;
  - `"check:deps": "expo install --check && npm ls --all"`;
  - `"check:licenses": "node scripts/check-licenses.mjs"`.
- `test/setup-node.ts` vervangt `fetch` en `XMLHttpRequest` door functies die een fout gooien (NF-06), en negeert `SimulatedCrash` bij `unhandledRejection`.
- **v1.0, zoals opgeleverd:**
  - `npm test` = `NODE_OPTIONS=--disable-warning=ExperimentalWarning jest` (D-09);
  - `npm run test:handles` = `jest --detectOpenHandles --runInBand`. Dit moet schoon zijn: geen open handles en geen "did not exit". Alle timers in engine, transport en test-relay worden bijgehouden en gewist;
  - het ui-project draait ook `test/acceptance/ui`;
  - `test/acceptance/` is van de Eindtester; `live-relays.test.ts` staat standaard uit;
  - de F-08-fixture van de Eindtester (`categorize-f08-eindtester.json`) is normatief.

### 13.2 Test-relays en de test-transport
- **`test/relay/RelayCore.ts`**: pure NIP-01-logica.
  - Opslag en filters (`ids`, `authors`, `kinds`, `#d`, `since`, `until`, `limit`).
  - **Vervangbare semantiek** voor 30000–39999 op `(pubkey, kind, d)`: een hogere `created_at` wint, en bij gelijkspel het laagste ID.
  - Handtekeningcontrole, `OK`, `EOSE`, `CLOSED` en live doorsturen.
  - Een kind-5-verwijdering alleen voor dezelfde pubkey.
- **`test/relay/WsTestRelay.ts`**: een `ws`-server op poort 0 rond `RelayCore`. **Foutinjectie** (NF-12):
  - `down`, `dropConnections()`, `flap(ms)`;
  - `latencyMs`, `duplicate(n)`, `reorder`;
  - `wipe()`;
  - `maxEventBytes` (`invalid: event too large: N`);
  - `relayClock` + `futureToleranceSec` (`invalid: created_at too late`) en `pastToleranceSec` (`invalid: created_at too early`);
  - `silentDrop` (geen OK, geen opslag);
  - `refuse(prefix)` en `rateLimit`;
  - `dumpEvents()`.
- Een echte relay als npm-package is bewust niet gekozen: geen foutinjectie en geen pure-JS-garantie.
- **`MemoryHub`** + **`MemoryTransport`** (`src/sync/transports/memory`): een niet-Nostr brievenbus.
  - **Slot-semantiek**: per `(channel, slot, sender)` wint de hoogste `version`, bij gelijkspel het laagste ID (E-3d). Zo vervangt een replay nooit nieuw door oud, ook niet na een herstart, omdat de versies persistent bij de engine liggen.
  - **Geen Schnorr** (E-21): `id = hex(sha256(raw))`, `verify()` is waar, behalve met de foutknop `corruptSignature`.
  - Live fan-out en dezelfde foutknoppen als de WS-relay, inclusief een virtuele relay-klok met toleranties. Alles draait op virtuele tijd.
- **Contracttests** (`test/contract/transport.contract.ts`) draaien tegen `NostrTransport + WsTestRelay` en tegen `MemoryTransport`. Ze dekken:
  - publiceren → ontvangen;
  - de hoogste versie per slot wint, ook bij replay en na een herstart;
  - EOSE per generatie;
  - alle uitkomsten, inclusief `not-connected` bij een gesloten endpoint;
  - opnieuw verbinden;
  - `maxPayloadBytes` (S-19).

### 13.3 Gesimuleerde apparaten en kill-semantiek
`test/sim/device.ts` → `createTestDevice({ name, relays | hub, clockOffsetMs, seed, dbFile? })` levert `{ app, clock: FakeClock, net: { online(b) }, kill(), restart() }`.
- **Eigen opslag**: een `node:sqlite`-bestand in een tijdelijke map, of `:memory:` voor de seed-tests.
- Eigen `MemoryKeyStore`, `FakeClock` (offset en vooruitzetten, bijvoorbeeld 7 dagen voor S-08c) en `SeededRandom`.
- **`online(false)`**: de `WebSocketFactory` of de hub-aansluiting weigert en sluit alles.
- **Kill switch** (`test/support/KillSwitch.ts`, E-7). Elke dependency van een apparaat wordt verpakt: driver, keystore, timers, `wsFactory`/sockets, hub-aansluiting en logger. **`kill()`**:
  1. zet de switch om. Daarna **bevriest** een zombie (K-1; ook `setTimeout` geeft `null`, D-23): een verpakte **async** aanroep geeft een promise terug die nooit afloopt, en alleen een **synchrone** aanroep gooit `SimulatedCrash`. `test/setup-node.ts` negeert `SimulatedCrash` in `unhandledRejection`, zodat er geen ruis of flakkerende tests ontstaan;
  2. wist alle timers van die instantie en blokkeert nieuwe;
  3. laat berichten van en naar de oude instantie vallen, en sluit sockets en hub zonder afmelding;
  4. sluit de onderliggende database-verbinding hard, waardoor een open transactie verloren gaat.

  De `MemoryKeyStore` blijft bestaan, zoals een Keychain. **Ook de `SeededRandom`-instantie blijft bestaan** (I-2): ze wordt niet door de KillSwitch verpakt en niet opnieuw geseed, dus de stroom loopt door over herstarts. Zo herhalen item-ID's, nonces en geheimen zich nooit.
- **`restart()`**: wacht op een drain (`await new Promise(r => setImmediate(r))` ×2, plus alle virtuele timers), en maakt dan pas een nieuwe `BootschapApp` op hetzelfde bestand en dezelfde keystore.
- `test/sim/device.test.ts` bewijst:
  - na `kill()` vindt geen enkele I/O meer plaats (spionnen op driver, socket en hub);
  - er ontstaat geen BUSY-lock bij `restart()`;
  - **over 5 herstarts komen geen dubbele item-ID's of nonces voor** (I-2).
- **Crashpunten**:
  - `CrashingSqlDriver` gooit `SimulatedCrash` na N statements;
  - de engine heeft test-hooks (`faults.at('after-commit' | 'after-prepare' | 'after-persist' | 'after-send')`), die `kill()` aanroepen, en `faults.at('in-prepare')`, die `prepare` laat wachten tot de test hem vrijgeeft (B-2).
- **Timing**:
  - WS-tests: echte timers met productiewaarden voor S-12/S-21; andere tests mogen `config.localWindowMs = 50` gebruiken.
  - Hub-tests: `VirtualScheduler` (Clock + Timers). **`runUntilQuiet()` maakt de microtasks leeg tussen twee timerstappen** (`await` op een drain-lus), omdat de driver met promises werkt (E-21).
  - Let op: `node:sqlite` is synchroon achter een promise. Races die alleen met de asynchrone expo-sqlite optreden, vangen deze tests niet. De mutex (§9.2) en `mutex.test.ts` dekken dat af.

### 13.4 Willekeurige scenario's (S-04, S-11, S-18)
- `fast-check` met `fc.assert(prop, { numRuns: Number(process.env.SEEDS ?? 200), seed: Number(process.env.SEED ?? 20261006) })`.
- **Een scenario**: 2, 3 of 5 apparaten. Er zijn 1 tot 60 acties: `add`, `edit(veld)`, `toggle`, `delete`, `clearChecked`, `undo`, `rename`, `offline`, `online`, `kill+restart`, `advanceClock` en `relayFault(delay | dup | reorder | wipe)`.
- **Afsluiting**: alles online, foutloos en `runUntilQuiet()`.
- **Assertie**: de `canonical(state)` is gelijk op alle apparaten, en elke operatie waarvan `committed` is opgelost, is te zien (een oracle volgens R-DEL en LWW, berekend uit het globale operatielog).
- **Looptijdbudget**: de seed-suite (Hub, `:memory:`, zonder Schnorr) duurt ≤ 2 min. De volledige `npx jest` duurt ≤ 5 min.

### 13.5 Overige testsoorten
- **Statische tests**:
  - `imports.test.ts`: de laagregels uit §2, inclusief het verbod op globale tijd, timers en willekeur;
  - `deps.test.ts`: versies tegen `bundledNativeModules.json`, de allowlist van native modules, en een denylist van analytics-, crash- en ad-SDK's (NF-06, NF-08);
  - `licenses.test.ts`: draait `scripts/check-licenses.mjs`. Dat begrijpt **SPDX-expressies** (E-19): bij `OR` is één toegestane licentie genoeg, bij `AND` moeten ze allemaal toegestaan zijn, en haakjes worden gerespecteerd. De allowlist is MIT, ISC, Apache-2.0, BSD-2-Clause, BSD-3-Clause, 0BSD, CC0-1.0, Unlicense, BlueOak-1.0.0, CC-BY-4.0, Python-2.0 en **MPL-2.0** (open source, NF-07). Pakketten zonder licentieveld laten de test falen;
  - `strings.test.ts` (UX-01).
- **Commando's (DoD)**: `npm run check:deps`, `npm run typecheck`, `npx jest`, `npx expo export --platform ios`, `npx expo export --platform android` en `npx expo-doctor`.

### 13.6 Traceerbaarheidsmatrix (eis → component → test)
Testnamen beginnen met de eis-ID (bijvoorbeeld `it('S-07b: …')`). "WS" = `NostrTransport + WsTestRelay`, "Hub" = `MemoryTransport`.

| Eis | Component(en) | Test (bestand: kern) |
|---|---|---|
| F-01 | service, storage | `test/integration/lists.test.ts`: 20 lijsten, validatie van de naam (1–40, trim), herstart, standaardlijst, hernoemen en verwijderen syncen (WS, 2 apparaten) |
| F-02 | core/validate, service | `items.test.ts`: validatie, herstart, 1000 items |
| F-03 | core/crdt, sort | `items.test.ts`: toggle, sectie Afgevinkt, sync |
| F-04 | core/ops, service | `items.test.ts`: elk veld, validatie, sync |
| F-05 | core/crdt | `items.test.ts` + `S-07` |
| F-06 | service | `items.test.ts`: alleen afgevinkte items, 200 items, undo-token |
| F-07 | core/ops (`r`), service/undo | `undo.test.ts`: herstel binnen 10 s, wint op 2 apparaten (S-07f) |
| F-08 | core/categorize | `categorize.test.ts`: fixture van 100 producten ≥ 90%, woordenboek ≥ 400, 16 categorieën, onbekend → overig, nooit een fout (fuzz) |
| F-09 | core/categorize, storage (`category_prefs`) | `categorize.test.ts` + `items.test.ts` |
| F-10 | core/sort | `sort.test.ts`: volgorde van §8.1, lege categorieën verborgen, tie op id |
| F-11 | core/suggest | `suggest.test.ts`: prefix/woordbegin, max 8, rang, verwijderd blijft suggestie, < 100 ms bij 5000 |
| F-12 | core/parseInput | `parseInput.test.ts`: 3 patronen + onzeker |
| F-13 | core/codec/sharecode, service | `sharecode.test.ts`: roundtrip, inhoud, sleutel niet in log/relay; `share.test.ts`: niet gedeeld → 0 verbindingen |
| F-14 | service, sync | `join.test.ts` (WS): A deelt en gaat offline, B koppelt en ziet alles; beschadigde code → foutcode, geen lijst; dubbel koppelen → bestaande lijst; **een lege snelle relay en een gevulde relay met 500 ms vertraging → "Ophalen…" en daarna de volledige lijst, nooit een lege of halve lijst** (L-2); (b) alle relays EOSE zonder data → lege lijst + hint; (c) 10 s; geen publicatie zolang `joined_pending` |
| F-15 | core/codec/sharecode | `sharecode.test.ts`: tekstcode, hele deeltekst, controlesom, Crockford-normalisatie |
| F-16 | sync | zie S-18 |
| F-17 | core/duplicate, service | `items.test.ts`: melding, `force`, verhogen |
| F-18 | service, sync | `leave.test.ts`: sleutels weg, geen events meer, anderen werken door, lokale kopie |
| F-19..F-21 (C) | service | `relays.test.ts`, `reorder.test.ts`, `export.test.ts` (alleen als ze gebouwd worden) |
| S-01 | service, storage | `offline.test.ts`: transport uit, F-01..F-11 werken, < 100 ms per actie (gemeten) |
| S-02 | storage, service, sync | `crash.test.ts`: seeds × crashpunten (midden in tx, na commit, na prepare, na persist, na send), met KillSwitch → alles waarvan `committed` is opgelost, is er na de herstart en komt aan bij B; `mutex.test.ts`: geen lees- of schrijfactie buiten de mutex |
| S-03 | sync | `reconnect.test.ts` (WS): offline wijzigen, herstart, online → op relay ≤ 10 s, zonder actie |
| S-04 | core, sync | `convergence.test.ts` (Hub, ≥ 200 seeds, 2 en 3 apparaten) + 1 WS-variant |
| S-05 | core/crdt | `merge.property.test.ts`: commutatief, associatief, idempotent (fast-check) |
| S-06 | core/crdt | `merge.test.ts`: zelfde veld/verschillende velden, gelijkspel → node, beide volgordes |
| S-07 | core/crdt, sync | `rdel.test.ts`: (a)–(f) × beide volgordes, core + WS |
| S-08 | sync | `mailbox.test.ts` (WS): (a) 50 wijzigingen, (b) A weg vóór B, (c) FakeClock +7 dagen |
| S-09 | sync/transports/nostr | `relay-faults.test.ts` (WS, 3 relays): 1–2 down/traag/weigerend, alle down, backoff ≤ 60 s, kick, relay komt terug en krijgt de staat, flapperen |
| S-10 | sync/Publisher (versies), SelfCheck | `relay-dataloss.test.ts`: (a) wipe, (b) twee publicaties in dezelfde seconde (relay met gelijkspel-regel; ook na een kill tussen de twee), (c) oud eigen event, (d) `silentDrop` + maximaal 5 retries, dan herstel via EOSE; **B-2**: gelijktijdige flushes (`too-large` tijdens een venster-flush + `in-prepare`-hook) → strikt stijgende versies, de relay houdt het nieuwste event; CAS-afwijking → de flush herstart |
| S-11 | core, sync | `replay.test.ts`: 1×/2×/10×, omgekeerd/willekeurig, replay van oude staat, eigen echo |
| S-12 | sync | `latency.test.ts` (WS, productievensters): 50 wijzigingen, p95 ≤ 2 s, max ≤ 5 s |
| S-13 | service, sync | `triggers.test.ts`: start, voorgrond, netwerkherstel, live, pull; achtergrond: sockets dicht, geen fouten |
| S-14 | sync/Receiver | `garbage.test.ts`: ruis, slechte JSON, verkeerde sleutel, gewijzigde ciphertext, slechte handtekening, onbekend kind, > 100 KB, onbekende d-tag → staat ongewijzigd, geen crash, gedempt log |
| S-15 | core/codec/shard, sync | `size.test.ts`: 1000 items + 30% tombstones → elk event ≤ 48 KiB; relay met `maxEventBytes = 16384` → S groeit, convergentie |
| S-16 | core/hlc, sync/Publisher (klokcorrectie) | `clock.test.ts`: ±1 u (causaliteit); remote +25 u (klok loopt niet mee, geen crash); apparaat **+1 u**, relay-tolerantie 900 s → aanwezig ≤ 30 s; apparaat **−1 u**, relay met `pastToleranceSec = 1800` → aanwezig ≤ 30 s (L-3); twee relays (300 s en 900 s), apparaat +10 min, 3 herstarts → geen nieuwe identiteit, `clock_offset_sec` persistent, convergentie (E-3); voorsprong > 1 u na acceptatie → precies één rotatie; **B-1**: A accepteert, B weigert, herstart, EOSE → geen terugrol; beide weigeren → terugrol zonder rotatie; **I-3**: +1 u, 5 bewerkingen in 2 s, 200 ms latentie → geen rotatie, ≤ 30 s |
| S-17 | sync/status | `status.test.ts`: elke overgang (pure functie + engine), `pendingCount` correct, eerste verbindingspoging = `bezig` (E-20), `joinedPending` = `bezig`/"Ophalen…"; **besluit PL**: alleen time-outs + `pendingCount > 0` + ≥ 1 open relay → `fout` na 30 s, een ack → `gesynchroniseerd`; 0 open → `offline`; geen pending → geen `fout` |
| S-18 | sync | `convergence.test.ts` met 5 apparaten (S-04 en S-08) |
| S-19 | sync | `contract/transport.contract.ts` × 2 (inclusief de hoogste versie per slot bij replay en herstart, `not-connected`, EOSE per generatie) + `imports.test.ts` |
| S-20 | core/codec, sync | `schema.test.ts`: v=2 → bewaard, geen merge, status `fout` + tekst; onbekende registers blijven bewaard en worden doorgegeven |
| S-21 | sync/Publisher | `debounce.test.ts`: 5 wijzigingen < 1 s → 1 event per relay per gewijzigd deel; aanhoudend ≤ 1/s |
| S-22 (C) | — | niet in v1 |
| NF-01 | core/crypto, sync | `e2e-scan.test.ts`: unieke testteksten (≥ 7 tekens) en categorie-ID's komen niet voor in `dumpEvents()` of de logs; nonce uniek over 10.000 berichten; nonces uniek over herstarts heen (I-2) |
| NF-02 | sync, core/crypto | `attacker.test.ts`: (a) ontsleutelen zonder sleutel faalt, (b) bitflip → genegeerd, (c) eigen sleutel + onze d-tag / gekopieerde content → genegeerd, (d) replay → geen effect, (e) kind-5 van een vreemde → geen effect + S-10 |
| NF-03 | service | `privacy.test.ts`: tags = alleen d, d is niet afgeleid van de naam, 2 lijsten → 2 pubkeys |
| NF-04 | storage | `keys.test.ts`: sleutels alleen in KeyStore; dump van alle SQLite-tabellen en de logs bevat geen geheim of privésleutel |
| NF-05 | service, core | `privacy.test.ts`: code en payload niet in logs tijdens delen en koppelen |
| NF-06 | test/setup, arch | `network.test.ts`: elke WebSocket-URL ∈ relayset; fetch/XHR gooien een fout; `deps.test.ts` |
| NF-07 | scripts | `licenses.test.ts` (SPDX OR/AND, MPL-2.0) |
| NF-08 | — | `expo export` ios/android + `deps.test.ts` (versies tegen `bundledNativeModules`, allowlist Expo Go) + `npm run check:deps` |
| NF-09 | — | `tsc --noEmit`, jest groen |
| NF-10 | core, service | `perf.test.ts`: toevoegen < 100 ms, `view()` van 500 items < 50 ms (Node) |
| NF-11 | sync | `battery.test.ts`: geen timers < 30 s in rust, sockets dicht bij achtergrond, geen herpublicatie zonder wijziging |
| NF-12 | test-infra | `relay.test.ts`: elke foutknop werkt; `device.test.ts`: kill → geen I/O meer, herstart zonder BUSY; `imports.test.ts`: geen globale tijd, timers of willekeur; **I-2**: geen dubbele ID's of nonces over 5 herstarts; **K-1**: zombies bevriezen zonder unhandled rejections |
| NF-13 | storage | `migrations.test.ts` |
| UX-01 | ui | `strings.test.ts` |
| UX-02 | ui/statusText | `statusText.test.ts`: elke status → tekst + icoon |
| UX-05 | service (StateCache/WriteQueue), ui/store | `optimistic.test.ts` (node): `view()` direct na een commando bijgewerkt, vóór `committed`; een commitfout (CrashingSqlDriver) → cache herladen, `onError`, latere taken van dezelfde lijst afgewezen; `store.test.ts`: de melding wordt getoond; **I-1**: lokale delta + remote merge in de wachtrij → de database bevat beide; een mislukte lokale taak laat de remote merge intact |
| UX-10 | ui/selectors | `selectors.test.ts`: telling, ook na een merge van de partner |
| UX-07 | ui/confirm | `confirm.test.ts`: per destructieve actie (§12.1) roept annuleren de facade niet aan en bevestigen wel; een gedeelde lijst toont "alle telefoons"; "Lijst verlaten" → `leave`. Plus een [handmatig] scenario in het testplan (L-1) |
| UX-13 | service, sync | `triggers.test.ts`: pull → REQ + flush, status bezig → gesynchroniseerd |

## 14. Mijlpalen en criteria om klaar te zijn

**Stand v1.0 (2026-10-06):** M1 t/m M5 zijn gebouwd en door de Architect gereviewd (zie APPROVALS). De rooktest met Nick (H-01..H-07) en het eindakkoord van de Projectleider volgen nog.
Bij **elke** mijlpaal hoort een snelle A-04-check: `npm view expo dist-tags` en de SDK van Expo Go in de stores. Wordt SDK 58 `latest`, dan meldt de Engineer dat aan de Projectleider en de Architect.

| Mijlpaal | Inhoud | Klaar als |
|---|---|---|
| **M1 core** | projectskelet (package.json §4.1, tsconfig ×2, Jest §13.1, babel), `src/core/**`, `test/arch/*` | `check:deps` en `typecheck` zijn schoon. Tests groen voor S-05, S-06, S-07 (core), S-11 (core), S-16 (HLC-deel), F-08 (met een voorlopige fixture tot de Eindtester levert), F-10, F-11, F-12, F-15, F-17-core en NF-01-crypto. Lijndekking `src/core` ≥ 90%. `imports.test` groen. |
| **M2 opslag + service (1 apparaat)** | SqlDriver ×2, migraties, Repository (`tx`/`read` + mutex), KeyStore ×2, `BootschapApp` met `StateCache` en `WriteQueue` zonder sync | F-01..F-07, F-09, F-17, S-01, S-02 (lokaal: crash midden in een transactie, commitfout → terugdraaien), UX-05 (facade), NF-04, NF-13, UX-10 en `mutex.test` groen. Koude `init()` + `view()` van 500 items < 200 ms in Node. De Architect toetst de DTO-typen (E-18). |
| **M3a sync-engine (geheugen)** | Transport-interface, engine (Publisher met single-flight-lock, CAS, versies en in-flight per event-ID, Receiver, SelfCheck, status), `MemoryTransport`/`MemoryHub`, sim-devices met KillSwitch, contracttests (memory-kant) | Groen: S-02 (volledig, met crashpunten), S-04, S-05/S-11 (sync-deel), S-07, S-17, S-18, S-19 (memory), S-20, S-21 (op virtuele tijd), `device.test` (geen I/O na kill, I-2, K-1). **Versietests B-1, B-2 en I-3 op de hub**, met een virtuele relay-klok en toleranties. Seeds: ≥ 200, ≤ 2 min. Review door de Architect vóór M3b. |
| **M3b Nostr** | `NostrTransport`, `RelayConnection`, `RelayCore`/`WsTestRelay` met alle foutknoppen, contracttests (Nostr-kant) | Groen: S-03, S-08, S-09, S-10 (a–d, plus B-2), S-12, S-13, S-14, S-15, S-16 (+1 u, −1 u, twee toleranties met 3 herstarts, B-1 en I-3 tegen de WS-relay), S-19 (Nostr), NF-01/02/03/05/06/11/12 en F-13/14 (inclusief één lege en één gevulde relay)/15/16/18. De volledige `npx jest` duurt ≤ 5 min. Rapport: bewijs van de eigen-staatcontrole bij `silentDrop` en `wipe`. **Bij oplevering de datum van de rooktest met Nick afspreken.** |
| **M4 UI** | **Eerst de A-04-controle**: blijft SDK 57 in Expo Go, of volgt het upgradepad (§4.3)? Daarna `app/**`, `src/ui/**`, polyfills + selftest, adapters voor AppState en NetInfo, QR en camera, de bevestigingsdialogen (§12.1) | UX-01, UX-02, UX-05 (store), UX-07 (`confirm.test`) en UX-13 [auto] groen. `expo export` ios/android slagen, `expo-doctor` is schoon. **Rooktest door Nick in Expo Go op beide telefoons (H-01, H-02, `selftest.ok` in de log).** |
| **M5 afronding** | README (DoD 6), inclusief de expliciete melding dat een link in Expo Go de app niet opent (PL, besluit 1); bekende beperkingen; Could-eisen als er tijd is; ARCHITECTURE bijgewerkt naar de code, inclusief DTO-typen | DoD sectie 8 volledig. Eindtester volgt de README op een schone checkout. |

## 15. Risico's en mitigaties

| Risico | Kans/impact | Mitigatie |
|---|---|---|
| Expo Go in de stores gaat naar SDK 58 (`next` sinds 2026-09-29; preview tot stabiel duurde eerder 5–15 dagen) en opent het SDK 57-project niet meer | **H**/H | A-04-check bij elke mijlpaal en vast aan het begin van M4. Upgradepad §4.3 (inclusief Jest 30). M1–M3 zijn SDK-onafhankelijk. Tests zijn nu al Jest-30-compatibel. |
| Een relay weigert, beperkt of ruimt onze events op | M/H | 4 gemeten relays. Gemergede staat per apparaat. Eigen-staatcontrole bij elke EOSE. Relays instelbaar (F-19). Status `beperkt`/`fout`. |
| Een relay laat events stil vallen zonder OK (gemeten: nos.lol) | H/M | Time-out van 8 s, maximaal 5 retries, daarna de eigen-staatcontrole. Niet in de standaardset. |
| Rate limits of max. aantal subscriptions (20) | M/M | 1 REQ per relay. ≤ 1 publicatie/s per lijst. Backoff bij `rate-limited:`. |
| Een `created_at` buiten de tolerantie (gemeten 300–900 s) | M/H | Engine-versies met een vloer en terugrollen, een persistente klokcorrectie naar de strengste relay, wachten in plaats van roteren bij een kleine voorsprong, rotatie alleen bij > 1 u (§6.8). Tests met twee toleranties en herstarts. |
| Hermes: `crypto.getRandomValues` ontbreekt | L/H | Polyfill via expo-crypto als eerste import. `selftest.ok` in de M4-rooktest. De `TextDecoder` levert Expo winter al (geverifieerd, E-10). |
| Snelheid van crypto onder Hermes (Node: sign 1,3 ms, verify 0,8 ms, AEAD 48 KiB 0,28 ms; Hermes ±10–50×) | M/M | Dedup en goedkope controles vóór `verify()`. Eigen echo's niet verifiëren. Alleen gewijzigde delen opnieuw opbouwen. Zwaar werk ná de eerste render. Meting in de M4-rooktest. |
| Lezen tijdens een open transactie op dezelfde verbinding | M/H | Alle SQL via `Repository` met één mutex (§9.2). Afgedwongen met `mutex.test`. |
| Zombie-instanties in crashtests geven een vals-groen resultaat | M/M | KillSwitch en drain (§13.3). Bewezen met `device.test`. |
| De lijst groeit door tombstones (geen GC in v1) | L/M | Opsplitsen tot ±14.000 records, daarna `fout` met tekst. S-22 later. |
| Spam onder onze d-tags | L/M | Een `authors`-filter met bekende leden. AEAD filtert de rest weg. |
| Een eigen URL-schema werkt niet in Expo Go | Zeker/L | Scannen en plakken (REQUIREMENTS v0.3). De README meldt het. |
| npm haalt via peers de verkeerde versies van native modules binnen | M/M | Expliciet gepind (§4.1). `check:deps` en `deps.test`. |

## 16. Punten voor het eindakkoord (v1.0)
- **Projectleider en Engineer:** controleer of v1.0 overeenkomt met de code (§3, §10, §18) en geef het eindakkoord (DoD 7).
- **Nick (rooktest):** H-01..H-07 in Expo Go. Let daarbij op `selftest.ok` in de log, op de snelheid bij een lijst van 1000 items, en op de SDK-versie van Expo Go (A-04, §4.3).
- **Bekende beperkingen (README §7):**
  - geen opruiming van tombstones (S-22, Could);
  - de link opent de app niet in Expo Go;
  - publieke relays zonder garantie;
  - de Could-eisen van D-29 zijn niet gebouwd.

## 17. Review-afhandeling (v0.1 → v0.2)
L = review van de Projectleider (`docs/reviews/review-lead-architecture.md`), E = review van de Engineer (`docs/reviews/review-engineer-architecture.md`).

| Bevinding | Besluit | Sectie |
|---|---|---|
| L-besluit 1 (F-13/H-01/F-14) | Overgenomen. README-melding over de link in Expo Go is opgenomen in M5. | §7, §14 |
| L-besluit 2 (F-08: 16 categorieën identiek) | Overgenomen. §8.1 is gelijk aan de lijst in F-08 (16, met Huisdieren). | §8.1 |
| L-1 UX-07 zonder component of test | Overgenomen: dialogen en snackbars per actie, `confirm.ts`, een autotest en een handmatig scenario. Gereed vóór M4. | §12.1, §13.6, §14 |
| L-2 F-14: lege relay geeft een halve of lege lijst | Overgenomen: "Ophalen…" tot een complete snapshot van één afzender, alle open relays EOSE, of 10 s. Test met één lege en één gevulde relay. | §6.7, §6.9, §7, §13.6 |
| L-3 S-16: test voor een klok die te vroeg loopt | Overgenomen: klok −1 u met een relay met `pastToleranceSec`. | §6.8, §13.2, §13.6 |
| L-4 (geen actie) | Genoteerd. | — |
| E-1 pakketlijst onvolledig (ERESOLVE, babel-preset-expo, react-dom, reanimated/worklets/gesture-handler, @babel/core 8) | Overgenomen: alles gepind, plus `check:deps` en `deps.test`. | §4.1, §13.5 |
| E-2 TS 6: `types` is leeg | Overgenomen: twee tsconfigs, `@types/node ~25.9.9`. Geverifieerd in de proefapp van de Engineer (`tsc` groen met `types: ["jest","node"]`). | §4.2, §13.1 |
| E-3 `created_at`: eigenaarschap, persistentie, klokcorrectie, ordening van de hub | Overgenomen, met een uitbreiding. De engine bezit de versie per slot (`last_version`, `floor_version`, `floor_before`), persistent in de persist-transactie. `prepare` krijgt de versie. Bij een klokweigering bereidt de engine opnieuw voor via het normale flush-pad. `offsetSec` is persistent en gaat naar de strengste relay. Nieuw: **vloer terugrollen** als aantoonbaar geen enkele relay het event heeft, wat zonder lus convergeert. Rotatie alleen bij > 1 u. De hub ordent op versie. `transport_kv` vervalt. | §6.6, §6.8, §9.1, §10, §13.2 |
| E-4 lezen buiten de mutex | Overgenomen: `repo.read` onder dezelfde mutex, driver niet geëxporteerd, `mutex.test`. | §9.2 |
| E-5 eigenaarschap van retries en `send` naar een niet-open endpoint | Overgenomen: de engine bezit alle verzendingen en timers, de transport meldt alleen. `not-connected` → eigen-staatcontrole. | §6.6, §10 |
| E-6 optimistische UI past niet op de facade | Overgenomen: `StateCache` + `WriteQueue` in de facade, commando's geven `Pending<T> = {result, committed}`, terugdraaien door herladen uit de database. Store is een dunne laag. | §9.3, §10, §12 |
| E-7 zombies na `kill()` | Overgenomen: KillSwitch, drain bij `restart()`, `device.test`. | §13.3 |
| E-8 SDK 58 dichterbij, Jest 30 | Deels overgenomen. **We blijven op SDK 57** (op npm `latest`; besluit van de coördinator). A-04-check bij elke mijlpaal en vast aan het begin van M4. Upgradepad met Jest 30 beschreven. Tests nu al Jest-30-compatibel. Een besluit "direct naar 58" is pas nodig als 58 `latest` wordt. | §4, §4.3, §14, §15 |
| E-9 M3 te groot | Overgenomen: M3a (engine + geheugen) en M3b (Nostr), elk met een eigen review. Rooktestdatum bij M3b. | §14 |
| E-10 `TextDecoder`-polyfill overbodig | Overgenomen: polyfill vervalt, `selftest.ts` toegevoegd. | §3, §4.2, §11 |
| E-11 willekeur buiten `Random` | Overgenomen: sleutels, nonces en ID's via `Random`, scalar-check via `identityFromSecret`, importregel. | §2, §5.1, §6.1, §10 |
| E-12 acks op oudere events | Overgenomen: `inFlight`-map, onbekende ID's negeren. | §6.6 |
| E-13 onbegrensde retries; time-outs als `fout`? | Overgenomen: maximaal 5 retries per event per endpoint. "Time-outs = fout" ligt als voorstel bij de Projectleider (vlag, standaard uit). | §6.6, §6.9, §16 |
| E-14 verwijderen van een gedeelde lijst moet op de staat zijn gebaseerd | Overgenomen: `D` verbergt de lijst direct; bij opstarten en bij een ack wordt afgerond; tabellen expliciet opruimen. | §7, §9.1 |
| E-15 geen lege publicaties en geen `pending_changes` zonder sync | Overgenomen. | §6.6, §7, §9.3 |
| E-16 details van de payloadcodec | Overgenomen: `b` = kleinste ms, validatie per record, streaming-`Inflate`. | §6.2, §6.4, §6.7 |
| E-17 Transport-interface: slots, relayset per lijst, EOSE-generatie, AAD | Overgenomen: slots altijd 16; relay-hints gaan naar de globale set (`list_relays` vervalt); `setSubscriptions` geeft een generatie; de engine bouwt de AAD. | §6.2, §6.7, §6.10, §9.1, §10 |
| E-18 DTO-typen ontbreken | Overgenomen volgens het voorstel van de Engineer (definitie in M1/M2, toets in M2, documentatie in M5). Randvoorwaarden voor `JoinResult` en `SyncStatus` vastgelegd. | §10, §14 |
| E-19 licenties met SPDX-expressies | Overgenomen: OR/AND/haakjes, MPL-2.0 toegestaan. | §13.5 |
| E-20 kort "offline" bij het opstarten | Overgenomen: de eerste verbindingspoging telt als `bezig`. | §6.9 |
| E-21 tijdsbeheer en looptijd van de seeds | Overgenomen: microtask-drain in `runUntilQuiet`, importverbod, geen Schnorr in `MemoryTransport`, looptijdbudget. | §2, §13.2–13.4 |

### 17.1 Afhandeling van de reviews op v0.2 (v0.2 → v0.3)
PL2 = `docs/reviews/review-lead-architecture-v0.2.md` (akkoord), EN2 = `docs/reviews/review-engineer-architecture-v0.2.md` (niet akkoord).

| Bevinding | Besluit | Sectie |
|---|---|---|
| EN2 B-1: de terugrolvoorwaarde breekt de vloer-invariant na een herstart of eigen-staatcontrole | Overgenomen. `inFlight` per event-ID met samenvoegen (`sentTo`, `answers`, `deliveredBy`). Terugrollen alleen als **elke** relay uit de set in deze run `clock-ahead` gaf, niemand accepteerde of leverde, en `e` de klokversie is die de vloer bepaalt. Alleen bij `clock-ahead` (`clock-behind` → gewone flush). Eén definitie van `clockDerived` (`v == nowAdj`), persistent als `last_clock_derived`. Correctie maximaal één keer per event. Tests: het scenario met herstart (geen terugrol) en een positief geval. | §6.6, §6.7 stap 3, §6.8, §9.1, §13.6 |
| EN2 B-2: gelijktijdige flushes geven gelijke versies | Overgenomen. Single-flight-lock per lijst, alle paden via `Publisher.flush`, samenvoegen met de vlag `again`. CAS op `floor_version` in stap 4 (bij een afwijking `ROLLBACK` en opnieuw). Retries en heruitzendingen van bestaande events wijzigen geen versie. Test met de hook `in-prepare` en `too-large`. | §6.6, §6.8, §13.3, §13.6 |
| EN2 I-1: `WriteQueue` overschrijft records | Overgenomen. Een taak draagt alleen haar delta, en de transactie doet `merge(rij, delta)`. Test: lokale en remote merge in de wachtrij. | §9.3, §13.6 |
| EN2 I-2: `SeededRandom` over een herstart | Overgenomen. Dezelfde instantie blijft bestaan, net als de keystore. Test: geen dubbele ID's of nonces over 5 herstarts. | §13.3, §13.6 |
| EN2 I-3: een tweede event vóór de weigering leidt tot onnodige rotatie | Overgenomen. De flush wacht (max 8 s) als het laatste event van een slot een `clock-*`-weigering heeft en er nog antwoorden openstaan. Restgeval: als de RTT groter is dan het venster en alle relays weigeren, volgt rotatie bij > 1 u. Dat is veilig en wordt bewust geaccepteerd. Test: 5 bewerkingen in 2 s. | §6.6 stap 1b, §6.8, §13.6 |
| EN2 K-1: zombies laten bevriezen | Overgenomen. | §13.3 |
| EN2 K-2: uitzondering op de importregel voor polyfills en selftest | Overgenomen. | §2 |
| EN2 K-3: timer voor heruitzending in stap 3 | Overgenomen: een timer per slot, geannuleerd bij een nieuwer event of bij `pause`. Na een herstart vangt de eigen-staatcontrole het op. | §6.8 stap 3 |
| PL2 besluit (a): time-outs tellen als `fout` | Overgenomen. `timeoutsCountAsFailure = true`, `failingSinceMs` alleen bij `pendingCount > 0` en ≥ 1 open relay; zonder open relay `offline`; herstel bij een ack. Rustige UI-tekst. Test toegevoegd. | §6.9, §13.6 |
| PL2 besluit (b): A-04 | Al verwerkt in §14 (controle aan het begin van M4 en bij elke mijlpaal). | §14 |

## 18. Overgenomen afwijkingen en code-reviews (v1.0)

Alle afwijkingen uit `docs/DEVIATIONS.md` (D-01..D-35) zijn door de Architect beoordeeld (`docs/reviews/review-architect-code-M1-M3b.md`, `…-M4-M5.md`). Ze zijn goedgekeurd en hieronder, of in de genoemde sectie, verwerkt.

| ID | Inhoud | Verwerkt in |
|---|---|---|
| D-01 | `Transport`: `isOpen`, `close`, `InboundMessage.raw`, `accepted.duplicate` | §10 |
| D-02 | Interface `SyncHost` tussen engine en facade | §2, §10 |
| D-03/D-03b, D-25 | Terugrollen via een keten van aantoonbaar afwezige events, via `prevId` | §6.8 |
| D-04 | `lastFlushEndMs` begrensd tot nu (klok springt terug) | §6.6 |
| D-05 | Zonder transport alleen het Nostr-geheim bewaren; pubkey en `members` aanvullen zodra de transport er is | §6.1, §11 |
| D-06 | Extra facade-methoden, `CommandError`, `AddInput.text` wordt ontleed | §10 |
| D-07 | Bij een commitfout alleen lokale taken van die lijst afwijzen | §9.3 |
| D-08 | Uitwerking van `failingSinceMs` | §6.9 |
| D-09, D-10, D-11, D-23 | Testinfra: `npm test` zonder ExperimentalWarning, eigen semver-check, `wss://…test`-namen in de hub, zombie bevriest | §13 |
| D-12 | Fixture F-08 van de Eindtester is normatief (D-12 gesloten) | §8.1 |
| D-13 | Suggestie-index: één telling per (lijst, item); `lastMs` = register `a` | §8.3 |
| D-14 | Tijden van de transport uit `Config` | §10 |
| D-15 | Verlaten: sleutels → lopende flush afwachten → database; geen herpublicatie na verlaten | §7 |
| D-16, D-17 | Grootte-check op het ruwe frame; eigen events nooit mergen | §6.7 |
| D-18 | `view()` toont geen items zolang `joined_pending` | §7 |
| D-19 | `createApp.ts` (productiebedrading) | §10, §11 |
| D-20, D-30 | Transport opnieuw opbouwen na koppelen met hints of `setRelays`; single-flight `serialLifecycle` | §6.10, §11 |
| D-21 | `allowInsecureRelays` (standaard `false`), alleen `wss://` | §6.10, §7 |
| D-22, D-31 | `pause()` begrensd op 3 s (`urgent`), en een pause-generatie tegen de race met `resume()` | §11 |
| D-24 | Korte samenstellingskoppen `ijs`/`jam`; woordenboek als expliciete termenlijst met merken | §8.1 |
| D-26, D-27, D-28 | Eigen SVG-iconen; wissen en verwijderen met een undo-snackbar; `nativeAlert` (op Android niet wegtikbaar) | §12 |
| D-29 | Could-eisen UX-12, UX-14, F-20 en F-21 niet gebouwd; F-19 wél | §16 |
| D-32 | `ItemView`-cache per onveranderlijke `ItemState` | §5.5, §12 |
| D-33 | `Regs = Readonly<…>`, `MutableRegs`, `ReadonlyMap`, plus `immutability.test.ts` | §5.5, §10 |
| D-34 | F-08-matcher (bepalende voorvoegsels, misleidende koppen, plakjes/beleg, niet-boodschappen) en een breder woordenboek (D-ET-07) | §8.1 |
| D-35 | Begrensd zelf opnieuw proberen na `refused`/`other` (D-ET-05) | §6.6 |
| D-ET-08 | Expo-patchversies via `npx expo install --fix` | §4.1 |
| D-37 | Swipe-rijen met `ReanimatedSwipeable` (UX-15/UX-16), `SwipeGroup`, accessibility action, `GestureHandlerRootView`, UI-mocks. Goedgekeurd met voorwaarde S-1 (`docs/reviews/review-architect-CR01-02.md`) | §4.1, §12 |
| D-38..D-43 | Store-publicatie: feitencorrecties, rechten, splash/system-ui, licentiescherm, EAS-profielen, schema `boodschap://` (review CR-03) | §19 |
| D-44..D-46, D-50 | Toestelherstel: `install_id` device-only (D-44), uitgever/KvK (D-45), R-1/K-6 (D-46), merkteken in de cache (D-50) | §19 |

**Fixes uit de code-reviews die het ontwerp aanscherpen (normatief vanaf v1.0):**
- **Terugrollen trekt het event in.** `rollbackFloor` zet `last_event_*` op NULL/0. Zo kan een ingetrokken event nooit later alsnog worden opgeslagen (§6.8).
- **Dedup pas na verify en AEAD.** Een event-ID wordt pas onthouden na een geslaagde handtekening- én AEAD-controle (§6.7).
- **`kick()` tijdens `connecting` doet niets.** Er komt geen tweede socket (§6.10).
- **`COMMIT` in de `try`.** Bij een fout volgt een `ROLLBACK` (§9.2).
- **Timerboekhouding.** Alle timers in engine, transport en test-relay worden bijgehouden en gewist. `npm run test:handles` moet schoon zijn (§13).
- **Batch-SELECT in `mergeIntoDb`.** Per 400 items één query (§9.3).
- **Herstel na voorgrond en pull-to-refresh.** `resume()` en `syncNow()` resetten de eigen-staatcontrole vóór `kick()`, zodat een relay die data verloor zonder dat de verbinding brak, opnieuw wordt gevuld (D-ET-01, §6.8, §11).
- **Deelcode.** Volgorde lengte → controlesom → versie (§7).
- **UI:**
  - `useShareInfo` zonder pollinglus;
  - `scanGate` (2 s pauze na een fout);
  - klembord wissen na koppelen;
  - `AppProvider` sluit de app af bij unmount en heeft "Opnieuw proberen";
  - monospace per platform (§12).

## 19. Store-publicatie (CR-03, v1.1)

**Identiteit en versies.**
- App-ID op beide platformen: `nl.derondeengineering.boodschap`.
- Weergavenaam `BOODSCHAP!`, slug en packagenaam `boodschap`, versie `1.0.0`.
- `eas.json`: `appVersionSource: remote` en `production.autoIncrement`; Android als `app-bundle`.
- Er is geen `expo-updates`: updates gaan alleen via de stores (ST-18).
- Uitgever:
  - Apple (individueel account): Nick de Ronde.
  - Google Play (organisatie): De Ronde Engineering.
  - Beide als DSA-handelaar; de stores tonen de handelaarsgegevens.

**Configuratie (`app.json`).**
- **Schema's:** `["boodschap","bootschap"]` (D-43).
- **Lokalisatie:** `locales/nl.json` en `en.json` (cameratekst, weergavenaam), `CFBundleDevelopmentRegion nl`.
- **iOS:**
  - `supportsTablet: false`;
  - `ios.config.usesNonExemptEncryption: true`, ofwel `ITSAppUsesNonExemptEncryption` (eigen standaardcrypto, niet vrijgesteld). Eerst zonder Frankrijk, daarna `ITSEncryptionExportComplianceCode` (D-38, `docs/store/export-compliance.md`).
- **Android:**
  - `permissions` CAMERA + INTERNET, plus de normale rechten van netinfo (ACCESS_NETWORK_STATE/ACCESS_WIFI_STATE);
  - een uitgebreide `blockedPermissions` (o.a. AD_ID, RECORD_AUDIO, opslag, locatie);
  - camera als optionele hardware via `plugins/withOptionalCamera.js`;
  - `allowBackup: false` (D-39).
- **Plugins:** `expo-splash-screen` (licht/donker) en `expo-system-ui` (nodig voor `userInterfaceStyle: automatic` in Android-builds) (D-40).

**Netwerk en privacy (ongewijzigd principe, NF-06).**
- De app maakt alleen wss-verbindingen met de ingestelde relays.
- Privacybeleid, support en broncode zijn vaste https-constanten (`src/ui/links.ts`). Ze worden alleen op een tik van de gebruiker in de browser geopend en zijn geen verbinding van de app.
- Privacylabels en Data Safety: "niet verzameld", onderbouwd in `docs/store/privacy-labels.md`. Crashrapporten en statistieken van Apple en Google zijn platformgegevens en staan in het privacybeleid (review CR-03 C-1).

**Deellinks (ST-10, D-43).**
- Nieuwe links gebruiken `boodschap://join#<code>`; de parser accepteert elke `…://join#<code>` en `BS1-…`.
- De cryptografische domeinlabels (`bootschap/v1` in HKDF-salt en AAD) en de databasenaam blijven ongewijzigd, omdat ze deel zijn van het protocol.
- Een eigen schema is in de meeste chat-apps niet klikbaar, dus de deeltekst bevat altijd ook de tekstcode. Universele links zijn een Could.

**Herstel van een toestel (review CR-03 C-2, normatief vanaf v1.1).** Een iOS-back-up of -migratie kopieert database en Keychain. Om dubbele apparaat- en Nostr-identiteiten te voorkomen, bewaart de app een `install_id` in `meta` én in de SecureStore met `WHEN_UNLOCKED_THIS_DEVICE_ONLY`.
- **Ontbreekt of wijkt af:** dan is het toestel hersteld.
  - Er komt een nieuwe `device_id` (HLC-node), gevolgd door `rotateIdentity` voor elke gedeelde lijst en een nieuwe `install_id`.
  - Lijsten en lijstgeheimen blijven bewaard, en het toestel synchroniseert verder als nieuw lid.
- Deze regel is een aanvulling op §5.1 (de apparaat-ID is uniek per installatie) en §6.1 (de Nostr-sleutel per installatie per lijst).
- **KeyStore faalt structureel (K-6, D-46).** Dan krijgt de database de markering `install_id_unsaved`, en roteert de app niet bij elke start.
- **Device-only merkteken (R-2, D-50).** In dat geval staat de install_id ook in een bestand in `Paths.cache` (`expo-file-system`; iOS `Library/Caches` zit niet in back-ups).
  - Merkteken gelijk → origineel, niet roteren.
  - Merkteken ontbreekt → kopie (of opgeruimde cache) → één veilige rotatie.
  - Merkteken niet lees- of schrijfbaar → K-6-gedrag, nooit roteren. Er is dus geen rotatielus.
- **Android.** `allowBackup: false`. Aandachtspunt A-1 (review CR-03 §8): zorg met `dataExtractionRules`/`fullBackupContent` (config-plugin) dat ook een overdracht van toestel naar toestel niets meeneemt, en controleer dat in de gebouwde manifest.

**Licenties (ST-07, D-41).** `npm run gen:licenses` genereert `src/ui/licenses.generated.ts` uit dezelfde bron als `check:licenses`. Het bestand bevat alle productiepakketten met SPDX en copyrightregels, plus één volledige tekst per licentiesoort (en de NOTICE-inhoud van Apache-pakketten, K-3). Een test faalt als het bestand verouderd is.

**Repository (ST-14/15).**
- MIT, copyright Nick de Ronde; naam, logo en icoon zijn uitgesloten (`NOTICE`).
- Publicatie gebeurt vanaf een schone root-commit met het noreply-adres. De lokale historie wordt nooit gepusht.
- `npm run check:secrets` (werkmap en historie) moet op de publieke branch 0 treffers geven.

## Changelog
| Versie | Datum | Wijziging |
|---|---|---|
| 0.1 | 2026-10-06 | Eerste versie (Architect). Geverifieerd: npm-versies en de SDK 57-bundel (`react-native` 0.86.3), Jest 29 + noble 2.x ESM + nostr-tools 2.25.2 in Node 25 (proef groen), `node:sqlite` in Jest, en relaygedrag (grootte 64 KiB, `created_at`-tolerantie, nos.lol laat stil vallen). |
| 0.2 | 2026-10-06 | Reviews van Projectleider en Engineer verwerkt (zie §17). De belangrijkste wijzigingen: volledige pakketlijst en twee tsconfigs; versies per slot bij de engine, met vloer en terugrollen en een persistente klokcorrectie; alle verzendingen en retries bij de engine; `repo.read` onder de mutex; optimistische UI in de facade (`StateCache`, `WriteQueue`, `Pending<T>`); KillSwitch; UX-07-dialogen; F-14 "Ophalen…"; S-16-test voor een klok die te vroeg loopt; M3 gesplitst in M3a en M3b; A-04-check aan het begin van M4 en het upgradepad naar SDK 58. Basis: REQUIREMENTS v0.3. |
| 0.3 | 2026-10-06 | Reviews op v0.2 verwerkt (§17.1). B-1: veilige terugrolvoorwaarde met `inFlight` per event-ID en `deliveredBy`. B-2: single-flight-lock per lijst en CAS op de vloer. I-1: deltamerge in de `WriteQueue`. I-2: `Random` overleeft een herstart. I-3: wachten op open klokantwoorden. K-1..K-3. Besluit PL: time-outs tellen als `fout`. Basis: REQUIREMENTS v0.3.1. |
| 1.0 | 2026-10-06 | Bijgewerkt naar de opgeleverde code (DoD 7). §3 mappenstructuur en §10 interfaces volgens de code (`Transport` D-01, `SyncHost` D-02, facade D-06, DTO's E-18, `Config`). Alle goedgekeurde afwijkingen D-01..D-32 en de normatieve fixes uit de code-reviews M1–M3b en M4/M5 zijn verwerkt (§18, plus de genoemde secties). |
| 1.0.1 | 2026-10-06 | Redactioneel, na de review van de Engineer op v1.0: `expo-keep-awake` uit §4.1 (niet geïnstalleerd, UX-14 niet gebouwd), `ListState`/`Regs` als `Readonly`/`ReadonlyMap` in §5.4 en §10. Daarnaast D-33..D-35 en D-ET-08 (Expo-patchversies) verwerkt in §4.1, §5.5, §6.6 en §18. |
| 1.0.2 | 2026-10-07 | CR-01/CR-02 (REQUIREMENTS v0.5, UX-15/UX-16): swipe-rijen (D-37) verwerkt in §4.1, §12 en §18. Goedgekeurd met de voorwaarde S-1 uit de review: de volledige swipe meten op de sleepafstand van de vinger. |
| 1.1 | 2026-10-07 | CR-03 store-publicatie: nieuw §19 (identiteit, `app.json`/`eas.json`, rechten, export compliance, deellinks, normatieve regel voor toestelherstel `install_id`, licenties, publicatie van de repository). D-38..D-43 goedgekeurd (review CR-03). |
| 1.1.1 | 2026-10-08 | §19 aangevuld met K-6/`install_id_unsaved` (D-46) en het device-only merkteken in `Paths.cache` (D-50); Android-aandachtspunt A-1 (`dataExtractionRules` voor overdracht tussen toestellen). D-44..D-46 en D-50 verwijzen naar §19. |
