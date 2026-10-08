# Review Engineer — `docs/ARCHITECTURE.md` v0.2 (eindakkoord)

- **Reviewer:** Engineer
- **Datum:** 2026-10-06
- **Basis:** mijn review van v0.1 (`review-engineer-architecture.md`, E-1..E-21) en §17 van v0.2
- **Status: NIET AKKOORD**

Ik geef nog geen akkoord. Er zijn twee blokkerende punten, allebei in het nieuwe versiemechanisme. Ze vragen elk een korte, precieze aanpassing van de tekst. Zijn B-1 en B-2 verwerkt, dan geef ik mijn akkoord **zonder nieuwe volledige ronde**: ik controleer dan alleen §6.6 en §6.8. De belangrijke punten I-1 tot en met I-3 mogen in dezelfde wijziging mee, of uiterlijk vóór M3a.

Al het andere is goed verwerkt en bouwbaar.

## 1. Controle in de proefapp (in een tijdelijke map buiten de repository)

Ik heb de pakketlijst uit §4.1 en de twee tsconfigs uit §4.2 overgenomen. Resultaat:

| Controle | Uitkomst |
|---|---|
| `npm install` | Geen ERESOLVE |
| `npm ls --all` | Exit 0 |
| `npx expo install --check` | "Dependencies are up to date" |
| `tsc -p tsconfig.json` (`types: []`, zonder tests) | Groen |
| `tsc -p tsconfig.test.json` (`types: ["jest","node"]`) | Groen |
| `npx jest` (projecten node + ui) | Groen |
| `expo export` ios en android, met reanimated, worklets en gesture-handler gepind | Slagen |

**Conclusie: §4 is bouwbaar zoals beschreven.**

## 2. Verwerking van E-1..E-21

| Bevinding | Oordeel |
|---|---|
| E-1 pakketlijst | Goed verwerkt. Geverifieerd, zie §1 hierboven. |
| E-2 TS 6 en twee tsconfigs | Goed verwerkt. Geverifieerd. |
| E-3 versie per slot, vloer en terugrollen | Eigenaarschap, persistentie, de persistente `offsetSec` en de ordening van de hub zijn goed. Het mechanisme sluit nog niet: zie **B-1**, **B-2** en **I-3**. |
| E-4 `repo.read` onder de mutex | Goed verwerkt. Met de driver-spion in `mutex.test` is het ook afdwingbaar. |
| E-5 eigenaarschap van verzenden | Goed verwerkt. De transport heeft geen wachtrij en `not-connected` leidt naar de eigen-staatcontrole. |
| E-6 facade met `{result, committed}` | De opzet klopt: synchroon in de cache, FIFO-`WriteQueue`, bevestigd na `COMMIT`, en terugdraaien door opnieuw te laden. Wat de transactie precies schrijft, is nog onduidelijk: zie **I-1**. |
| E-7 KillSwitch | De opzet klopt. Er ontbreekt nog iets voor `Random` bij een herstart (**I-2**) en voor de afhandeling van fouten in zombies (**K-1**). |
| E-8 SDK 58 | Akkoord met het besluit om op SDK 57 te blijven. Er is een check bij elke mijlpaal, een vaste check aan het begin van M4, en een upgradepad met Jest 30. |
| E-9 M3a/M3b | Goed verwerkt. |
| E-10 polyfill en selftest | Goed verwerkt. Zie ook **K-2**. |
| E-11 `Random` en `identityFromSecret` | Goed verwerkt. |
| E-12 `inFlight` | Goed verwerkt. Voor terugrollen moet het wel per event-ID worden samengevoegd (**B-1**). |
| E-13 maximaal 5 retries; time-outs als `fout` | Goed verwerkt. De vlag `timeoutsCountAsFailure` is een goede oplossing. |
| E-14 verwijderen op basis van de staat | Goed verwerkt. Eerst de sleutels en dan de database is de juiste volgorde, omdat SecureStore geen sleutels kan opsommen. |
| E-15 geen lege publicaties | Goed verwerkt. |
| E-16 codec | Goed verwerkt. |
| E-17 Transport-details | Goed verwerkt: generaties, altijd 16 slots, de AAD in de engine en één globale relayset. |
| E-18 DTO's | Goed verwerkt. De randvoorwaarden voor `JoinResult` en `SyncStatus` zijn duidelijk. |
| E-19 SPDX | Goed verwerkt. |
| E-20 eerste verbindingspoging telt als `bezig` | Goed verwerkt. |
| E-21 tijdsbeheer en looptijd | Goed verwerkt. |

