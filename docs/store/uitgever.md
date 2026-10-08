# Uitgever, accounts en handelaarsgegevens — ST-19 / ST-20

Besluiten van Nick (2026-10-07), vastgelegd door de Engineer:

| Onderwerp | Besluit |
|---|---|
| Uitgever (in app, site en storevermelding) | De Ronde Engineering (Nick de Ronde) |
| Contact | info@derondeengineering.nl (moet bereikbaar zijn) |
| Adres / KvK | Niet vermeld op site of in de app |
| Apple Developer-account | Op naam van Nick als individu; in de App Store staat "Nick de Ronde" als verkoper; copyrightveld "2026 Nick de Ronde" (`store/listing.json`, ST-19 a) |
| Google Play-account | **Organisatie-account** van De Ronde Engineering (D-U-N-S-nummer en verificatie nodig); ontwikkelaarsnaam "De Ronde Engineering". Geen verplichte gesloten test van 14 dagen (ST-20 vervalt); gebruik wel eerst de interne testtrack voor de release-rooktest (ST-16) |
| DSA-handelaar | **Ja**, in beide stores (besluit Nick 2026-10-07). Beide verwijzen naar dezelfde handelaarsgegevens |
| App-ID | `nl.derondeengineering.boodschap` (na eerste publicatie niet te wijzigen) |
| Licentie | MIT, houder Nick de Ronde |
| Repository | `github.com/nickderonde/boodschap` (nog aan te maken; pas publiek na schone `npm run check:secrets`) |
| Website / privacybeleid | `https://nickderonde.github.io/boodschap/` (NL), `/privacy/`, `/support/`; Engels onder `/en/` |

## EU-handelaarsstatus (DSA): handelaar

Besluit: Nick dient in **als handelaar** (Apple en Google). Gevolgen:

- De stores tonen aan EU-gebruikers de handelaarsgegevens: **adres, telefoonnummer en e-mailadres**. Die vult Nick in App Store Connect (Business → Trader status) en in de Play Console (Account details / Developer page) in. Gebruik in beide stores dezelfde gegevens.
- Privacybeleid: blijft bij naam (De Ronde Engineering, Nick de Ronde) en e-mail; dat voldoet aan de AVG (art. 13). De DSA-plicht wordt vervuld door wat de stores tonen.
- Website (besluit Nick 2026-10-07): op de supportpagina én het privacybeleid (NL en EN) staat onder "Over de uitgever": **De Ronde Engineering (Nick de Ronde)**, **info@derondeengineering.nl** en het **nummer van de KvK-inschrijving**. **Geen adres** (dat is een huisadres); het adres staat alleen in de handelaarsgegevens van de stores.
- KvK-inschrijving: **61854735** (ontvangen van Nick, 2026-10-07), ingevuld op de vier pagina's (`site/support/`, `site/en/support/`, `site/privacy/`, `site/en/privacy/`). `npm run check:secrets` (regel `placeholder`) en de Pages-workflow blijven waken dat er geen placeholder meer op de site komt.
- Art. 3:15d BW vraagt bij een handelaar ook een vestigingsadres op de website; Nick kiest bewust om dat niet te tonen (huisadres). Geen juridisch advies; Nick bevestigt.

| Gegeven | Waarde | Ingevuld in |
|---|---|---|
| Naam | De Ronde Engineering (Nick de Ronde) | stores, site |
| E-mail | info@derondeengineering.nl | stores, site |
| KvK-inschrijving | 61854735 | site, Play Console (organisatieverificatie) |
| Adres | alleen in de stores (handelaarsgegevens), niet op de site | App Store Connect, Play Console |
| Telefoonnummer | in te vullen door Nick | App Store Connect, Play Console |
| D-U-N-S-nummer (Google-organisatie) | in te vullen door Nick | Play Console |

## Gesloten test Google (vervallen bij organisatie-account; alleen als terugval)

| Gegeven | Waarde |
|---|---|
| Aantal testers (minimaal 12) | |
| Startdatum (eerste tester aangemeld) | |
| Einddatum (≥ 14 dagen) | |
| Productietoegang aangevraagd op | |
