# Reactie Engineer op de codereview M4/M5 (Architect)

- **Datum:** 2026-10-06
- **Review:** `docs/reviews/review-architect-code-M4-M5.md` (akkoord met opmerkingen)

Elke test hieronder heb ik **negatief gecontroleerd**: met de fix tijdelijk teruggedraaid faalt hij, met de fix slaagt hij. `test/acceptance/` heb ik niet aangeraakt.

## Belangrijk

| # | Wat gedaan | Test |
|---|---|---|
| N1 | `SyncEngine` houdt een generatie bij (`lifeGen`). `resume()` verhoogt die en zet `urgent`/`paused` terug. `pause()` noteert zijn generatie bij de start en sluit na de `await`s alleen als die nog geldig is. Een `foreground()` tijdens een lopende `background()` wint dus altijd. | `test/integration/review-fixes-m4.test.ts` › N1: `background()` met acks onderweg (relaylatentie 1 s), na 100 ms `foreground()`. Verwacht: transport open, status niet `offline`, en een nieuwe wijziging komt bij B aan. |
| N2 | Single-flight in de facade (`serialLifecycle`): `ensureTransport`, `ensureEngine` en `rebuildTransport` lopen in één wachtrij; binnen een sectie de `*Unlocked`-varianten (geen re-entrancy). Er bestaat altijd hooguit één transport en één engine. | › N2: `Promise.all([join(code met hint), setRelays(…), share(lijst 2), share(lijst 1)])` → precies één niet-gesloten transport, en dat is `transportInstance`; er is één engine. |
| N3 | Nieuwe hook `src/ui/hooks/useShareInfo.ts`: eenmaal `share()`, daarna `shareInfo()` alleen bij een andere statussleutel (kind:pending:relaysOpen) zolang niet `ready`. `setInfo` alleen als `ready` verandert. Geen effect op het info-object. `delen.tsx` gebruikt de hook. | `src/ui/review-m4.test.tsx` › N3: met `ready=false` ≤ 3 aanroepen in 1 s (zonder fix: honderden); bij een statuswijziging wordt "klaar" wel opgepikt. |

## Klein

| # | Wat gedaan | Test |
|---|---|---|
| K-1 | `src/ui/clipboard.ts`: `clearShareCodeFromClipboard`. Het koppelscherm wist na een geslaagde `join` het klembord als het een deelcode bevat (tekstcode, link of deeltekst); ander klembord blijft staan. De README (§6) legt de klembordgeschiedenis en het universele klembord uit. | › K-1 (herkennen, wissen, niets anders wissen; het koppelscherm roept de functie aan); `test/arch/readme.test.ts` › K-1 |
| K-2 | `materialize`: één `ItemView` per onveranderlijke `ItemState` via een `WeakMap`. `mergeList` hergebruikt ongewijzigde items, dus ongewijzigde rijen houden hun referentie. Het lijstscherm gebruikt `useMemo` voor de secties en `useCallback` voor `renderItem`/`onToggle`/`onEdit`. Daardoor slaat `memo(ItemRow)` ongewijzigde rijen echt over. `ListView` was al per lijst gecachet in `StateCache`. | `review-fixes-m4.test.ts` › K-2 (referenties: alleen het afgevinkte item is een nieuw object); `review-m4.test.tsx` › K-2 **rendertelling**: 1000 rijen, één item afvinken → precies **1** extra rij-render (zonder fix: 1000). |
| K-3 | `AppProvider` sluit de app af in de cleanup, en ook als de component tijdens `init()` al is opgeruimd. Afhankelijkheden zijn injecteerbaar (`deps`) voor tests. | › K-3: unmount → `shutdown()` precies 1× |
| K-4 | `src/ui/scanGate.ts`: één scan tegelijk; na een fout 2 s pauze; na succes direct vrij. | › K-4 |
| K-5 | `theme.monoFontFor(os)` / `monoFont`: iOS `Courier`, Android `monospace`. | › K-5 (functie + het deelscherm gebruikt geen vaste "Courier") |
| K-6 | `relayAllowed` is aan begin en einde verankerd: `^wss:\/\/[^\s/]+(\/\S*)?$` (en idem voor `ws://` in tests). | `review-fixes-m4.test.ts` › K-6 (`wss://host iets` en een pad met een spatie geweigerd) |
| K-7 | De startfout toont "Opnieuw proberen"; `AppProvider` geeft `retry` aan de fallback en voert het starteffect opnieuw uit. | › K-7 (eerste start faalt, retry → app geladen) |
| K-8 | De README (§1) verwijst bij een SDK-upgrade ook naar de testketen (Jest 30, `jest-expo`, `@react-native/jest-preset`, `@types/jest`, RTL volgens de peers, §4.3). | `readme.test.ts` › K-8 |

Nieuwe afwijkingen: D-30 (single-flight engine/transport) en D-31 (pause-generatie), zie `docs/DEVIATIONS.md`.

## Eindrun
Zie het antwoord aan de coördinator en `docs/PROGRESS.md`: de volledige suite, `test:handles`, beide `tsc`-runs en `expo export` voor iOS en Android.
