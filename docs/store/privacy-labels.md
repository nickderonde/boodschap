# Privacylabels (Apple) en Data Safety (Google) — ST-11

Status: voorstel van de Engineer (2026-10-07), ter goedkeuring door de Projectleider; Nick vult de formulieren in en bewaart schermafbeeldingen van de bevestigde antwoorden in deze map.

## Uitgangspunten (gecontroleerd tegen de code)

| Feit | Bron in de code |
|---|---|
| Geen account, geen eigen server, geen analytics/crash/advertentie-SDK | `package.json`; `test/arch/deps.test.ts` (denylist), NF-06 |
| Enige netwerkverkeer: WebSockets naar de ingestelde relays (wss://) | `src/sync/transports/nostr`, `test/integration/security.test.ts` (NF-06: fetch/XHR gooien) |
| Lijstinhoud end-to-end versleuteld (XChaCha20-Poly1305); relays zien alleen versleutelde events | NF-01..NF-03 |
| Wat een relay wel ziet: pubkeys per lijst/installatie, tijdstippen, aantallen, groottes, IP-adres | privacybeleid punt 4 |
| Camera alleen lokaal voor QR; geen opslag of verzending | `app/koppelen.tsx` |
| Geen `expo-updates`, geen advertentie-ID (`AD_ID` geblokkeerd) | `app.json`, ST-18 |

## Apple — App Privacy ("Gegevens niet verzameld")

Vraag in App Store Connect: *Do you or your third-party partners collect data from this app?* → **No, we do not collect data from this app.**

Onderbouwing (definitie van Apple, developer.apple.com/app-store/app-privacy-details, gecontroleerd 2026-10-07): "collect" = gegevens van het toestel sturen zodat **jij of je third-party partners** er langer toegang toe hebben dan nodig is om het verzoek direct af te handelen. Third-party partners zijn volgens Apple analytics-tools, advertentienetwerken, SDK's of andere externe leveranciers *waarvan de code in je app zit*; die zijn er niet. Relays zijn openbare servers die de gebruiker zelf kiest (instelbaar), ontvangen alleen versleutelde inhoud, en De Ronde Engineering heeft er geen toegang toe of afspraken mee.

Aandachtspunt (eerlijk vastgelegd): Apple zegt ook dat IP-adressen moeten worden opgegeven naar gebruik. De uitgever ontvangt geen IP-adressen en gebruikt ze niet; de relays zien het IP-adres als technisch gevolg van de verbinding. Dit staat expliciet in het privacybeleid (ST-06 punt 4). Advies: "niet verzameld" met deze onderbouwing. Vraagt Apple bij de beoordeling toch om een opgave, dan is de terugval: "Other Data" als **Data Not Linked to You**, niet voor tracking, doel "App Functionality" — en dit document en het beleid bijwerken.

## Google — Data Safety ("geen gegevens verzameld of gedeeld")

| Vraag | Antwoord | Onderbouwing |
|---|---|---|
| Does your app collect or share any of the required user data types? | **No** | Google (support.google.com/googleplay/android-developer/answer/10787469): gegevens die het toestel verlaten maar door end-to-end-versleuteling voor niemand anders dan zender en ontvanger leesbaar zijn, hoeven niet te worden opgegeven. Er zijn geen SDK's die iets versturen. |
| Is all of the user data collected by your app encrypted in transit? | n.v.t. (vervalt bij "No"); anders: Yes (wss/TLS + E2E) | |
| Do you provide a way for users to request that their data is deleted? | n.v.t.; alle data is lokaal (app verwijderen wist alles) | |
| Ads: does your app contain ads? | **No** | |
| Target audience | 18+ / volwassenen, niet gericht op kinderen | ST-13 |

## Platformgegevens van Apple en Google (review CR-03 C-1)

- Apple: crashlogs van gebruikers die in iOS "Deel met app-ontwikkelaars" aanzetten, en geaggregeerde App Analytics in App Store Connect. Google: Android vitals (crashes, ANR's) en installatiestatistieken in de Play Console.
- Deze gegevens worden door het **platform** verzameld, niet door de app of door code van derden in de app; ze vallen niet onder de opgave van de ontwikkelaar. De labels blijven dus "Gegevens niet verzameld" / "geen gegevens verzameld of gedeeld".
- Het privacybeleid noemt ze wel expliciet (NL en EN, punt 3, alinea "Via Apple en Google"), zodat de zin "wij ontvangen geen gegevens" niet te absoluut is.
- Externe links (privacybeleid, support, broncode op GitHub) worden alleen op een tik van de gebruiker in de browser geopend; dat is een gebruikersactie en geen verzameling door de app.

## Wanneer bijwerken

Vóór elke wijziging die data of netwerk raakt (analytics, push, crash-rapportage, een eigen server): eerst dit document en het privacybeleid (`site/privacy/`, `site/en/privacy/`) bijwerken, daarna de formulieren in beide stores.
