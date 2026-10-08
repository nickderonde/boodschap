# Voortgang — Bootschap

Eigenaar: Engineer. Bijgewerkt: 2026-10-06. Basis: ARCHITECTURE v0.3 (akkoord Engineer: `docs/reviews/review-engineer-architecture-v0.3.md`), REQUIREMENTS v0.3.1. Afwijkingen: `docs/DEVIATIONS.md`.

## Samenvatting

| Mijlpaal | Status | Tests (geslaagd/gefaald) | Klaar-criteria (§14) |
|---|---|---|---|
| M1 core | **Klaar** (Architect: akkoord met opmerkingen, verwerkt) | 86 / 0 (core + arch) | `check:deps` en beide `tsc`-runs schoon; S-05, S-06, S-07 (core), S-11 (core), S-16 (HLC), F-08 (voorlopige fixture, 100%), F-10, F-11, F-12, F-15, F-17-core, NF-01-crypto groen; lijndekking `src/core` 91,15 % (≥ 90 %); `imports.test` groen. |
| M2 opslag + service | **Klaar** (Architect: akkoord, DTO-aanpassingen verwerkt) | +30 (totaal 116 / 0 na M2) | F-01..F-07, F-09, F-17, S-01, S-02 (lokaal), UX-05 (facade), NF-04, NF-13, UX-10, `mutex.test` groen; koude `init()` + `view()` van 500 items < 200 ms. |
| M3a sync-engine (geheugen) | **Klaar** (Architect: akkoord met opmerkingen, verwerkt) | +56 (totaal 172 / 0 na M3a) | S-02 (volledig, alle 5 crashpunten aantoonbaar geraakt), S-04/S-18 (200 seeds; ook 1000 seeds groen in 17 s), S-05/S-11 (sync), S-07 (a–f × 2 volgordes), S-17, S-19 (memory), S-20, S-21, `device.test` (I-2, K-1), versietests B-1, B-2, I-3 en D-03/D-03b op de hub. Seed-suite < 10 s. |
| M3b Nostr | **Klaar** (Architect: akkoord met opmerkingen; bevindingen 1–15 verwerkt, zie `docs/reviews/review-architect-code-M1-M3b-response.md`) | totaal **220 / 0** | S-03, S-08 (a–c), S-09, S-10 (a–d + B-2), S-12 (p95 ≤ 2 s, max ≤ 5 s), S-13, S-14, S-15, S-16 (+1 u, −1 u, 300/900 s met 3 herstarts, B-1, I-3 tegen WS), S-19 (Nostr), NF-01/02/03/05/06/11/12, F-13/14 (incl. lege + gevulde relay, (b) en (c))/15/16/18, F-01-sync. Volledige `npm test` ≈ 15 s (budget 5 min). |
| M4 UI | **Klaar** (Architect: akkoord met opmerkingen; N1–N3 en K-1..K-8 verwerkt, zie `docs/reviews/review-architect-code-M4-M5-response.md`; rooktest met Nick nog te doen) | +14 UI-tests (ui-project) | A-04-check aan het begin: SDK 57 = `latest` → geen upgrade. Expo Router-schermen in het Nederlands (lijsten, lijst, item bewerken, delen met QR, koppelen met scannen/plakken, instellingen met relays). UX-01 (`strings.test`), UX-02 (`statusText.test`), UX-05 (`store.test`), UX-07 (`confirm.test`), UX-10 (`selectors.test`) en UX-13 groen. `expo export` ios/android, `expo-doctor` 21/21, `npx expo start` start zonder fouten (dev-bundel HTTP 200). |
| M5 afronding | **Grotendeels klaar** | — | `README.md` (installatie, twee telefoons via Expo Go, koppelen, relays en privacy, waarschuwing B-02, beperkingen, EAS-pad, testcommando's). Open: de Eindtester volgt de README op een schone checkout; de Architect werkt ARCHITECTURE bij (D-01..D-29). |

## Laatste volledige run (publicatie: store.config.json en klikgids)

- `store.config.json` (EAS Metadata Apple, NL/EN, gegenereerd uit `store/`, `metadata:lint` geldig), `eas.json` submit-profiel iOS, `docs/STORE_INVULLEN.md` (klikgids App Store Connect en Play Console). D-47.

### Eerder: review CR-03 §6: R-1, K-6; K-2, K-3, K-5

- R-1 en K-6 opgelost (D-46), met tests die zonder de fix falen (restore, relay-CLOSED, buildFilters, K-6); strfry-gedrag live bevestigd met één alleen-lezende REQ. Supportpagina NL/EN: adres en telefoon staan bij de handelaarsgegevens in de stores.

### Eerder: review CR-03 C-1, C-2, C-4

- C-1: privacybeleid NL/EN noemt crashrapporten en statistieken via Apple en Google; `privacy-labels.md` bijgewerkt (labels blijven "niet verzameld"). C-2: `install_id` (deviceOnly) en herstelherkenning (§19, D-44); `test/integration/restore.test.ts` (3 tests, falen alle drie zonder de fix). C-4: uitgever met KvK-nummer 61854735, geen adres (D-45); `docs/store/uitgever.md` bijgewerkt. D-ET-11: copyright "2026 Nick de Ronde"; markering `test.failing` van ET-ST19-1 verwijderd. K-2: `development`-profiel weg; K-3: NOTICE-inhoud van Apache-pakketten in het licentiescherm; K-5: Engelse reviewnotities (geen publieke gebruikersinhoud, eigen schema niet klikbaar).

## Eerder: CR-03, store-publicatie voorbereid

- Gebouwd: `app.json` (ID's, schema's, permissies, iconen, splash, lokalisaties, versleuteling), `eas.json`, iconen/splash/feature graphic uit SVG (`npm run make:icons`), `site/` + Pages-workflow (privacybeleid en support NL/EN), `store/` (teksten NL/EN, limieten), `docs/store/*` (privacylabels, exportverklaring, leeftijd, uitgever, demodata), `docs/CHANGELOG.md`, `LICENSE` (MIT), `NOTICE`, `SECURITY.md`, `CONTRIBUTING.md`, Instellingen → Privacybeleid/Support/Broncode/Licenties (ST-07), `boodschap://` (ST-10), `npm run check:secrets` (ST-15), `npm run make:screenshots` (ST-09). Afwijkingen D-38..D-43.
- `npm test`: 480 geslaagd, 2 gefaald (acceptatietests van de Eindtester die nog `bootschap://join#` verwachten, D-43), 1 overgeslagen; typecheck schoon; `expo export` ios/android geslaagd; expo-doctor 21/21; `expo prebuild` in een tijdelijke kopie: Info.plist en AndroidManifest gecontroleerd.
- Open voor publicatie: `check:secrets` vindt nog persoonlijke gegevens in de git-historie en een lokaal pad in APPROVALS/REQUIREMENTS (besluit Nick/Projectleider).

### Eerder: na CR-01/CR-02, swipe-to-delete

- Review Architect CR-01/02: S-1 (volledige swipe op toestel vrijwel onhaalbaar) opgelost: vingerafstand bij loslaten, drempel 50% van de rij, friction 1; 4 nieuwe tests (rij 393 pt) die met de oude implementatie falen. D-37 bijgewerkt. K-1/K-2 (mount-kosten, tik op open rij) blijven [handmatig] op het toestel.
- UX-15 (items) en UX-16 (lijsten) gebouwd op stand `2020b20`: `SwipeRow` met `ReanimatedSwipeable`, `GestureHandlerRootView` in `_layout`, tests in `src/ui/swipe.test.tsx` (11 tests, met mutatiecontrole: elke kernregel faalt zonder de fix). Afwijkingen/keuzes: D-37.
- `npm test`: **419 geslaagd, 0 gefaald, 1 overgeslagen**; `test:handles` schoon; typecheck schoon; `expo export` ios/android geslaagd; expo-doctor 21/21; check:deps en licenties schoon. Nog niet gecommit (wacht op reviews). Handmatig te testen: het gevoel van het gebaar op een echte telefoon.

### Eerder: na ronde 3 van de Eindtester

- `npm test`: **408 geslaagd, 0 gefaald, 1 overgeslagen**. D-ET-07 ronde 3 (matcherregels + woordenboek) en O-ET-10 (README) opgelost; wacht op blinde set 4. Zie het ronde-3-deel van `docs/reviews/test-report-fase2-response.md`.

### Eerder: na fase 2 van de Eindtester

- `npm test`: **69 suites, 394 geslaagd, 0 gefaald, 1 overgeslagen** (live-relaytest van de Eindtester).
- Fase 2 opgelost: D-ET-07 (F-08-matcher en woordenboek), D-ET-05, D-ET-06, D-ET-08 (Expo-patchversies), O-ET-09 en de README voor Nick. Zie `docs/reviews/test-report-fase2-response.md`. Wacht op een nieuwe verborgen F-08-set van de Eindtester.
- ARCHITECTURE v1.0: akkoord van de Engineer (`docs/reviews/review-engineer-architecture-v1.0.md`), met de invariant §5.5 nu afgedwongen (D-33).
- `npm run test:handles` (`--detectOpenHandles --runInBand`): schoon (review bevinding 6).
- `npx tsc -p tsconfig.json` en `npx tsc -p tsconfig.test.json`: 0 fouten.
- `npx expo export --platform ios` en `--platform android`: geslaagd, nu met de echte app (iOS 3,9 MB, Android 4,2 MB Hermes-bytecode).
- `npx expo start`: Metro start zonder fouten en de iOS-dev-bundel (1769 modules) wordt geleverd. De melding `simctl` komt doordat Xcode ontbreekt (verwacht).
- `npm run check:deps`, `npx expo-doctor` (21/21) en `check-licenses` (824 pakketten): schoon.
- F-08: 99% op de goedgekeurde set van de Eindtester; de eigen set ≥ 90%.
- A-04 (begin M4): `latest` 57.0.26, `next` 58.0.5 → op SDK 57 gebleven.

## Traceerbaarheid (bestanden per eis)

Testnamen beginnen met de eis-ID (bv. `S-07b: …`), zodat de Eindtester kan traceren.

| Eisen | Testbestanden |
|---|---|
| F-01 | `test/integration/lists.test.ts`, `lists-sync.test.ts` (WS) |
| F-02..F-06, F-09, F-11 (service), F-17, UX-10 | `test/integration/items.test.ts` |
| F-07 | `undo.test.ts`, `rdel-sync.test.ts` (S-07f) |
| F-08, F-09 (core) | `src/core/categorize/categorize.test.ts` (voorlopige fixture `test/fixtures/categorize-100.json`) |
| F-10 / F-03 | `src/core/sort.test.ts` |
| F-11 | `src/core/suggest.test.ts` |
| F-12 | `src/core/parseInput.test.ts` |
| F-13, F-15 | `src/core/codec/sharecode.test.ts`, `join.test.ts` |
| F-14, F-16 | `join.test.ts` (WS), `convergence.test.ts` (5 apparaten) |
| F-17 (core) | `src/core/duplicate.test.ts` |
| F-18 | `lists-sync.test.ts`, `keys.test.ts` |
| S-01 | `offline.test.ts` |
| S-02 | `crash-local.test.ts`, `crash.test.ts`, `test/storage/mutex.test.ts` |
| S-03, S-13, UX-13 | `triggers.test.ts` |
| S-04, S-18 | `convergence.test.ts` (hub, seeds), `lists-sync.test.ts` (WS-variant), `hub-smoke.test.ts` |
| S-05, S-11 | `src/core/crdt/merge.property.test.ts`, `replay.test.ts` |
| S-06 | `src/core/crdt/merge.test.ts` |
| S-07 | `src/core/crdt/rdel.test.ts`, `rdel-sync.test.ts`, `lists-sync.test.ts` (WS) |
| S-08 | `mailbox.test.ts` |
| S-09 | `relay-faults.test.ts` |
| S-10, B-2 | `relay-dataloss.test.ts`, `versions-hub.test.ts` |
| S-12 | `latency.test.ts` |
| S-14 | `garbage.test.ts`, `src/core/codec/snapshot.test.ts` |
| S-15 | `size.test.ts`, `snapshot.test.ts` |
| S-16, B-1, I-3, D-03 | `src/core/hlc.test.ts`, `versions-hub.test.ts`, `clock-ws.test.ts` |
| S-17 | `status.test.ts` |
| S-19 | `test/contract/*.contract.test.ts`, `test/arch/imports.test.ts` |
| S-20 | `schema.test.ts`, `snapshot.test.ts` |
| S-21 | `debounce.test.ts` |
| NF-01 | `src/core/crypto/crypto.test.ts`, `security.test.ts`, `device.test.ts` (nonces over herstarts) |
| NF-02, NF-03, NF-05, NF-06 | `security.test.ts`, `crypto.test.ts` |
| NF-04 | `keys.test.ts` |
| NF-07 | `test/arch/licenses.test.ts` |
| NF-08 | `test/arch/deps.test.ts` + `expo export` + `check:deps` |
| NF-09 | beide `tsc`-runs + jest |
| NF-10 | `perf.test.ts`, `offline.test.ts` |
| NF-11 | `battery.test.ts`, `triggers.test.ts` |
| NF-12 | `test/relay/relay.test.ts`, `test/sim/device.test.ts`, `imports.test.ts` |
| NF-13 | `test/storage/migrations.test.ts` |
| UX-01 | `test/arch/strings.test.ts` |
| UX-05 | `optimistic.test.ts` |

## Gevonden en opgeloste fouten tijdens het bouwen

1. NF-04: zonder transport werd het Nostr-geheim als "publieke sleutel" in SQLite gezet (D-05).
2. Na een sprong terug van de wandklok stond de volgende flush uren in de toekomst (D-04).
3. Restgeval I-3 (RTT > venster): terugrollen bleef uit, lijst ±45 min stil → keten-terugrol (D-03, D-03b).
4. Race bij verlaten: herpublicatie na het verlaten (D-15).

## Open punten

- **Rooktest met Nick** op twee telefoons in Expo Go (H-01, H-02, `selftest.ok` in de log). Hier worden ook de Hermes-prestaties gemeten (NF-10, review bevinding 11).
- **Reviews:** M4 (UI) door Architect en Projectleider; nieuwe afwijkingen D-20..D-29.
- **Eindtester:**
  - de README volgen op een schone checkout;
  - de verborgen tweede F-08-set na M4;
  - de [handmatig]-scenario's UX-03/04/06/07/08/09.
- **Could-eisen** die niet gebouwd zijn: UX-12, UX-14, F-20, F-21 (D-29).
