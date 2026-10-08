# Review Engineer — `docs/ARCHITECTURE.md` v0.3 (eindakkoord)

- **Reviewer:** Engineer
- **Datum:** 2026-10-06
- **Scope:** zoals afgesproken alleen §6.6 en §6.8, plus ter informatie §9.3, §13.3, §2 en §17.1
- **Status: AKKOORD**

## Controle van mijn bevindingen op v0.2

| Bevinding | Oordeel |
|---|---|
| **B-1** terugrolvoorwaarde | **Opgelost.** `inFlight` is gesleuteld per event-ID, en `sentTo`, `answers` en `deliveredBy` worden samengevoegd. Terugrollen mag alleen als *elke* relay uit de set in deze run `clock-ahead` gaf en niemand accepteerde of leverde. Dat is veilig, ook na een herstart: een relay die `e` ooit heeft opgeslagen, kan voor `e` geen `clock-ahead` meer geven. Er is één definitie van `clockDerived` (`v == nowAdj`), die persistent is. Terugrollen gebeurt alleen bij `clock-ahead`, en de correctie maximaal één keer per event. De herhaling convergeert. De tests voor het herstartscenario (geen terugrol) en het positieve geval staan erin. |
| **B-2** gelijktijdige flushes | **Opgelost.** Alle paden lopen via `Publisher.flush` onder een lock per lijst met samenvoegen (`again`). De CAS op `floor_version` is een vangnet. Een heruitzending van een bestaand event wijzigt geen versie. |
| **I-1** delta-merge | **Opgelost.** `merge(rij, delta)` in de transactie. Een taak schrijft nooit een complete record uit de cache. |
| **I-2** `Random` over een herstart | **Opgelost.** Dezelfde instantie blijft bestaan, en de test controleert 5 herstarts. |
| **I-3** wachten op klokantwoorden | **Opgelost** (stap 1b, max 8 s). Het restgeval bij een RTT groter dan het venster is veilig en bewust geaccepteerd. |
| **K-1..K-3** | **Opgelost.** |

## Implementatienotitie (niet blokkerend)

De lock per lijst is niet re-entrant. Stap 1b wacht *binnen* de lock op klokantwoorden en neemt daarna de terugrolbeslissing. Die beslissing gebruik ik daarom als interne functie die alleen aangeroepen wordt terwijl de lock al vastgehouden wordt. De uitkomsthandler voor `clock-*` neemt zelf geen lock, maar roept alleen `flush(listId)` aan. Komt die aanroep tijdens een lopende flush, dan zet hij `again`. Zo kan er geen deadlock ontstaan.

Dit is een uitwerking binnen het ontwerp, geen afwijking.

## Conclusie

De architectuur v0.3 is bouwbaar en het versiemechanisme sluit. Ik start met M1–M3b.
