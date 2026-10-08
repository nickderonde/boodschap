# Review Projectleider: code M1 t/m M3b en F-08-fixture

Datum: 2026-10-06. Reviewer: Projectleider. Basis: REQUIREMENTS v0.3.1, `docs/reviews/review-architect-code-M1-M3b.md`, `docs/TEST_REPORT.md` (fase 1: 292 geslaagd, 0 gefaald, 1 bewust overgeslagen; `tsc` schoon).

## Status code M1 t/m M3b: AKKOORD MET OPMERKINGEN

De mijlpalen mogen door naar M4. De voorwaarden hieronder moeten vóór de M4-review en vóór de rooktest met Nick zijn gesloten, elk met een test.

## 1. Dekking van de Must-eisen S en NF in deze mijlpalen

Beoordeeld op bewijs in twee onafhankelijke lagen: de tests van de Engineer en de acceptatietests van de Eindtester (`ET-*`).

| Eis | Dekking | Oordeel |
|---|---|---|
| S-01, S-02, S-03 | `offline.test`, `crash.test`, `crash-local.test`, `device.test`; ET-S02-1..3 (kill op 3 transactiepunten en 4 publicatiepunten), ET-S03-1/2 (≤ 10 s) | Gedekt |
| S-04, S-05, S-06, S-07 | `convergence.test` (200 seeds, oracle), `merge.property.test`, `rdel*.test`; ET-S04, ET-S06, ET-S07 (a..f, beide volgordes) | Gedekt. Voorbehoud: bevinding Architect 12 (vergelijking op de database) |
| S-08, S-09, S-11 | `mailbox`, `relay-faults`, `replay`; ET-S08, ET-S09, ET-S11 | Gedekt |
| S-10 | `relay-dataloss.test`, ET-S10-1..3 | Gedekt voor (a) tot en met (d) bij verbroken verbinding. D-ET-01 is de uitzondering (zie 3) |
| S-12 | `latency.test`; ET-S12 (p95 ≈ 1,03 s, max ≈ 1,03 s) | Gedekt. Echte relays alleen via ET-LIVE-1 (1 meting) en later H-07 |
| S-13 | `triggers.test`, resilience | Deels. Pull-to-refresh/voorgrond herstelt een relay zonder verbroken verbinding niet (D-ET-01); diepgaande test volgt in fase 2 |
| S-14, S-15, S-16 | `garbage`, `size`, `clock-ws`, `hlc`; ET-NF02, ET-S15, ET-S16 (+1 u, −1 u, +30 dagen) | Gedekt |
| S-17 | `status.test`; ET zijdelings | Gedekt. UI-mapping volgt in M4 |
| S-19 | `memory.contract`, `nostr.contract`, `imports.test` | Gedekt |
| NF-01, NF-02, NF-03, NF-05 | `crypto`, `security`, `privacy`-tests; ET-NF01, ET-NF02 (a..e), ET-NF03, ET-NF05 | Gedekt |
| NF-04 | `keys.test` | Gedekt |
| NF-06 | `security.test`, `setup-node`, `deps.test` | Gedekt. De Eindtester noteert "geen aparte test"; dat is acceptabel omdat de testsetup fetch/XHR blokkeert en alleen relay-sockets toelaat |
| NF-09, NF-12 | `tsc` schoon, 292 groen; `relay.test`, `device.test` | Gedekt |
| NF-07, NF-13 | `licenses.test`, `migrations.test` | Gedekt |
| NF-08 (`expo export`), NF-14 (README), UX, H-01..H-07 | Fase 2 | Open, terecht niet in deze mijlpalen |

Conclusie: geen Must-eis uit S of NF binnen deze mijlpalen ontbreekt in de dekking. De voorbehouden zitten in de voorwaarden hieronder.

## 2. Voorwaarden vóór de M4-review

De zes belangrijke bevindingen van de Architect gelden zonder aanpassing, elk met een test. Ik geef ze de volgende eisen-koppeling mee zodat prioriteit duidelijk is:

