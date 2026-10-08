import fc from 'fast-check';
import { categorize, compoundHead, determiningPrefix, DETERMINING_PREFIXES, NOISE_WORDS, UNRELIABLE_HEADS } from './categorize';
import { CATEGORIES, categoryName, categoryOrder, displayCategory, isCategoryId } from './categories';
import { DICTIONARY } from './dictionary.nl';
import { normalizeName, singularCandidates } from './normalize';
import fixture from '../../../test/fixtures/categorize-f08-eindtester.json';
import ownFixture from '../../../test/fixtures/categorize-100.json';

describe('F-08: automatische categorie bij toevoegen', () => {
  it('F-08: precies 16 categorieën in de vaste volgorde van §8.1, met Huisdieren', () => {
    expect(CATEGORIES.map((c) => c.name)).toEqual([
      'Groente & fruit', 'Brood & gebak', 'Vlees & vis', 'Vleeswaren & kaas', 'Zuivel & eieren', 'Ontbijt & beleg',
      'Pasta, rijst & wereldkeuken', 'Houdbaar & conserven', 'Snacks & snoep', 'Dranken', 'Diepvries',
      'Huishouden & schoonmaak', 'Verzorging & drogisterij', 'Baby & kind', 'Huisdieren', 'Overig',
    ]);
  });

  it('F-08: woordenboek bevat ≥ 400 gangbare producten, verdeeld over alle 15 echte categorieën', () => {
    expect(DICTIONARY.size).toBeGreaterThanOrEqual(400);
    const used = new Set(DICTIONARY.values());
    for (const c of CATEGORIES) if (c.id !== 'overig') expect(used.has(c.id)).toBe(true);
  });

  it('F-08: testset van 100 producten van de Eindtester (goedgekeurd) ≥ 90% juiste categorie', () => {
    const items = (fixture as { items: { name: string; category: string }[] }).items;
    expect(items).toHaveLength(100);
    const wrong = items.filter((i) => categorize(i.name) !== i.category);
    expect((100 - wrong.length) / 100).toBeGreaterThanOrEqual(0.9);
  });

  it('F-08 (extra): eigen testset van de Engineer ≥ 90%', () => {
    const items = (ownFixture as { items: { name: string; category: string }[] }).items;
    expect(items).toHaveLength(100);
    const wrong = items.filter((i) => categorize(i.name) !== i.category);
    const score = (100 - wrong.length) / 100;
    if (score < 0.9) console.log('fout gecategoriseerd:', wrong.map((w) => `${w.name}→${categorize(w.name)} (verwacht ${w.category})`));
    expect(score).toBeGreaterThanOrEqual(0.9);
  });

  it('F-08: zoetwaren, diepvries, wereldkeuken, merken en samenstellingen (algemene uitbreiding)', () => {
    const cases: [string, string][] = [
      ['chocolade', 'snacks-snoep'], ['melkchocolade', 'snacks-snoep'], ['roomijs', 'diepvries'], ['aardbeien-ijs', 'diepvries'],
      ['mie noodles', 'pasta-rijst-wereld'], ['ramen', 'pasta-rijst-wereld'], ['Beemster', 'vleeswaren-kaas'], ['Felix', 'huisdieren'],
      ['Douwe Egberts', 'dranken'], ['Pampers', 'baby-kind'], ['Dreft', 'huishouden'], ['Colgate', 'verzorging'],
      ['Ben & Jerry\'s', 'diepvries'], ['rookworsten', 'vlees-vis'], ['wenskaarten', 'overig'], ['tomatensoep', 'houdbaar-conserven'],
      ['Old Amsterdam', 'vleeswaren-kaas'], ['Tony\'s Chocolonely', 'snacks-snoep'], ['Hertog Jan', 'dranken'], ['vissticks', 'diepvries'],
    ];
    for (const [n, c] of cases) expect([n, categorize(n)]).toEqual([n, c]);
  });

  it('F-08: voorbeelden uit de eis, hoofdletter-/accent-ongevoelig, eenvoudig meervoud', () => {
    expect(categorize('Tomaten')).toBe('groente-fruit');
    expect(categorize('HALFVOLLE MELK')).toBe('zuivel-eieren');
    expect(categorize('hagelslag')).toBe('ontbijt-beleg');
    expect(categorize('toiletpapier')).toBe('huishouden');
    expect(categorize('crème fraîche')).toBe('zuivel-eieren');
    expect(categorize('Appels')).toBe('groente-fruit');
    expect(categorize('peren')).toBe('groente-fruit');
    expect(categorize('volkorenbrood')).toBe('brood-gebak'); // samenstelling → hoofd
    expect(categorize('biologische halfvolle melk')).toBe('zuivel-eieren');
    expect(categorize('2 liter melk')).toBe('zuivel-eieren');
  });

  it('F-08: onbekend product → Overig, nooit een fout (fuzz)', () => {
    expect(categorize('xyzzy-kwakzalverij')).toBe('overig');
    expect(categorize('')).toBe('overig');
    expect(categorize('   ')).toBe('overig');
    expect(categorize('123')).toBe('overig');
    fc.assert(fc.property(fc.string(), (s) => isCategoryId(categorize(s))), { numRuns: 500 });
  });

  it('F-09 (core): voorkeur van het apparaat wint van het woordenboek', () => {
    const prefs = new Map([[normalizeName('Kaas'), 'diepvries']]);
    expect(categorize('kaas', prefs)).toBe('diepvries');
    expect(categorize('kaas')).toBe('vleeswaren-kaas');
    // Een ongeldige voorkeur wordt genegeerd.
    expect(categorize('kaas', new Map([['kaas', 'bestaat-niet']]))).toBe('vleeswaren-kaas');
  });

  it('categoriehulpen: onbekend ID → Overig', () => {
    expect(displayCategory('onbekend')).toBe('overig');
    expect(displayCategory(null)).toBe('overig');
    expect(categoryOrder('zuivel-eieren')).toBe(4);
    expect(categoryOrder('nieuw-in-v2')).toBe(15);
    expect(categoryName('dranken')).toBe('Dranken');
  });

  it('normaliseren en enkelvoudsvormen', () => {
    expect(normalizeName('  Crème   Fraîche!! ')).toBe('creme fraiche');
    expect(singularCandidates('tomaten')).toContain('tomaat');
    expect(singularCandidates('eieren')).toContain('ei');
    expect(singularCandidates('druiven')).toContain('druif');
    expect(singularCandidates('kazen')).toContain('kaas');
    expect(singularCandidates('flessen')).toContain('fles');
    expect(singularCandidates('appels')).toContain('appel');
  });

  describe('D-ET-07: hoe de matcher omgaat met voorvoegsels en achtervoegsels (koppen)', () => {
    it('bepalend voorvoegsel: "diepvries…", "honden…", "katten…", "baby…" bepalen de categorie, ook als los eerste woord', () => {
      expect(categorize('diepvriesframbozen')).toBe('diepvries');
      expect(categorize('diepvriesspinazie')).toBe('diepvries');
      expect(categorize('diepvries erwten')).toBe('diepvries');
      expect(categorize('hondenkluif')).toBe('huisdieren');
      expect(categorize('hondenkussen')).toBe('huisdieren');
      expect(categorize('kattenspeeltje')).toBe('huisdieren');
      expect(categorize('babyshampoo')).toBe('baby-kind');
      expect(categorize('borrelworstjes')).toBe('snacks-snoep');
      expect(determiningPrefix('diepvries')).toBe('diepvries');
      expect(determiningPrefix('hond')).toBeUndefined(); // te kort / geen voorvoegsel
      for (const [p] of DETERMINING_PREFIXES) expect(p).toBe(p.toLowerCase());
    });

    it('een exacte woordenboekterm gaat vóór het voorvoegsel (babybel is kaas, kattentong is snoep)', () => {
      expect(categorize('Babybel')).toBe('zuivel-eieren');
      expect(categorize('kattentongen')).toBe('snacks-snoep');
    });

    it('achtervoegsel = kop van de samenstelling bepaalt de categorie (volkorenbrood, roomijs, vruchtenhagel, kersenjam)', () => {
      expect(categorize('volkorenbrood')).toBe('brood-gebak');
      expect(categorize('meergranenbolletjes')).toBe('brood-gebak');
      expect(categorize('aardbeienroomijs')).toBe('diepvries');
      expect(categorize('vruchtenhagel')).toBe('ontbijt-beleg');
      expect(categorize('kersenjam')).toBe('ontbijt-beleg');
      expect(compoundHead('karnemelkbollen')).toBe('brood-gebak');
    });

    it('misleidende koppen ("-pasta", kruidennamen) tellen niet: het woord vóór de kop beslist', () => {
      expect(UNRELIABLE_HEADS.has('pasta')).toBe(true);
      expect(UNRELIABLE_HEADS.has('munt')).toBe(true);
      expect(categorize('speculoospasta')).toBe('ontbijt-beleg');
      expect(categorize('sesampasta')).toBe('houdbaar-conserven');
      expect(categorize('pepermunt')).toBe('snacks-snoep');
      expect(categorize('volkorenpasta')).toBe('pasta-rijst-wereld');
      expect(categorize('tandpasta')).toBe('verzorging');
      expect(categorize('citroentijm')).toBe('groente-fruit');
    });
  });

  describe('D-ET-07 ronde 3: regels achter de missers van blinde set 3', () => {
    it('bijvoeglijke woorden ("ongezouten", "zoute", "gezouten") overschaduwen het zelfstandig naamwoord niet', () => {
      for (const w of ['ongezouten', 'gezouten', 'zoute']) expect(NOISE_WORDS.has(w)).toBe(true);
      expect(categorize('boter ongezouten')).toBe('zuivel-eieren');
      expect(categorize('ongezouten roomboter')).toBe('zuivel-eieren');
      expect(categorize('zoute stengels')).toBe('snacks-snoep');
      expect(categorize('gezouten roomboter')).toBe('zuivel-eieren');
      expect(categorize('ongezouten cashewnoten')).toBe('houdbaar-conserven');
      expect(categorize('witte wijn droog')).toBe('dranken');
      expect(categorize('zoute drop')).toBe('snacks-snoep'); // staat de hele naam in het woordenboek, dan telt die
    });

    it('verpakkings- en hoeveelheidswoorden tellen niet mee ("halfvolle melk 1 liter", "luiers maat 4")', () => {
      expect(categorize('halfvolle melk 1 liter')).toBe('zuivel-eieren');
      expect(categorize('eieren 10 stuks')).toBe('zuivel-eieren');
      expect(categorize('luiers maat 4')).toBe('baby-kind');
      expect(categorize('vuilniszakken 60 liter')).toBe('huishouden');
    });

    it('"water" en "papier" als kop zijn alleen drank/huishouden na zo\'n woord; anders beslist het woord ervoor', () => {
      expect(UNRELIABLE_HEADS.has('water')).toBe(true);
      expect(UNRELIABLE_HEADS.has('papier')).toBe(true);
      expect(categorize('bleekwater')).toBe('huishouden');
      expect(categorize('bronwater')).toBe('dranken');
      expect(categorize('tonicwater')).toBe('dranken');
      expect(categorize('rijstepapier')).toBe('pasta-rijst-wereld');
      expect(categorize('toiletpapier')).toBe('huishouden');
      expect(categorize('keukenpapier')).toBe('huishouden');
    });

    it('huishoud- en schoonmaakmiddelen via hun kop (-reiniger, -middel, -doek, -verfrisser) en voorvoegsel', () => {
      expect(categorize('wc reiniger')).toBe('huishouden');
      expect(categorize('parketreiniger')).toBe('huishouden');
      expect(categorize('ontstopmiddel')).toBe('huishouden');
      expect(categorize('glasdoek')).toBe('huishouden');
      expect(categorize('textielverfrisser')).toBe('huishouden');
      expect(categorize('ontkalkingstabletten')).toBe('huishouden');
      expect(categorize('vaatwasblokjes')).toBe('huishouden');
    });

    it('vleessoorten via de kop (-lappen, -filet, -schnitzel, -burgers) en het begin (kip-)', () => {
      expect(categorize('hamlappen')).toBe('vlees-vis');
      expect(categorize('schouderlapjes')).toBe('vlees-vis');
      expect(categorize('tilapiafilet')).toBe('vlees-vis');
      expect(categorize('varkensschnitzel')).toBe('vlees-vis');
      expect(categorize('kipburgers')).toBe('vlees-vis');
      expect(categorize('kippenbouten')).toBe('vlees-vis');
    });

    it('wereldkeuken: kruiding of saus bij een wereldgerecht, en wereldproducten', () => {
      expect(categorize('nasi goreng kruiden')).toBe('pasta-rijst-wereld');
      expect(categorize('taco kruidenmix')).toBe('pasta-rijst-wereld');
      expect(categorize('nasikruiden')).toBe('pasta-rijst-wereld');
      expect(categorize('rode currypasta')).toBe('pasta-rijst-wereld');
      expect(categorize('bami goreng pakket')).toBe('pasta-rijst-wereld');
      expect(categorize('knoflooksaus')).toBe('houdbaar-conserven'); // geen wereldmarker: gewone saus
    });

    it('smaakwoord achteraan (AH/Jumbo-stijl): het product ervoor bepaalt', () => {
      expect(categorize('pastasaus basilicum')).toBe('pasta-rijst-wereld');
      expect(categorize('drop zout')).toBe('snacks-snoep');
      expect(categorize('ijs vanille')).toBe('diepvries');
      expect(categorize('hagelslag melk')).toBe('ontbijt-beleg');
      expect(categorize('afwasmiddel citroen')).toBe('huishouden');
    });

    it('conserven: groente, fruit, vlees of vis "in blik"/"in pot" is houdbaar', () => {
      expect(categorize('gepelde tomaten blik')).toBe('houdbaar-conserven');
      expect(categorize('bruine bonen in pot')).toBe('houdbaar-conserven');
      expect(categorize('kikkererwten in blik')).toBe('houdbaar-conserven');
      expect(categorize('kokosmelk blik')).toBe('pasta-rijst-wereld'); // geen groente/vlees: categorie blijft
    });

    it('losgeschreven samenstellingen en een losse misleidende kop', () => {
      expect(categorize('koffie melk')).toBe('zuivel-eieren');
      expect(categorize('zuurdesem bol')).toBe('brood-gebak');
      expect(categorize('chocolade pasta')).toBe('ontbijt-beleg');
      expect(categorize('karamelpasta')).toBe('ontbijt-beleg');
    });

    it('zachte koppen ("-bonen", "-tabletten") tellen als het woord ervoor niets bepaalt', () => {
      expect(categorize('kapucijnerbonen')).toBe('houdbaar-conserven');
      expect(categorize('espressobonen')).toBe('dranken');
    });

    it('een ander woord van achteren naar voren als het laatste onbekend is ("jonge kaas blokjes")', () => {
      expect(categorize('jonge kaas blokjes')).toBe('vleeswaren-kaas');
      expect(categorize('appel perensap')).toBe('dranken');
    });

    it('niet-boodschappen blijven overig, ook als een deel lijkt op een product', () => {
      expect(categorize('bloemen')).toBe('overig');
      expect(categorize('wenskaart')).toBe('overig');
    });
  });
});

