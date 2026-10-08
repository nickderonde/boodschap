# Review Projectleider: REQUIREMENTS v0.2 en ARCHITECTURE v0.1

Datum: 2026-10-06. Reviewer: Projectleider.

## Status: AKKOORD MET OPMERKINGEN

REQUIREMENTS is op v0.3 (baseline) gezet. ARCHITECTURE v0.1 is goedgekeurd onder de voorwaarde dat bevinding 1 (UX-07) vóór M4 is verwerkt. Bevindingen 2 en 3 zijn aanbevelingen.

## Besluiten

1. **F-13/H-01/F-14: akkoord.** In v1 koppelen we via scannen in de app of de code plakken. De `bootschap://`-link blijft in de deeltekst voor later, maar wordt pas na een EAS-build getest (B-04). Voorwaarden:
   - de README zegt expliciet dat een link in Expo Go de app niet opent;
   - H-01 wordt uitgevoerd met scannen en plakken, zoals nu beschreven.
   Dit is geen Must-verlaging, want de kern ("koppelen via QR of deellink") blijft werken via QR en tekstcode.
2. **F-08: akkoord.** "Huisdieren" is de 16e categorie. Mijn v0.1-opsomming telde 15 (mijn fout). De categorieën in ARCHITECTURE §8.1 moeten identiek zijn aan de lijst in F-08.
3. **S-15/S-16: akkoord.**
   - Harde grens 65.536 B met doel ≤ 48 KiB, opsplitsen in ≤ 16 delen en verdubbelen bij een weigering.
   - Klokcorrectie bij "created_at too late/early" met rotatie van de identiteit als terugval.
   - Causale HLC per item.
   - De metingen op echte relays zijn overtuigend. De extra criteria zijn scherper dan v0.1, niet losser.

## Bevindingen

1. **UX-07 (Must) heeft geen component en geen test in ARCHITECTURE.** §12 noemt de bevestiging bij destructieve acties niet, en er is geen verwijzing in §13.6. De eis is [handmatig], maar de Architect moet de dialogen benoemen:
   - lijst verwijderen, met de tekst voor gedeelde lijsten uit sectie 3 van REQUIREMENTS;
   - afgevinkte items wissen (bevestiging of undo);
   - stoppen met delen.
   Voeg het toe aan §12 en neem het op in het testplan van de Eindtester. Vereist vóór M4.
2. **F-14 ("geen halve lijst"):** een snelle EOSE van een relay zonder data kan een lege "Gedeelde lijst" tonen terwijl een andere relay nog levert. Aanbeveling: houd de status "Ophalen…" tot een EOSE met ≥ 1 geldig event, of tot alle relays EOSE gaven, of tot 10 s. De test `join.test.ts` moet dit geval (één lege relay, één gevulde) bevatten.
3. **S-16:** de test noemt alleen +1 u met een toekomst-weigerende relay. §6.8 heeft ook een pad voor "te vroeg" (klok −1 u). Voeg daar een test voor toe in `clock.test.ts`.
4. **Overig, geen actie:** NF-14 (README) en de [handmatig]-eisen UX-03/04/06/08/09/11/12/14 staan terecht niet in de matrix. NF-08 volgt voortaan de SDK van Expo Go (A-04, redactioneel in v0.3). Het M4-rooktestmoment door Nick is goed gekozen.

## Dekking van Must-eisen en traceerbaarheidsmatrix §13.6

- **Alle `[auto]`-eisen staan in de matrix.** Gecontroleerd: F-01..F-21, S-01..S-22, NF-01..NF-13 en UX-01, 02, 05, 10, 13. F-16 verwijst terecht naar S-18. S-22 (Could) is bewust "niet in v1".
- **Elke Must-eis heeft een component en een testbestand**, met één uitzondering: UX-07 (zie bevinding 1).
- De mijlpalen M1 t/m M5 dekken alle S-eisen in M3 en de DoD in M5.
