# Antwoord aan App Review (Guideline 2.1 – Information Needed)

Gebruik: plak de Engelse tekst hieronder (1) als antwoord in App Store Connect bij het reviewbericht, met de schermopname als bijlage, en (2) in **App Review Information → Notes** (max. 4000 tekens), zodat volgende reviews het ook zien.

---

## Tekst om te plakken (Engels)

Hello App Review team,

Thank you for reviewing BOODSCHAP!. Please find the requested information below. A screen recording made on a physical iPhone 16 running the latest iOS is attached.

**1. Screen recording**
The attached recording starts with launching the app from the Home Screen and shows the typical flow: creating/opening a grocery list, adding items (items are automatically sorted into supermarket categories), checking items off, swipe-to-delete with undo, sharing a list via QR code / text code, and the Settings screen with the privacy policy and support links.
The app has no account registration or login, no paid content or in-app purchases, and no public user-generated content. Lists are only visible to the people a user explicitly shares a private code with (for example a partner), so there is no public content to report or block.

**2. Purpose and target audience**
BOODSCHAP! is a free, ad-free grocery list app for households (couples, families, housemates) who do their shopping together. It solves the problem of keeping one shared shopping list up to date on several phones, also when one phone is temporarily offline in the supermarket. Changes are stored on the device first and synchronized end-to-end encrypted to the other phones as soon as there is a connection. There are no ads, no tracking and no accounts.

**3. How to use the main features (no login or demo account needed)**
- Open the app: a list called "Boodschappen" (Groceries) is already there. Tap it.
- Type an item in the field at the bottom ("Wat moet er in huis?"), e.g. "2 melk" or "bananen", and press return. Items are grouped by category automatically.
- Tap the circle to check an item off; checked items move to the bottom. Swipe an item to the left to delete it; tap "Ongedaan maken" (Undo) to restore it.
- Sharing: tap the share icon in the top right of a list. A QR code and a text code appear. On a second device, tap "Lijst toevoegen" (Add list) on the main screen and scan the QR code or paste the code. Both devices now show the same list and stay in sync.
- Settings (gear icon on the main screen): relay servers, privacy policy, support and open-source licenses.
The user interface is in Dutch. Testing sharing requires two devices (for example two iPhones, or an iPhone and an iPad).

**4. External services**
- Public Nostr relays (by default wss://relay.damus.io, wss://relay.primal.net, wss://offchain.pub, wss://nostr.mom). They are used only as a "mailbox" for synchronization between the user's own devices. All list content is end-to-end encrypted (XChaCha20-Poly1305) on the device; relays only store encrypted data and cannot read it. Users can change the relays in Settings.
- GitHub Pages hosts the privacy policy and support pages (https://nickderonde.github.io/boodschap/).
The app does not use any own backend, authentication service, analytics, advertising, payment processor or AI service. The app is open source (MIT): https://github.com/nickderonde/boodschap

**5. Regional differences**
The app works the same in all regions where it is offered. The user interface is Dutch. The app is not offered in France (export compliance: standard encryption algorithms, no French declaration filed).

**6. Regulated industry / third-party material**
Not applicable. The app does not operate in a regulated industry and does not contain protected third-party content.

Contact: info@derondeengineering.nl

Kind regards,
Nick de Ronde

---

## Schermopname maken (iPhone, ca. 1–2 minuten)

1. Instellingen → Bedieningspaneel → zorg dat **Schermopname** erin staat.
2. Zet een paar producten klaar of begin met een lege lijst; zet "Niet storen" aan.
3. Open het Bedieningspaneel, tik op **Schermopname** (3 sec aftellen) en ga naar het **beginscherm**.
4. Laat in deze volgorde zien:
   1. BOODSCHAP! starten vanaf het beginscherm.
   2. Lijst "Boodschappen" openen.
   3. Typen: `2 melk`, `bananen`, `kipfilet`, `wasmiddel` (laat zien dat ze in categorieën vallen).
   4. Eén item afvinken (gaat naar onderen).
   5. Eén item naar links swipen → verwijderd → "Ongedaan maken".
   6. Deel-icoon → QR-code en "Klaar om te koppelen".
   7. Terug → tandwiel (Instellingen) → naar beneden scrollen → Privacybeleid openen en terug.
   8. Eventueel: op een tweede toestel (emulator/iPad) de code scannen en laten zien dat een wijziging overkomt.
5. Stop de opname (rode statusbalk → Stop). De video staat in Foto's.
6. AirDrop de video naar de Mac of voeg hem direct vanaf de iPhone toe als bijlage in de App Store Connect-app.
