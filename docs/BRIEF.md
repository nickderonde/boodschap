# Bootschap — opdracht & onderzoek (brief voor het team)

## De opdracht van de opdrachtgever (Nick)
- Een boodschappen-app zoals **Listonic**, voor **iOS én Android**.
- Hoofdzaak: **synchronisatie tussen telefoons** (Nick en zijn vrouw) moet goed werken.
- **Offline-first**: wijzigingen worden lokaal opgeslagen; zodra er weer internet is, gaan ze naar de andere telefoon.
- **Geen eigen server** ertussen; de app moet **gratis** zijn, **geen advertenties**.
- Moet net zo goed zijn als Listonic voor het dagelijkse gebruik: samen boodschappen doen.
- Taal van de app: **Nederlands**.

## Teamrollen
- **Projectleider** (bewaakt de eisen, `docs/REQUIREMENTS.md`, keurt goed/af).
- **Architect** (ontwerpt het systeem, `docs/ARCHITECTURE.md`, reviewt code).
- **Engineer** (bouwt de functionele code).
- **Eindtester** (test alles tegen de eisen, `docs/TEST_REPORT.md`).
Elk deliverable heeft goedkeuring nodig van de andere rollen voordat we verder gaan. Goedkeuringen worden vastgelegd in `docs/APPROVALS.md`.

## Onderzoeksbevindingen (door de coördinator)

### Waarom niet "puur peer-to-peer"
Echte P2P (WebRTC, Bluetooth, lokaal wifi) werkt alleen als **beide telefoons tegelijk online en de app open** hebben. iOS stopt apps op de achtergrond vrijwel direct. Scenario "mijn vrouw voegt melk toe terwijl ik offline ben, en later zie ik het" faalt dan: er is niemand die het bericht bewaart. WebRTC heeft bovendien een signalingserver nodig (en vaak TURN) — dat is alsnog een server.

### Gekozen richting: Nostr-relays als gratis "brievenbus" + CRDT
- **Nostr** is een open protocol met honderden **gratis publieke relays** (bijv. `wss://relay.damus.io`, `wss://nos.lol`, `wss://relay.nostr.band`, `wss://relay.primal.net`). Wij draaien en betalen **geen** server. Relays bewaren berichten (store-and-forward), dus de andere telefoon krijgt wijzigingen ook als die later online komt.
- Alle inhoud wordt **end-to-end versleuteld** met een gedeelde lijst-sleutel (uitgewisseld via QR-code/deellink bij het koppelen). Relays zien alleen versleutelde blobs.
- **Meerdere relays tegelijk** (redundantie): als er één weg valt, werken de anderen.
- **CRDT (conflictvrije datastructuur)** met Hybrid Logical Clocks: per item/veld last-writer-wins, verwijderingen als tombstones. Merge is commutatief, associatief en idempotent → volgorde en duplicaten van berichten maken niet uit, geen conflicten.
- Aanbevolen sync-patroon: elk apparaat publiceert zijn **volledige (versleutelde) lijststatus** als *parameterized replaceable event* (kind 30078, `d`-tag per lijst+apparaat). Boodschappenlijsten zijn klein (enkele KB). Elk apparaat haalt de laatste status van alle leden op en merget. Optioneel: kleine delta-events voor snellere realtime-updates. Dit is robuust: ook als relays oude events opruimen, blijft de laatste status beschikbaar.
- Transport moet een **verwisselbare laag** zijn (interface), zodat later bijv. LAN-sync of een andere relay-soort kan worden toegevoegd.
- Geen push-notificaties (die vereisen een server); sync bij app-openen, bij terugkeren naar voorgrond, bij netwerkherstel, en live via websocket-abonnement zolang de app open is.

### Techniek
- **Expo (React Native) + TypeScript**, één codebase voor iOS en Android. Laatste versies (okt 2026): `expo` 57.0.x, `react-native` 0.87.x, `expo-sqlite` 57.x, `expo-camera` 57.x, `jest-expo` 57.x, `nostr-tools` 2.25.x, `@noble/ciphers` 2.4.x, `@noble/hashes` 2.4.x, `zustand` 5.x.
- Alleen pure-JS libraries + Expo-modules, zodat de app draait in **Expo Go** (testen op de eigen telefoons zonder Xcode/Android Studio). Later bouwen voor de stores met EAS Build (gratis tier).
- Lokale opslag: `expo-sqlite`. Versleuteling: `@noble/ciphers` (XChaCha20-Poly1305). Nostr: `nostr-tools`. Random: `expo-crypto` / `react-native-get-random-values`.

### Omgeving van de ontwikkelmachine (belangrijk voor testen)
- macOS, Node 25, npm 11. **Geen Xcode en geen Android SDK** geïnstalleerd → geen simulators.
- Testen dus via: Jest (unit + integratie), TypeScript typecheck, `npx expo export --platform ios` en `--platform android` (bewijst dat de bundel voor beide platformen bouwt), en een **lokale nep-/echte Nostr-relay in de tests** om sync tussen twee gesimuleerde apparaten met netwerkuitval te testen.
- Nick test daarna zelf op twee telefoons via Expo Go.

### Listonic-functies (referentie)
Meerdere lijsten; items toevoegen met hoeveelheid/eenheid en notitie; afvinken (afgevinkte items naar onderen); automatische categorieën (zuivel, groente & fruit, …) en sortering per categorie; suggesties/autocomplete uit eerdere items; lijst delen met anderen; afgevinkte items wissen; item bewerken/verwijderen; realtime updates van de partner.