1. **Bevinding 1 (`last_event_*` na terugrollen)** raakt S-10(b)/S-16: de invariant "nieuwste staat verliest nooit" is hier kwetsbaar.
2. **Bevinding 2 (dedup vóór `verify`)** raakt S-09 en NF-02(e): één kwaadwillende relay mag de redundantie niet breken.
3. **Bevinding 3 (socketlek bij `kick`)** raakt NF-11.
4. **Bevinding 4 (relay-hints pas na herstart)** raakt F-14 (Must): koppelen met hints moet zonder herstart werken. Hoogste prioriteit voor de rooktest met Nick.
5. **Bevinding 5 (COMMIT-fout)** raakt S-02 en UX-05.
6. **Bevinding 6 (open handles)** raakt NF-12 en de stabiliteit van de testsuite.

Aanvullend van mij:
- **D-ET-01 oplossen in M4 (vóór de M4-review)**, niet pas in M5. Reden: S-13 (Must) zegt dat pull-to-refresh en terugkeer naar de voorgrond sync forceren, en UX-13 bouwt daarop. Het defect zelf blijft minor: er is geen dataverlies zolang ≥ 1 relay de data heeft. Aanpak aan de Engineer en Architect, bijvoorbeeld een nieuwe REQ (en dus nieuwe EOSE en eigen-staatcontrole) bij `syncNow` en `foreground`. De test `ET-S10-4` verliest daarna `test.failing`.
- **Bevinding 8 (`ws://` in hints en `setRelays`)**: uit te voeren vóór de oplevering (uiterlijk M5), met een test. Alleen `wss://` in productie.
- **Bevinding 12 (S-04 op de database vergelijken)**: uiterlijk M5, zodat S-04 ook bewijst dat de staat duurzaam is.
- Bevindingen 7, 9, 10, 11, 13, 14 en 15: op de manier die de Architect aangaf (M4 of M5). Bevinding 11 en 15 worden in de rooktest met Nick gemeten (NF-10, S-02 op iOS).
- De afwijkingen D-01..D-19 worden in M5 in ARCHITECTURE overgenomen; D-12 sluit hieronder.

Per rij in APPROVALS: M1 akkoord; M2 onder voorwaarde bevinding 5; M3a onder voorwaarde bevinding 1 en 7; M3b onder voorwaarde bevindingen 2, 3, 4, 6, plus D-ET-01.

## 3. Besluit over D-ET-01

Ernst minor (zoals de Eindtester stelt), maar vereist in M4 vanwege S-13. Geen eiswijziging nodig.

## 4. F-08-fixture van de Eindtester

**Besluit: GOEDGEKEURD als representatief. D-12 mag dicht.**

Redenen:
- `test/fixtures/categorize-f08-eindtester.json` heeft 100 items, alle 16 categorieën (5 tot 11 per categorie, plus 3 "overig"), gemaakt zonder de woordenlijst van de Engineer te raadplegen.
- De set bevat de varianten die F-08 noemt: meervoud, hoofdletters, accenten, samenstellingen, merknamen en onbekende producten.
- De score is 91 % (eis ≥ 90 %), en de 9 missers zijn echte, gangbare producten (bijvoorbeeld chocolade, noodles, Leerdammer). Dat past bij een eerlijke onafhankelijke meting.

Opdrachten:
- De Engineer laat zijn F-08-test naar deze fixture wijzen. De eigen fixture mag blijven als regressieset.
- De Engineer vult de woordenlijst aan met de 9 missers en bredere gangbare producten (chocolade, noodles, ijs-varianten, kaas- en snoepmerken, huisdiermerken), omdat de marge van 1 punt te klein is.
- Ook al is deze fixture goedgekeurd, hij is nu bekend bij de Engineer. Voor de eindacceptatie wil ik daarom een **tweede, verborgen set van 100 producten**. De Eindtester stelt die op, houdt hem uit de repo en deelt hem pas bij de eindacceptatie. Eis: ≥ 90 %. Zit de score eronder, dan wordt dat een major-defect (F-08 is Must).
