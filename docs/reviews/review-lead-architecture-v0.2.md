# Eindreview Projectleider: ARCHITECTURE v0.2

Datum: 2026-10-06. Reviewer: Projectleider. Basis: REQUIREMENTS v0.3.1.

## Status: AKKOORD

Er zijn geen openstaande bevindingen die goedkeuring blokkeren. Eén kleine aanpassing volgt uit besluit (a).

## Verwerking van mijn bevindingen

- **L-1 (UX-07): goed verwerkt.**
  - §12.1 beschrijft per destructieve actie de vorm, de tekst en de knoppen.
  - Een gedeelde lijst toont "alle telefoons" en biedt "Lijst verlaten" als alternatief, zoals sectie 3 van REQUIREMENTS vraagt.
  - Het [auto]-bewijs staat in `confirm.test.ts` en in de matrix (§13.6). Het [handmatig]-scenario komt in het testplan van de Eindtester.
  - Gereed vóór M4.
- **L-2 (F-14): goed verwerkt.** §7 stelt de drie voorwaarden (complete snapshot van één afzender, alle open relays EOSE, 10 s). Er is een test met een lege snelle en een gevulde trage relay. Een lege uitkomst krijgt een duidelijke tekst.
- **L-3 (S-16, klok te vroeg): goed verwerkt.** `clock.test.ts` heeft het geval −1 u met `pastToleranceSec`.
- **L-4: genoteerd, geen actie nodig.**
- De besluiten 1 t/m 3 uit mijn vorige review staan correct in §7, §8.1 en §14. De README-melding over de link in Expo Go zit in M5.

## Besluiten

**(a) Alleen time-outs ≥ 30 s geven ook `fout`: ja.**
- Reden vanuit de gebruiker: bij wachtende wijzigingen en relays die stil blijven zou de status anders eindeloos "Synchroniseren…" tonen, terwijl er niets aankomt. Dat is misleidend en haalt het doel van de indicator onderuit.
- Voorwaarden: alleen bij `pendingCount > 0` en bij ≥ 1 open relay; zonder open relay blijft het `offline`. De status herstelt zodra een relay een publicatie bevestigt.
- Gevolg voor de Architect: zet `timeoutsCountAsFailure` standaard op `true` in §6.9 en voeg een `status.test.ts`-geval toe (alleen time-outs, 30 s → `fout`; daarna een ack → `gesynchroniseerd`). Voeg ook toe dat de UI-tekst bij `fout` rustig blijft en vermeldt dat de app het blijft proberen.
- S-17 in REQUIREMENTS is hierop aangepast.

**(b) A-04: aangepast.** De controle zit aan het begin van M4 (en bij elke mijlpaal), en we blijven op SDK 57 zolang die in Expo Go werkt. REQUIREMENTS is nu v0.3.1.

## Overige opmerkingen

- Elke Must-eis heeft nog steeds een component en testbestand. De splitsing van M3 in M3a en M3b vind ik een goede keuze, mits elk deel een eigen review krijgt.
- De Eindtester gebruikt §13.6 als basis voor de traceerbaarheidsmatrix.
