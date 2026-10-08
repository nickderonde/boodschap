# Exportverklaring versleuteling — ST-12

Status: onderbouwing door de Engineer (2026-10-07). **Geen juridisch advies**: Nick (uitgever) bevestigt de uitkomst.

## Welke cryptografie de app gebruikt

| Doel | Algoritme | Standaard | Bibliotheek |
|---|---|---|---|
| Vertrouwelijkheid lijstinhoud | XChaCha20-Poly1305 (AEAD) | ChaCha20-Poly1305: IETF RFC 8439; XChaCha-uitbreiding: IRTF-CFRG-draft `draft-irtf-cfrg-xchacha` (libsodium) | `@noble/ciphers` (MIT, open source) |
| Sleutelafleiding | HKDF-SHA256 | IETF RFC 5869, FIPS 180-4 | `@noble/hashes` |
| Authenticatie/handtekeningen | Schnorr over secp256k1 (Nostr, BIP-340) | curve: SECG SEC 2 | `nostr-tools` / `@noble/curves` |
| Transport | TLS (wss://) | van het besturingssysteem | iOS/Android |

Geen eigen of geheime algoritmen; de volledige broncode is openbaar (MIT).

## App Store Connect

- **Geen encryptiesleutel in `app.json` (D-49, 2026-10-08).** Build 1 met `ITSAppUsesNonExemptEncryption = true` en zonder `ITSEncryptionExportComplianceCode` werd door Apple afgewezen: *ITMS-90592: Invalid Export Compliance Code – the export compliance key value [] in the app's Info.plist doesn't match the key value of the app's export compliance documentation.* Daarom staat de sleutel nu helemaal niet in de Info.plist. App Store Connect stelt de exportvragen dan **per build**; Nick beantwoordt ze naar waarheid (zie hieronder en `docs/STORE_INVULLEN.md`, A5). (De eis noemde `ITSAppUseEncryption`; de echte sleutel heet `ITSAppUsesNonExemptEncryption`, D-38.)
- Antwoorden per build in App Store Connect: (1) de app gebruikt versleuteling: **Yes**; (2) soort: **standard encryption algorithms** naast die van het besturingssysteem (geen proprietary/non-standard); (3) beschikbaar in Frankrijk: **No**; uitkomst: **geen documentatie nodig**.
- Antwoord op de vragen: de app gebruikt versleuteling **naast** die van het besturingssysteem, met **industriestandaard-algoritmen** (geen proprietary/non-standard).
- Volgens Apple (developer.apple.com/help/app-store-connect/reference/app-information/export-compliance-documentation-for-encryption, gecontroleerd 2026-10-07): industriestandaard-algoritmen buiten het OS → **alleen een Franse encryptieverklaring als de app in Frankrijk wordt aangeboden**; proprietary/non-standard → ook een CCATS. Hier dus geen CCATS.
- Frankrijk: kies bij de eerste indiening of de app in Frankrijk beschikbaar komt. Zonder Franse verklaring: Frankrijk uitsluiten in "Pricing and Availability". Met verklaring: het ANSSI-formulier indienen (de declaratie voor een cryptomiddel dat alleen authenticatie en vertrouwelijkheid biedt). Advies: start zonder Frankrijk, voeg later toe.
- Alleen als Apple later een **compliance code** geeft (bijv. na een Franse verklaring): zet dan `ITSAppUsesNonExemptEncryption` én `ITSEncryptionExportComplianceCode` samen in `ios.infoPlist`, nooit de eerste zonder de tweede (dat gaf ITMS-90592).

## VS (EAR) — waarom geen melding nodig lijkt

- Sinds de BIS-regel van 29 maart 2021 is de e-mailmelding voor **openbaar beschikbare encryptie-broncode** (EAR §742.15(b)) niet meer nodig, behalve bij "non-standard cryptography". Bron: bis.gov en samenvattingen van o.a. Arnold & Porter en Jones Day (april 2021).
- De app is een gratis massamarktproduct (5D992.c); de jaarlijkse self-classification report is na 2021 voor de meeste massamarktproducten vervallen.
- Kanttekening voor Nick: XChaCha20 is een IRTF-draft en BIP-340 is geen ISO/IETF-norm. Handtekeningen (authenticatie) vallen niet onder de encryptiecontrole; XChaCha20 is een directe uitbreiding van de IETF-norm ChaCha20 en breed gebruikt (libsodium). Wil je zekerheid, vraag dan advies of kies bij Apple conservatief; dit document legt de afweging vast.

## Vastleggen na indiening

Datum, gegeven antwoorden (schermafbeelding in deze map) en eventuele compliance-code.
