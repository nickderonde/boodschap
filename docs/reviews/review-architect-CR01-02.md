# Codereview Architect — CR-01/CR-02 (UX-15/UX-16, swipe-to-delete)

- **Reviewer:** Architect
- **Datum:** 2026-10-07
- **Basis:** `git diff 2020b20` plus de nieuwe bestanden:
  - `src/ui/components/SwipeRow.tsx`;
  - `src/ui/swipe.test.tsx`;
  - `test/setup-ui.ts`;
  - wijzigingen in `ItemRow.tsx`, `app/index.tsx`, `app/lijst/[id].tsx`, `app/_layout.tsx`, `jest.config.js` en `strings.nl.ts`;
  - D-37.
- **Getoetst tegen:** REQUIREMENTS v0.5 (UX-15, UX-16) en ARCHITECTURE v1.0.1 (§9.3, §12, §12.1, K-2).
- **Eigen controle:** het ui-project draait 10 suites, 83 tests groen (waaronder `swipe.test.tsx`).

## Status: AKKOORD MET OPMERKINGEN

De opzet is goed. De UI loopt alleen via de facade, een lijst wordt nooit zonder bevestiging verwijderd, en K-2 blijft intact. De versies passen bij Expo Go SDK 57. Er is **één belangrijke bevinding** (S-1): een volledige swipe wordt op een echt toestel vrijwel nooit herkend, en de test maskeert dat. **S-1 moet opgelost zijn vóór de volgende rooktest met Nick.**

## Controlepunten

| Punt | Oordeel |
|---|---|
| UI alleen via de facade | **Ja.** Items: `ui.actions.deleteItem` (dezelfde weg als voorheen, `Pending` met snackbar, F-07). Lijsten: `ui.actions.deleteList` en daarmee `confirmDestructive` (UX-07). `SwipeRow` en `ItemRow` hebben geen eigen logica. |
| Lijst nooit zonder bevestiging | **Ja.** Een tik op de actie, een volledige swipe en de accessibility action "Verwijderen" gaan alle drie via `ui.actions.deleteList`, dat altijd eerst `confirmDestructive` toont. Annuleren klapt de rij dicht (`.finally(row.close)`). Gedeeld: "alle telefoons" en "Lijst verlaten" (`leave`). Getest in `swipe.test.tsx:249-313`. |
| K-2 / render-prestaties | **Intact.** `onDelete` staat in `useCallback`, `ItemRow` blijft `memo`, en de context van `SwipeGroup` is stabiel (`useMemo`). Openen of sluiten wijzigt alleen de state van die ene rij. De rendertest (1000 items, één afvinkactie → 1 rij-render) slaagt met swipe-rijen. Kanttekening: zie K-1 over de mount-kosten. |
| Gesture-conflicten met scrollen en afvinken | In opzet goed. `ReanimatedSwipeable` activeert pas bij horizontale beweging, `onScrollBeginDrag` sluit de open rij, en een tik op de rij voert `closeAll()` en daarna `onToggle` uit. Of een tik op een **open** rij door de Tap-gesture van ReanimatedSwipeable ook bij de `Pressable` aankomt, is in Jest niet te bewijzen → [handmatig] (K-2). |
| Expo Go en Reanimated 4 | Geen blokkades. reanimated 4.5.1, worklets 0.10.1 en gesture-handler ~2.32.0 staan in de SDK 57-bundel van Expo Go. `babel-preset-expo` voegt `react-native-worklets/plugin` automatisch toe (gecontroleerd in `configs/expo.js`). `GestureHandlerRootView` staat bovenaan. Expo Go SDK 57 draait op de New Architecture, zoals Reanimated 4 vereist. Zie wel S-1. |
| Maskeren de testmocks echte fouten? | Grotendeels niet: de officiële mocks (`react-native-gesture-handler/jestSetup.js`, de mocks van reanimated en worklets) plus één exact gefilterde waarschuwing. **Uitzondering:** de test van de volledige swipe (`swipe.test.tsx:86-93`) geeft een gewoon object `{ value: -400 }` en een rijbreedte van 0. Daardoor slaagt hij, terwijl het gedrag op een toestel anders is (S-1). |

