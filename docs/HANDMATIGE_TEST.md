# Handmatige test voor Nick (twee telefoons)

Doel: laten zien dat Bootschap in het echt werkt voor jou en je vrouw. Dit zijn de scenario's H-01 t/m H-07 uit de eisen, in gewone taal. Reken op ongeveer 30 minuten.

## Voorbereiding (eenmalig)

1. Zet de app aan op je computer: open Terminal, ga naar de map van het project en typ `npm install` (alleen de eerste keer) en daarna `npx expo start`. Laat dit venster open staan. Er verschijnt een QR-code.
   - Meldingen over "deprecated" bij `npm install` mag je negeren. Voer **nooit** `npm audit fix` uit (zie README).
2. Zorg dat jij en je vrouw **Expo Go** op de telefoon hebben (gratis, App Store of Play Store). De telefoons en de computer moeten op **hetzelfde wifi-netwerk** zitten. Lukt dat niet: stop met Ctrl+C en start met `npx expo start --tunnel`.
3. Open de app op **beide** telefoons:
   - iPhone: Camera-app, richt op de QR-code, tik op "Openen in Expo Go".
   - Android: open Expo Go, kies "Scan QR code".
4. Je ziet op beide telefoons de lijst "Boodschappen". Noem de telefoons hieronder **A** (die van jou) en **B** (die van je vrouw).

Noteer bij elk scenario of het klopte (Ja/Nee) en wat je opviel. Fout? Maak een screenshot en noteer de tijd.

---

## H-01 Koppelen

**Doen**
1. Op A: open de lijst "Boodschappen", voeg 3 dingen toe (bijvoorbeeld melk, brood, kaas).
2. Op A: tik rechtsboven op het deel-icoon. Er verschijnt een QR-code. Wacht tot er **"Klaar om te koppelen"** staat.
3. Op B: ga naar het lijstenoverzicht, tik op **Lijst toevoegen**, kies **Scannen** en richt de camera op de QR-code op A. (Vraagt B om toegang tot de camera? Tik op toestaan.)

**Je moet zien**
- Op B verschijnt de lijst met alle 3 de dingen, in de juiste groepen (melk bij Zuivel, brood bij Brood).
- Op beide telefoons staat bovenaan "Gesynchroniseerd".

**Daarna, via tekst (zonder camera)**
1. Op A: tik op **Delen…** en stuur de tekst naar jezelf via WhatsApp (of tik **Kopieer code**).
2. Op een derde plek of na het verlaten van de lijst op B (tik rechtsboven op de drie puntjes, **Lijst verlaten**): kopieer de hele tekst. Ga naar **Lijst toevoegen**, kies **Code plakken**, tik **Plakken** en dan **Koppelen**.
3. Je ziet dezelfde lijst weer. Plak je dezelfde code nog een keer, dan zegt de app dat de lijst er al staat en komt er geen tweede kopie.
4. Probeer ook een kapotte code (haal een paar tekens weg): je moet een begrijpelijke Nederlandse melding krijgen en geen halve lijst.
5. (Optioneel) Zet de cameratoestemming van Expo Go uit en open **Scannen**: de app moet uitleggen dat je ook kunt plakken.

## H-02 Offline werken

**Doen**
1. Zet A in **vliegtuigmodus**.
2. Op A: voeg 5 dingen toe en vink er 1 af.
3. Kijk naar de balk bovenaan op A.
4. Zet vliegtuigmodus uit.

**Je moet zien**
- Terwijl A offline is staat er **"Offline — n wijzigingen wachten"** (het getal klopt, je hoeft niets te doen).
- Binnen **10 seconden** na het uitzetten van vliegtuigmodus verschijnen de 5 dingen (met het afgevinkte item) op B.
- De balk wordt "Gesynchroniseerd".

## H-03 Tegelijk wijzigen

**Doen**
1. Zet **beide** telefoons in vliegtuigmodus. Zorg dat "brood" op de lijst staat.
2. Op A: voeg "melk" toe en hernoem "brood" naar "volkorenbrood" (tik op het pijltje rechts van het item).
3. Op B: voeg "kaas" toe en zet de hoeveelheid van "brood" op 2.
4. Zet vliegtuigmodus op beide telefoons uit.

**Je moet zien**
- Binnen een halve minuut hebben **beide telefoons dezelfde lijst**: melk, kaas en "volkorenbrood" met hoeveelheid 2 (beide wijzigingen aan brood blijven bewaard).

## H-04 App geforceerd afsluiten

**Doen**
1. Zet A in vliegtuigmodus. Voeg 3 dingen toe.
2. Sluit de app **meteen geforceerd af** (veeg Expo Go weg uit de app-lijst).
3. Open de app opnieuw (via Expo Go, scan of kies het recente project).
4. Zet vliegtuigmodus uit.

**Je moet zien**
- Na het heropenen staan de 3 dingen er nog.
- Na het uitzetten van vliegtuigmodus komen ze op B.

## H-05 Verwijderen tegenover bewerken

Zorg dat "kaas" op de lijst staat en dat beide telefoons dezelfde lijst zien.

**Variant 1: bewerken komt later**
1. Zet beide telefoons in vliegtuigmodus.
2. Op A: verwijder "kaas" (pijltje rechts, **Verwijderen**).
3. Wacht een halve minuut. Op B: wijzig de naam van "kaas" naar "oude kaas".
4. Vliegtuigmodus uit op beide.

