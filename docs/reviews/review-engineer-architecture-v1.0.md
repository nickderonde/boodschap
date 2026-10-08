# Review Engineer — `docs/ARCHITECTURE.md` v1.0 (eindakkoord)

- **Reviewer:** Engineer
- **Datum:** 2026-10-06
- **Getoetst tegen:** de opgeleverde code (`src/`, `app/`, `test/`), `package.json`, `docs/DEVIATIONS.md` D-01..D-32
- **Status: AKKOORD** (met twee kleine redactionele correcties, zie hieronder)

## Controle

| Onderdeel | Oordeel |
|---|---|
| §3 Mappenstructuur | Klopt met de code: `app/`, `src/{core,storage,sync,service,ui}`, `test/{support,relay,sim,contract,storage,arch,integration,acceptance,fixtures}` en `scripts/`. |
| §4.1 Pakketlijst | Klopt, op één punt na: **`expo-keep-awake` staat niet in `package.json`** (UX-14 is een Could en niet gebouwd, D-29). Graag uit de tabel halen, of markeren als "niet geïnstalleerd". Let op: na D-ET-08 (`npx expo install --fix`) kunnen patchversies van Expo-pakketten verschuiven; de tabel noemt ranges (`~57.0.x`) en blijft daarmee geldig. |
| §10 Interfaces | Klopt met `Transport.ts`, `SyncHost.ts`, `SyncEngine.ts`, `BootschapApp.ts`, `service/types.ts` en `config.ts` (alle 21 configuratiewaarden). Klein: in de code is `ListState` `{ readonly regs; readonly items: ReadonlyMap }`; §10 toont `Map`. Zie ook de invariant hieronder. |
| §18 Afwijkingen | Alle afwijkingen D-01..D-32 staan erin, met de juiste sectie. De normatieve fixes uit beide code-reviews kloppen met de code (terugrollen trekt in, dedup na verify en AEAD, `kick` tijdens `connecting`, `COMMIT` in de `try`, timerboekhouding, batch-SELECT, D-ET-01, deelcode, UI-fixes). |

## Invariant §5.5: "een `ItemState` wordt nooit in-place gewijzigd"

**De invariant klopt overal in de code.**
- **Zoektocht:** ik vond geen schrijfacties op bestaande `ItemState`s of `regs`. Er wordt alleen geschreven bij het opbouwen van nieuwe objecten:
  - `createItemDelta` en `editItemDelta`;
  - de kopie in `mergeRegs`;
  - `regsIn` in de codec.
- **Afgedwongen tijdens het compileren (nieuw):**
  - `Regs` is nu `Readonly<Record<string, Register>>`;
  - voor het opbouwen van nieuwe objecten is er het type `MutableRegs`;
  - `tsc` vond precies die zes bouwplaatsen, die ik heb aangepast; er waren geen echte wijzigingen ter plekke;
  - `ItemState` had al `readonly`-velden.
- **Afgedwongen tijdens het draaien (nieuwe test):** `test/integration/immutability.test.ts` legt de inhoud van elk oud object vast en controleert na alle verdere operaties dat die oude objecten exact gelijk zijn gebleven.
  - In core: merge, materialize, opsplitsen, codec en ops, met 300 seeds.
  - Via de facade en de sync: lokale commando's, remote merges, undo, wissen, hernoemen en herstart.
  - **Negatief bewezen:** met een opzettelijke wijziging ter plekke in `mergeRegs`, of van `del` in `mergeItem`, falen beide tests.
  - Ik heb bewust niet met `Object.freeze` getest: de getranspileerde bron draait niet in strict mode, dus een schrijfactie op een bevroren object wordt stil genegeerd en zou niets bewijzen.

Voorstel voor §5.5/§10 (redactioneel): vermeld `Regs = Readonly<…>` en `MutableRegs`, en verwijs naar `immutability.test.ts`.

## Conclusie

ARCHITECTURE v1.0 beschrijft de opgeleverde code correct. Akkoord, met de twee redactionele punten: `expo-keep-awake` in §4.1, en `ReadonlyMap`/`Regs` in §10.
