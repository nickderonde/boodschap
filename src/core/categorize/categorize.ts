// Automatische categorie (§8.1, F-08, F-09). Gooit nooit een fout; onbekend → 'overig'.
//
// Volgorde:
//  1. normaliseren; 2. voorkeur van dit apparaat (F-09);
//  3. exacte match (ook enkelvoud) van de hele naam, daarna van deelzinnen van achteren;
//  4. bepalend voorvoegsel: "diepvries…", "honden…", "katten…", "baby…" enz. bepaalt de categorie (diepvriesframbozen);
//  5. het laatste woord;
//  6. het hoofd van een samenstelling (volkorenbrood → brood). Een misleidende kop ("-pasta" als smeersel, een
//     kruidennaam als "-munt") telt niet; dan beslist het bepalende woord vóór de kop (speculoospasta → speculoos);
//  7. het eerste woord; 8. anders 'overig'.
import type { CategoryId } from '../types';
import { isCategoryId } from './categories';
import { DICTIONARY } from './dictionary.nl';
import { normalizeName, singularCandidates } from './normalize';

export type CategoryPrefs = ReadonlyMap<string, string>;

/**
 * Voorvoegsels die de categorie van een samenstelling bepalen, ongeacht de kop. Langste eerst.
 * (Ook als los eerste woord: "diepvries spinazie".)
 */
export const DETERMINING_PREFIXES: readonly [string, CategoryId][] = [
  ['diepvries', 'diepvries'],
  ['bevroren', 'diepvries'],
  ['diepgevroren', 'diepvries'],
  ['hondenvoer', 'huisdieren'],
  ['kattenvoer', 'huisdieren'],
  ['honden', 'huisdieren'],
  ['katten', 'huisdieren'],
  ['puppy', 'huisdieren'],
  ['kitten', 'huisdieren'],
  ['vogel', 'huisdieren'],
  ['konijnen', 'huisdieren'],
  ['knaagdier', 'huisdieren'],
  ['baby', 'baby-kind'],
  ['peuter', 'baby-kind'],
  ['vaatwas', 'huishouden'],
  ['afwas', 'huishouden'],
  ['schoonmaak', 'huishouden'],
  ['ontkalking', 'huishouden'],
  ['borrel', 'snacks-snoep'],
];

/**
 * Koppen die als hoofd van een samenstelling misleiden: "-pasta" is vaak een smeersel (speculoospasta, notenpasta) of
 * een kruidenpasta, en kruidennamen als kop ("pepermunt", "citroentijm") zeggen weinig over het product.
 */
export const UNRELIABLE_HEADS: ReadonlySet<string> = new Set([
  'pasta', 'munt', 'tijm', 'dille', 'basilicum', 'peterselie', 'rozemarijn', 'koriander', 'bieslook', 'salie', 'kruiden', 'olie',
  // "water" is alleen drank na een drankwoord (bronwater, tonicwater), niet in bleekwater/rozenwater;
  // "papier" is alleen huishouden na een huishoudwoord (toiletpapier staat zelf in het woordenboek), niet in rijstepapier.
  'water', 'papier',
  // Zachte koppen: bepaalt het woord ervoor niets, dan telt de kop zelf wel (tuinbonen → bonen, espressobonen → espresso).
  'bonen', 'tabletten',
]);
const SOFT_HEADS: ReadonlySet<string> = new Set(['bonen', 'tabletten']);

/** Verpakkingswoorden die van groente, fruit, vlees of vis een conserve maken ("tomaten blik", "bonen in pot"). */
const CONSERVE_WORDS: ReadonlySet<string> = new Set(['blik', 'blikje', 'blikken', 'pot', 'potje', 'potten', 'conserven', 'conserve']);

/**
 * Smaak- of variantwoorden achter het product (AH/Jumbo-stijl: "pastasaus basilicum", "drop zout", "ijs vanille").
 * Staat zo'n woord achteraan, dan bepaalt wat ervoor staat de categorie.
 */