**Je moet zien:** op **beide** telefoons staat "oude kaas" weer op de lijst (een latere wijziging wint van de verwijdering).

**Variant 2: bewerken komt eerder** (zet "kaas" terug als het weg is)
1. Beide telefoons in vliegtuigmodus.
2. Op B: wijzig "kaas" (bijvoorbeeld hoeveelheid 3).
3. Wacht een halve minuut. Op A: verwijder "kaas".
4. Vliegtuigmodus uit op beide.

**Je moet zien:** "kaas" is op **beide** telefoons weg.

## H-06 De ander komt later online

**Doen**
1. Zet B in vliegtuigmodus.
2. Op A: voeg 3 dingen toe. Wacht tot de balk "Gesynchroniseerd" zegt.
3. Sluit de app op A af (naar de achtergrond of geforceerd). A hoeft niet meer open te zijn.
4. Zet op B vliegtuigmodus uit en open de app.

**Je moet zien:** B toont de 3 nieuwe dingen, ook al is de app op A dicht.

## H-07 Snelheid

**Doen**
1. Open de lijst op beide telefoons (scherm aan, app open, internet aan).
2. Op A: voeg 10 dingen toe, met ongeveer een paar seconden tussen elk.
3. Kijk op B hoe lang het duurt voordat elk item verschijnt (stopwatch op een derde apparaat of schat het).

**Je moet zien:** de meeste dingen staan binnen **5 seconden** op B (de eis is: gemiddeld hooguit 5 seconden). Noteer de tijd van de langzaamste.

---

## H-08 Swipen om te verwijderen (gevoel van het gebaar, iPhone)

De werking is automatisch getest; hier gaat het om hoe het **voelt** op je iPhone. Gebruik een lijst met minstens 10 items (waarvan een paar afgevinkt) en minstens 2 lijsten.

**Een item verwijderen**
1. Veeg een item op de lijst met je duim **naar links**.
2. Je moet zien: een rode knop **"Verwijderen"** schuift achter het item vandaan. Het item is nog niet weg.
3. Tik op de rode knop. Het item verdwijnt meteen, zonder vraag, en onderin staat **"... verwijderd"** met **"Ongedaan maken"**. Tik op "Ongedaan maken" binnen 10 seconden: het item staat er weer, ook op de andere telefoon.
4. Veeg een item **helemaal** door naar links en laat los. Het item verdwijnt direct, met dezelfde melding.
5. Doe dit ook met een **afgevinkt** item.

**Voelt het goed?**
- Scroll de lijst omhoog en omlaag met je duim. Er mag **niet per ongeluk** een rij opengaan of een item verdwijnen.
- Tik op een item om het af te vinken: dat moet net zo snel gaan als vroeger.
- Open een rij een klein stukje en veeg dan een **andere** rij open: de eerste moet dichtklappen (er staat steeds maar één rij open). Tik ergens anders of scroll: de open rij klapt ook dicht.
- Is de beweging soepel, en hoeft de veeg niet te ver of te hard om "Verwijderen" te tonen? Noteer of de gevoeligheid (te snel open, te moeilijk open, per ongeluk helemaal door) prettig is.

**Een lijst verwijderen**
1. Ga naar het lijstenoverzicht en veeg een lijst naar links. Er verschijnt een rode knop **"Verwijderen"**.
2. Tik erop. Je krijgt **altijd eerst een vraag** ("Lijst verwijderen?"). Ook bij een volledige veeg wordt er nooit zonder vraag verwijderd.
3. Kies **Annuleren**: de lijst blijft staan en de rij klapt dicht.
4. Probeer het op een **gedeelde** lijst: de vraag zegt dat de lijst op **alle telefoons** verdwijnt en biedt ook **Lijst verlaten** aan (dan houdt de ander de lijst). Kies Annuleren, tenzij je echt wilt verwijderen.
5. Tikken op een lijst opent hem nog gewoon, en het menu met de drie puntjes in de lijst werkt nog.

**Je moet zien:** alles hierboven, en een gebaar dat niet vervelend is bij het gewone scrollen. Meld bij "Nee" of het te gevoelig, te stroef of anders is.

(Heb je VoiceOver aan? Ga met één vinger naar een item, veeg met één vinger omhoog of omlaag tot je **"Verwijderen"** hoort en dubbeltik: het item wordt verwijderd, met "Ongedaan maken".)

---

## Dagelijkse dingen om even te proberen

- Typ "2 melk" of "500 g kaas": de hoeveelheid wordt apart getoond.
- Typ een paar letters (bijvoorbeeld "ha"): onder het invoerveld verschijnen suggesties. Tik erop om toe te voegen.
- Tik een item aan: het wordt doorgehaald en zakt naar "Afgevinkt". Tik op **Afgevinkte wissen**: alles is weg, maar met **Ongedaan maken** (10 seconden) komt het terug.
- Trek de lijst omlaag: de app synchroniseert direct.
- Zet de telefoon in donkere modus: alle schermen moeten leesbaar blijven.
- Open **Instellingen** (tandwiel op het lijstenoverzicht): probeer een adres met `ws://` toe te voegen. Dat moet geweigerd worden; alleen `wss://` mag.

## Als iets niet werkt

Noteer: welk scenario, op welke telefoon (A of B), wat je deed, wat je zag en wat je verwachtte. Voeg een screenshot toe en stuur het naar de Eindtester.