## Bevindingen

### Belangrijk

**S-1. Een volledige swipe wordt op een echt toestel vrijwel nooit herkend.**
`src/ui/components/SwipeRow.tsx:19-21`, `:121-122`, `:147` en `:153-159`

1. **Wrijving.** `translation` is `appliedTranslation` van ReanimatedSwipeable. Die is `userDrag / friction` en loopt voorbij de actie 1-op-1 door (`overshootFriction` 1; zie `ReanimatedSwipeable.tsx:118-133`). Met `friction={1.5}` en de drempel `max(200, 0,6 × rijbreedte)` moet de vinger op een iPhone 16 (rij ±393 pt → drempel 236 pt) **±354 pt** slepen, bijna de hele schermbreedte. In de praktijk wordt dat zelden gehaald, terwijl UX-15/UX-16 de volledige swipe als Must noemen.
2. **Timing.** `onSwipeableWillOpen` wordt via `runOnJS` aangeroepen **nadat** `appliedTranslation.value = withSpring(toValue)` al is gestart (`ReanimatedSwipeable.tsx:240-262`). Een uitlezing van `translation.current.value` op de JS-thread ziet dus een waarde die al naar −96 terugveert. Bij een snelle swipe wordt de volledige swipe dan niet herkend.
3. **Test.** `swipeFull` geeft een gewoon object `{ value: -400 }` en een rijbreedte van 0 (geen layout in Jest), zodat beide problemen onzichtbaar blijven.

**Fix (één van beide):**
- (a) houd in een worklet de maximale sleepafstand bij (`useAnimatedReaction` op de translatie, of `onSwipeableOpenStartDrag` met een eigen gedeelde waarde `maxDrag`) en vergelijk bij het loslaten op de **sleepafstand van de vinger**;
- (b) zet `friction={1}` en lees de afstand vóór het terugveren uit (via `useAnimatedReaction` die `runOnJS` aanroept zodra de drempel wordt overschreden).

Kies een drempel die op een telefoon haalbaar is, bijvoorbeeld 50–55% van de rijbreedte aan vingerafstand.

**Test:**
- een pure test van de drempelfunctie met de echte wrijving en een realistische breedte (393 pt): 60% vingerafstand is volledig, 40% niet;
- een test waarin de translatie op het moment van `willOpen` al is teruggeveerd: de volledige swipe moet toch worden herkend.

Het gevoel blijft [handmatig] (H-08 voor Nick).

### Klein

**K-1. Mount-kosten bij 1000 items.** Elke zichtbare rij heeft nu een `GestureDetector` met gedeelde waarden en een geanimeerde stijl. Bij snel scrollen door 1000 items worden in het venster (`windowSize 11`) rijen voortdurend aan- en afgekoppeld. Meet het scrollen met 1000 items op de iPhone (NF-10). Is het traag, overweeg dan `removeClippedSubviews`, een kleiner `windowSize`, of de swipeable pas aankoppelen bij de eerste aanraking.

**K-2. Tik op een open rij.** Neem in het handmatige scenario op dat een tik op de inhoud van een **open** itemrij zowel de rij sluit als het item afvinkt (UX-15: "afvinken met een tik blijven werken, ook wanneer een rij open staat"). Werkt dat op het toestel niet, dan volstaat sluiten bij de eerste tik, mits de Projectleider dat accepteert.

**K-3. Lijstenoverzicht.** `renderItem` en `swipeDelete(id)` worden per render opnieuw gemaakt (`app/index.tsx`). Bij ≤ 20 lijsten is dat geen probleem; vermeld het alleen als bewuste keuze.

## Afwijking D-37
**Goedgekeurd**, op voorwaarde dat S-1 wordt opgelost. Keuze (1), de drempel voor een volledige swipe, verandert daarbij. De keuzes (2) accessibility action op het focusbare element, (3) `SwipeGroup` met een stabiele context en (4) `GestureHandlerRootView` zijn goed. Ook de testomgeving is goed: officiële mocks en één exact gefilterde waarschuwing. Verwerkt in ARCHITECTURE v1.0.2 (§4.1, §12, §18).