const FLAVOR_WORDS: ReadonlySet<string> = new Set([
  'basilicum', 'knoflook', 'tomaat', 'tomaten', 'paprika', 'zout', 'peper', 'vanille', 'aardbei', 'aardbeien', 'framboos',
  'perzik', 'kers', 'kersen', 'citroen', 'limoen', 'sinaasappel', 'mango', 'appel', 'munt', 'kaneel', 'kruiden', 'ui', 'chili',
  'kerrie', 'honing', 'karamel', 'hazelnoot', 'kokos', 'mokka', 'banaan', 'bosvruchten', 'pistache', 'amandel', 'gember',
  'melk', 'puur', 'wit', 'pinda', 'noot', 'noten', 'rozijn',
]);

/**
 * Losse bijvoeglijke woorden en verpakkingswoorden die het product niet bepalen ("boter ongezouten", "zoute stengels",
 * "pak melk"). Ze worden genegeerd zodra de hele naam niet zelf in het woordenboek staat ("zoute drop" wel).
 */
export const NOISE_WORDS: ReadonlySet<string> = new Set([
  'ongezouten', 'gezouten', 'zoute', 'licht', 'lichtgezouten', 'ongezoet', 'ongezoete', 'gezoet', 'gezoete', 'suikervrij', 'suikervrije',
  'bio', 'biologisch', 'biologische', 'eko', 'vers', 'verse', 'light', 'zero', 'extra', 'mini', 'maxi', 'grote', 'groot', 'kleine',
  'klein', 'dunne', 'dikke', 'fijne', 'grove', 'gemalen', 'geraspt', 'gebrande', 'ongebrande', 'geroosterde', 'gepelde',
  'ongepelde', 'naturel', 'original', 'origineel', 'classic', 'klassiek', 'klassieke', 'huismerk', 'voordeelpak', 'voordeel',
  'familiepak', 'navulling', 'navul', 'pak', 'pakje', 'pakjes', 'zak', 'zakje', 'zakjes', 'fles', 'flesje', 'flessen', 'doos',
  'doosje', 'bakje', 'kg', 'g', 'gr', 'gram', 'ml', 'cl', 'l', 'liter', 'stuks', 'st', 'x',
  'droog', 'droge', 'halfdroog', 'zoet', 'halfzoet', 'pikant', 'pittig', 'mild', 'grof', 'fijn', 'krat', 'tray', 'maat',
  // lidwoorden en voorzetsels ("bonen in pot", "thee met citroen")
  'in', 'op', 'met', 'van', 'zonder', 'voor', 'en', 'de', 'het', 'een',
]);

/** Woorden die een gerecht of kruiding als wereldkeuken markeren (nasi goreng kruiden, currysaus, taco kruiden). */
export const WORLD_MARKERS: readonly string[] = [
  'nasi', 'bami', 'goreng', 'sushi', 'wok', 'curry', 'thai', 'thaise', 'mexicaans', 'mexicaanse', 'indisch', 'indische', 'indiaas',
  'indiase', 'chinees', 'chinese', 'japans', 'japanse', 'oosters', 'oosterse', 'teriyaki', 'tikka', 'masala', 'tandoori',
  'fajita', 'burrito', 'taco', 'texmex', 'sate', 'rendang', 'korma', 'ramen', 'kimchi', 'gochujang', 'harissa', 'shoarma',
  'gyros', 'kebab', 'surinaams', 'surinaamse', 'marokkaans', 'marokkaanse', 'turks', 'turkse', 'koreaans', 'koreaanse',
];
/** Koppen van kruiding en sauzen die bij een wereldmarker naar de wereldkeuken gaan. */
const SEASONING_HEADS: ReadonlySet<string> = new Set([
  'kruiden', 'kruidenmix', 'mix', 'saus', 'sauzen', 'pasta', 'paste', 'boemboe', 'bumbu', 'pakket', 'kit', 'marinade', 'poeder',
]);

