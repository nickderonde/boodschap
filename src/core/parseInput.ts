// Hoeveelheid/eenheid herkennen uit invoer (§8.4, F-12). Onzeker → hele tekst als naam.

export interface ParsedInput {
  name: string;
  quantity: number | null;
  unit: string | null;
}

const UNIT_MAP: Record<string, string> = {
  g: 'g', gr: 'g', gram: 'g',
  kg: 'kg', kilo: 'kg',
  l: 'l', liter: 'l',
  ml: 'ml', cl: 'cl',
  st: 'stuks', stuk: 'stuks', stuks: 'stuks',
  pak: 'pak', pakken: 'pak',
  fles: 'fles', flessen: 'fles',
  blik: 'blik', zak: 'zak',
};

const WITH_UNIT = /^(\d+(?:[.,]\d+)?)\s*(g|gr|gram|kg|kilo|l|liter|ml|cl|st|stuks?|pak|pakken|fles|flessen|blik|zak)\s+(.+)$/i;
const COUNT = /^(\d+(?:[.,]\d+)?)\s*[x×]?\s+(.+)$/i;
const COUNT_X = /^(\d+(?:[.,]\d+)?)\s*[x×]\s*(.+)$/i;

function num(s: string): number {
  return Number(s.replace(',', '.'));
}

export function parseInput(input: string): ParsedInput {
  const t = input.trim().replace(/\s+/g, ' ');
  const whole: ParsedInput = { name: t, quantity: null, unit: null };
  let m = WITH_UNIT.exec(t);
  if (m) {
    const q = num(m[1]);
    if (!(q > 0) || !m[3].trim()) return whole;
    return { name: m[3].trim(), quantity: q, unit: UNIT_MAP[m[2].toLowerCase()] ?? m[2].toLowerCase() };
  }
  m = COUNT.exec(t) ?? COUNT_X.exec(t);
  if (m) {
    const q = num(m[1]);
    if (!(q > 0) || !m[2].trim()) return whole;
    return { name: m[2].trim(), quantity: q, unit: null };
  }
  return whole;
}