## 3. Bevindingen

### Blokkerend

**B-1. De voorwaarde voor terugrollen kan de vloer-invariant breken** — §6.8 stap 2, §6.6 stap 5 (`inFlight`)

De voorwaarde is nu: "alle ontvangers van `e` weigerden met `clock-*`". Daarbij gelden `ontvangers = inFlight[e].sentTo` en "de eigen-staatcontrole maakt een **nieuwe** `inFlight`-regel met `sentTo = {R}`". Dat gaat mis in een scenario dat precies in de S-16-test zit (twee relays met 300 s en 900 s tolerantie, klok +10 min, herstarts):

1. `e` wordt verstuurd. A (tolerantie 900 s) accepteert hem en B (300 s) weigert hem. Volgens stap 3 blijft de vloer staan. Dat is correct.
2. De app wordt herstart. `inFlight` is leeg. Na EOSE levert A `e`, dus naar A gaat niets. B mist `e` en krijgt hem opnieuw, met een regel `sentTo = {B}`.
3. B weigert opnieuw met `clock-ahead`. Nu hebben "alle ontvangers" geweigerd, `version == floor_version` en `clockDerived` is waar. Gevolg: **terugrollen, terwijl `e` op A staat**.
4. Het nieuwe event `e2` heeft een lagere versie. A houdt `e` vast, want die heeft een hogere `created_at`, en vervangt hem pas bij een flush met een versie boven `e.version`. Gebeurt er geen nieuwe bewerking, dan duurt dat onbeperkt. De eigen-staatcontrole stuurt bij elke EOSE `e2` opnieuw naar A, zonder effect.

Hetzelfde gebeurt zonder herstart als de eigen-staatcontrole `e` naar een relay stuurt die net opnieuw verbonden is. De nieuwe regel verdringt dan de regel van de flush, of wordt niet samengevoegd. In beide gevallen klopt de invariant uit §6.6 niet meer, en daarmee ook §5.8 punt 4.

*Voorstel (vervang de voorwaarde van stap 2 door):*
- `inFlight` is gesleuteld op event-ID. Elke verzending van hetzelfde event **voegt toe** aan `sentTo` en `answers`.
- Terugrollen mag alleen als **elke relay uit de relayset** in deze run voor `e` het antwoord `clock-ahead` gaf, geen enkele relay `e` heeft geaccepteerd en geen enkele relay `e` bij een EOSE heeft geleverd (eigen-event-observaties).
- Een relay die niet open is, of nog niet geantwoord heeft, betekent: **niet** terugrollen, maar stap 3 of rotatie volgen.
- Dit is veilig, ook na een herstart. Een relay die `e` ooit heeft opgeslagen, geeft voor `e` nooit `clock-ahead`, want `e.version ≤ t_accept + tol ≤ t_nu + tol`. Hij antwoordt `duplicate` of levert `e`.
- Terugrollen alleen bij `clock-ahead`. Bij `clock-behind` helpt een lagere versie niet.
- `clockDerived` wordt afgeleid uit persistente velden (`last_version > floor_before + 1`, of `last_version == nowAdj_bij_prepare`). Dan werkt het ook voor verzendingen van de eigen-staatcontrole na een herstart. Kies één definitie: de formule en de tekst "ofwel gelijk aan de klokwaarde" in §6.6 stap 3 spreken elkaar tegen als `nowAdj == floor+1`.
- Test toevoegen: het scenario hierboven, met de controle dat na de herstart **geen** terugrol plaatsvindt en dat A uiteindelijk het nieuwste event heeft.