function worldSeasoning(words: readonly string[]): boolean {
  const last = words[words.length - 1];
  const head = [...SEASONING_HEADS].find((h) => last === h || (last.endsWith(h) && last.length - h.length >= 3));
  if (!head) return false;
  const before = [...words.slice(0, -1), last.slice(0, last.length - head.length)].filter(Boolean);
  return before.some((w) => WORLD_MARKERS.some((m) => w === m || w.startsWith(m)));
}

/** Algemene voorvoegsels die niets over het soort product zeggen; dan beslist de kop toch (volkorenpasta → pasta). */
export const GENERIC_MODIFIERS: ReadonlySet<string> = new Set([
  'volkoren', 'vers', 'verse', 'bio', 'biologisch', 'biologische', 'glutenvrij', 'glutenvrije', 'lactosevrij', 'lactosevrije',
  'mini', 'maxi', 'groot', 'grote', 'klein', 'kleine', 'wit', 'witte', 'bruin', 'bruine', 'zwart', 'zwarte', 'rood', 'rode',
  'groen', 'groene', 'italiaanse', 'hollandse', 'huismerk', 'light', 'zero', 'extra', 'dun', 'dunne',
]);

/** Geen boodschappen in de supermarktzin: altijd 'overig' (anders valt "bloemen" onder bloem = meel). */
export const NON_GROCERY: ReadonlySet<string> = new Set([
  'bloemen', 'bos bloemen', 'boeket', 'plant', 'planten', 'kamerplant', 'cadeau', 'cadeaukaart', 'cadeaubon', 'kaart', 'kaarten',
  'wenskaart', 'wenskaarten', 'postzegel', 'postzegels', 'tijdschrift', 'krant', 'boek', 'speelgoed',
]);

/** Woorden die van vlees of kaas "beleg" maken (kipfilet plakjes → vleeswaren). */
const SLICED_WORDS: ReadonlySet<string> = new Set(['plakjes', 'plakken', 'beleg', 'broodbeleg', 'gesneden', 'snijworst']);

/** Korte (3-letter) begindelen die de categorie bepalen als verder niets past (kipdijen, kipworst). */
const SHORT_LEADS: readonly [string, CategoryId][] = [['kip', 'vlees-vis']];

/** Korte koppen die betrouwbaar het hoofd van een samenstelling zijn (roomijs, aardbeienjam, perensap). */
const SHORT_HEADS = new Set(['ijs', 'jam', 'sap']);

function lookup(term: string, dict: ReadonlyMap<string, CategoryId>): CategoryId | undefined {
  const hit = dict.get(term);
  if (hit) return hit;
  for (const s of singularCandidates(term)) {
    const h = dict.get(s);
    if (h) return h;
  }
  return undefined;
}

function lookupPhrase(phrase: string, dict: ReadonlyMap<string, CategoryId>): CategoryId | undefined {
  const direct = lookup(phrase, dict);
  if (direct) return direct;
  // Laatste woord van een meerwoordterm in enkelvoud proberen binnen de zin ("rode uien" → "rode ui").
  const words = phrase.split(' ');
  if (words.length > 1) {
    const last = words[words.length - 1];
    for (const s of singularCandidates(last)) {
      const h = dict.get([...words.slice(0, -1), s].join(' '));
      if (h) return h;
    }
  }
  return undefined;
}

/** Bepalend voorvoegsel van een woord (alleen als er na het voorvoegsel nog een woorddeel volgt, of het woord gelijk is). */
export function determiningPrefix(word: string): CategoryId | undefined {
  for (const [p, cat] of DETERMINING_PREFIXES) if (word === p || (word.startsWith(p) && word.length - p.length >= 3)) return cat;
  return undefined;
}

/**
 * Het bepalende deel vóór een (misleidende) kop: de langste woordenboeksleutel (≥ 4 tekens) aan het begin van het woord,
 * of anders de kortste woordenboeksleutel die met het hele bepalende deel begint ("sesam" → "sesamzaad").
 */
function modifierOf(word: string, dict: ReadonlyMap<string, CategoryId>, extend = true): CategoryId | undefined {
  // 1. Het woord zelf, daarna steeds kortere begindelen (≥ 4 tekens; tussenklank: rijste-, tomaten-, kersen-).
  for (let end = word.length; end >= 4; end--) {
    const pre = word.slice(0, end);
    const h = dict.get(pre);
    if (h) return h;
    for (const s of singularCandidates(pre)) {
      const hs = dict.get(s);
      if (hs) return hs;
    }
  }
  // 2. Anders de kortste woordenboeksleutel die met het hele woord begint, hooguit 4 tekens langer ("sesam" → "sesamzaad").
  if (extend && word.length >= 5) {
    let best: [string, CategoryId] | undefined;
    for (const [k, c] of dict) {
      if (k.length > word.length && k.length <= word.length + 4 && k.startsWith(word) && !k.includes(' ') && (!best || k.length < best[0].length)) best = [k, c];
    }
    if (best) return best[1];
  }
  return undefined;
}

/** Hoofd van een samenstelling: langste woordenboeksleutel (≥ 4 tekens of een veilige korte kop) achteraan het woord. */
export function compoundHead(word: string, dict: ReadonlyMap<string, CategoryId> = DICTIONARY): CategoryId | undefined {
  const forms = [word, ...singularCandidates(word)];
  for (const form of forms) {
    for (let start = 1; start <= form.length - 3; start++) {
      const tail = form.slice(start);
      if (tail.length < 4 && !SHORT_HEADS.has(tail)) continue;
      if (UNRELIABLE_HEADS.has(tail)) {
        // Misleidende kop: het bepalende woord vóór de kop beslist; anders verder zoeken.
        // Is dat woord alleen een algemeen bijvoeglijk voorvoegsel (volkoren, vers), dan beslist de kop toch.
        if (GENERIC_MODIFIERS.has(form.slice(0, start))) {
          const h0 = dict.get(tail);
          if (h0) return h0;
        }
        const mod = modifierOf(form.slice(0, start), dict);
        // Een "-pasta" van iets zoets is een smeersel (chocoladepasta, karamelpasta).
        if (mod === 'snacks-snoep' && tail === 'pasta') return 'ontbijt-beleg';
        if (mod) return mod;
        if (SOFT_HEADS.has(tail)) {
          const own = dict.get(tail);
          if (own) return own;
        }
        continue;
      }
      const h = dict.get(tail);
      if (h) return h;
    }
  }
  return undefined;
}

export function categorize(name: string, prefs?: CategoryPrefs, dict: ReadonlyMap<string, CategoryId> = DICTIONARY): CategoryId {
  try {
    const norm = normalizeName(name);
    if (!norm) return 'overig';
    // 2. Voorkeur van dit apparaat (F-09).
    const pref = prefs?.get(norm);
    if (pref && isCategoryId(pref)) return pref;
    if (NON_GROCERY.has(norm)) return 'overig';
    // 3. Exacte match van de hele naam (ook enkelvoud).
    const exact = lookupPhrase(norm, dict);
    if (exact) return exact;
    const all = norm.split(' ').filter((w) => !/^\d+([.,]\d+)?(kg|g|gr|ml|cl|l|st|x)?$/.test(w));
    if (all.length === 0) return 'overig';
    // Bijvoeglijke en verpakkingswoorden negeren: het zelfstandig naamwoord bepaalt ("boter ongezouten" → boter).
    const core = all.filter((w) => !NOISE_WORDS.has(w));
    const words = core.length > 0 ? core : all;
    if (words.length !== all.length) {
      const exactCore = lookupPhrase(words.join(' '), dict);
      if (exactCore) return exactCore;
    }
    return categorizeWords(words, dict);
  } catch {
    return 'overig';
  }
}