**B-2. Gelijktijdige flushes van dezelfde lijst geven gelijke versies, waardoor de oudere staat kan winnen** — §6.6 (Trigger, Flush stap 1–4), S-10b

De regel "tussen twee flushes ≥ 1000 ms" geldt alleen voor het venster. Verschillende paden flushen **direct**:
- "delen";
- `background`;
- `syncNow`/`kick`;
- `too-large` ("direct een flush van alle delen");
- het opnieuw flushen na terugrollen;
- rotatie.

Stap 3 (`prepare`, met Schnorr) is async. Twee flushes kunnen dus allebei in stap 1 dezelfde `floor_version` lezen en allebei `v = floor+1` kiezen voor hetzelfde slot, met een verschillende inhoud. De relay houdt bij gelijke `created_at` het **laagste ID**, en dat kan de oudere staat zijn. De eigen-staatcontrole stuurt `last_event_raw` opnieuw, maar die heeft dezelfde versie en verliest weer. Het slot blijft dan op elke relay oud tot de volgende bewerking. Dat schendt S-10b ("de nieuwste staat verliest nooit van de oudere") en de invariant van §6.6.

*Voorstel:*
- **Single-flight per lijst.** Een flush (stap 1–5) voor een lijst loopt altijd onder een async-lock per lijst in de `Publisher`. Alle paden (venster, direct, terugrollen, `too-large`, rotatie, achtergrond) gaan via dezelfde functie `flush(listId)`. Een aanvraag tijdens een lopende flush zet één vlag "nogmaals daarna" (samenvoegen).
- **CAS in stap 4.** De transactie controleert dat `floor_version` voor elk slot nog de waarde uit stap 1 heeft. Zo niet, dan breekt de flush af en begint opnieuw. Dat is een vangnet, want met de lock gebeurt het niet.
- Test: twee flushes forceren in dezelfde seconde (`too-large` tijdens een venster-flush, plus een `faults`-hook die `prepare` laat wachten). Verwacht: strikt stijgende versies, en de relay houdt het nieuwste event.

### Belangrijk

**I-1. De `WriteQueue` moet een delta mergen, niet de cache-record overschrijven** — §9.3 stap 3

"De resulterende itemrecords uit de cache schrijven" is dubbelzinnig, en beide lezingen gaan mis:
- **Momentopname bij het toepassen:** een remote merge die eerder in de FIFO stond en al gecommit is, wordt overschreven. Hij is dan weg uit de database en staat alleen nog in de cache.
- **De cache bij het uitvoeren:** later toegepaste, nog niet gecommitte operaties komen mee in deze commit. Faalt hun eigen taak daarna, dan staat hun effect toch in de database, terwijl hun `committed` wordt afgewezen.

*Voorstel:* een taak draagt alleen haar **delta**: de gewijzigde registers met hun stamps, of `del`/`D`. De transactie leest de rij, doet `merge(rij, delta)` en schrijft het resultaat met de afgeleide kolommen. Merge is idempotent en commutatief, dus de volgorde ten opzichte van remote merges doet er niet toe, en `cache = db ⊔ niet-gecommitte delta's` klopt dan precies. Test in `optimistic.test.ts`: lokale operatie, daarna een remote merge in de wachtrij, daarna een commit, en dan bevat de database allebei.

**I-2. `SeededRandom` moet een herstart overleven** — §13.3 (`restart()`), §5.1

Na een herstart maakt `restart()` een nieuwe `BootschapApp`. Krijgt die een nieuwe `SeededRandom` met **dezelfde seed**, dan herhalen de item-ID's, nonces en geheimen van vóór de kill zich. Gevolg:
- een nieuw item krijgt het ID van een bestaand item en merget daarmee (schendt "nieuw item = nieuw ID");
- de nonce wordt hergebruikt met dezelfde sleutel (de NF-01-test).