function categorizeWords(words: readonly string[], dict: ReadonlyMap<string, CategoryId>): CategoryId {
  {
    // Conserve: groente, fruit, vlees of vis "in blik"/"in pot" → houdbaar & conserven.
    if (words.length > 1 && words.some((w) => CONSERVE_WORDS.has(w))) {
      const rest = words.filter((w) => !CONSERVE_WORDS.has(w));
      const base = rest.length > 0 ? (lookupPhrase(rest.join(' '), dict) ?? categorizeWords(rest, dict)) : 'overig';
      if (base === 'groente-fruit' || base === 'vlees-vis') return 'houdbaar-conserven';
      if (base !== 'overig') return base;
    }
    // Losgeschreven samenstelling ("koffie melk" → koffiemelk, "zuurdesem bol" → zuurdesembol).
    if (words.length === 2) {
      const joined = words[0] + words[1];
      const j = lookup(joined, dict);
      if (j) return j;
    }
    // Smaakwoord achteraan: het product ervoor bepaalt ("pastasaus basilicum", "drop zout").
    if (words.length > 1 && FLAVOR_WORDS.has(words[words.length - 1])) {
      const rest = words.slice(0, -1);
      const base = lookupPhrase(rest.join(' '), dict) ?? categorizeWords(rest, dict);
      if (base !== 'overig') return base;
    }
    // Losse misleidende kop als laatste woord ("chocolade pasta"): lees het als samenstelling.
    if (words.length > 1 && UNRELIABLE_HEADS.has(words[words.length - 1])) {
      const joined = words[words.length - 2] + words[words.length - 1];
      const j = lookup(joined, dict) ?? compoundHead(joined, dict);
      if (j) return j;
    }
    // Kruiding of saus bij een wereldgerecht → wereldkeuken (nasi goreng kruiden, taco kruidenmix, currysaus).
    if (worldSeasoning(words)) return 'pasta-rijst-wereld';
    // Vlees of kaas "in plakjes"/"beleg" → vleeswaren & kaas.
    if (words.length > 1 && words.some((w) => SLICED_WORDS.has(w))) {
      const base = lookup(words[0], dict) ?? compoundHead(words[0], dict);
      if (base === 'vlees-vis' || base === 'vleeswaren-kaas') return 'vleeswaren-kaas';
    }
    // 4a. Een bepalend eerste woord ("diepvries spinazie", "honden snacks").
    if (words.length > 1) {
      const first = determiningPrefix(words[0]);
      if (first) return first;
    }
    // 3b. Deelzinnen van achteren ("biologische halfvolle melk" → "halfvolle melk").
    for (let i = 1; i < words.length; i++) {
      const tail = lookupPhrase(words.slice(i).join(' '), dict);
      if (tail) return tail;
    }
    const last = words[words.length - 1];
    // 4b. Bepalend voorvoegsel in het laatste woord (diepvriesframbozen, hondenkluif, babyshampoo).
    const pre = determiningPrefix(last);
    if (pre) return pre;
    // 5. Laatste woord.
    const lw = lookup(last, dict);
    if (lw) return lw;
    // 6. Hoofd van een samenstelling (volkorenbrood → brood).
    const head = compoundHead(last, dict);
    if (head) return head;
    // 7. Eerste woord als laatste redmiddel ("melk halfvol").
    const fw = lookup(words[0], dict);
    if (fw) return fw;
    // 8. Een ander woord van achteren naar voren ("jonge kaas blokjes" → kaas).
    for (let i = words.length - 2; i >= 1; i--) {
      const w = lookup(words[i], dict) ?? compoundHead(words[i], dict);
      if (w) return w;
    }
    // 9. Bepalend begin van het laatste woord (zalmmoten → zalm, kipdijen → kip).
    const lead = modifierOf(last, dict, false);
    if (lead) return lead;
    for (const [p, cat] of SHORT_LEADS) if (last.startsWith(p) && last.length - p.length >= 3) return cat;
    return 'overig';
  }
}