*Voorstel:* de `Random`-stroom blijft net als de keystore over een kill heen bestaan (dezelfde instantie, niet verpakt door de KillSwitch), of wordt opnieuw geseed met `seed ⊕ incarnatie`. Leg dat vast in §13.3 en neem het op in `device.test`: geen dubbele ID's of nonces over herstarts heen.

**I-3. Een tweede event vóór de weigering van het eerste leidt tot onnodige rotatie** — §6.8 stap 2–4

Stel dat `e1` (klokversie) nog onderweg is en dat er binnen de RTT een volgende flush komt, bijvoorbeeld bij trage relays. Dan krijgt `e2` als versie `floor+1`, en dus `!clockDerived`. Daarna weigeren alle relays `e1` en `e2`:
- `e1` mag niet terugrollen, omdat `version ≠ floor`;
- `e2` mag nooit terugrollen, omdat de versie van de vloer komt.

De vloer blijft dan op +1 u staan terwijl geen enkele relay iets heeft, en uiteindelijk volgt rotatie (`floor − nowAdj > 3600`). Dat is veilig, maar het ontwerpdoel "rotatie alleen bij een echte wegloper" wordt bij een klok van +1 u met snelle bewerkingen niet gehaald.

*Voorstel:* heeft het laatste event van een slot een `clock-*`-weigering en staan er nog antwoorden open, dan wacht de volgende flush van dat slot op die antwoorden (maximaal 8 s, de publicatie-time-out). Normaal is er geen weigering, dus dit raakt S-12 niet. Met B-1 rolt de vloer daarna correct terug. Test: klok +1 u, 5 bewerkingen in 2 s, relay met 200 ms latentie. Verwacht: geen rotatie en aanwezig ≤ 30 s.

### Klein

**K-1. Zombies laten bevriezen in plaats van gooien** — §13.3

Gooit elke async-aanroep van een zombie `SimulatedCrash`, dan levert dat veel onafgehandelde promise-rejections op. Dat geeft ruis en, afhankelijk van Node en Jest, flakkerende tests. *Voorstel:* na `kill()` geven verpakte **async** aanroepen een promise terug die nooit afloopt; synchrone aanroepen gooien wel. `test/setup-node.ts` negeert `SimulatedCrash` in `unhandledRejection`.

**K-2. Importregel §2 en de polyfills** — §2

`src/polyfills.ts` en `src/selftest.ts` gebruiken `globalThis.crypto` en vallen nu onder het verbod. *Voorstel:* zet ze op de uitzonderingslijst.

**K-3. Timer voor het opnieuw versturen in stap 3** — §6.8 stap 3, §6.6

Een `inFlight`-regel vervalt na 5 min. Het opnieuw versturen naar de strenge relay kan pas na ±11 min (versie ≤ `nu_aangepast + 240`, met een verlaagde `offsetSec`). *Voorstel:* een aparte timer per slot (geannuleerd bij een nieuwer event of bij `pause`), of uitdrukkelijk vertrouwen op de eigen-staatcontrole bij de volgende EOSE of kick. Leg vast welke van de twee.

## 4. Antwoord op de vragen van de coördinator

- **Nieuw mechanisme met slotversie, vloer en terugrollen:**
  - eigenaarschap, persistentie en de klokcorrectie naar de strengste relay zijn goed;
  - de voorwaarde voor terugrollen is nog niet veilig (**B-1**);
  - gelijktijdige flushes kunnen de strikte stijging breken (**B-2**);
  - er is een onnodige rotatie in een randgeval (**I-3**).
- **Facade met `{result, committed}`:** de opzet is goed en bouwbaar. Leg de delta-merge in de schrijftaak vast (**I-1**).
- **KillSwitch:** de opzet is goed en bouwbaar. Leg vast dat `Random` een herstart overleeft (**I-2**), en laat zombies bij voorkeur bevriezen (**K-1**).
- **Bouwbaarheid:** §4 is in de proef groen: install, check:deps, beide tsconfigs, Jest en export.

Niet gewijzigd: `docs/ARCHITECTURE.md` en `docs/APPROVALS.md`. Er is nog niet gebouwd.
