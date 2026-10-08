// Invoer- en payloadvalidatie (F-01, F-02, F-04, §5.3, §5.4, S-14).

export const LIST_NAME_MAX = 40;
export const ITEM_NAME_MAX = 80;
export const NOTE_MAX = 200;
export const UNIT_MAX = 20;
export const QUANTITY_MAX = 1e6;
export const UNKNOWN_KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,15}$/;

export type ValidationError =
  | 'naam-leeg'
  | 'naam-te-lang'
  | 'notitie-te-lang'
  | 'eenheid-te-lang'
  | 'hoeveelheid-ongeldig'
  | 'categorie-ongeldig';

export class InputError extends Error {
  constructor(readonly code: ValidationError) {
    super(code);
  }
}

export function cleanListName(name: string): string {
  const t = (name ?? '').trim();
  if (t.length === 0) throw new InputError('naam-leeg');
  if (t.length > LIST_NAME_MAX) throw new InputError('naam-te-lang');
  return t;
}

export function cleanItemName(name: string): string {
  const t = (name ?? '').trim().replace(/\s+/g, ' ');
  if (t.length === 0) throw new InputError('naam-leeg');
  if (t.length > ITEM_NAME_MAX) throw new InputError('naam-te-lang');
  return t;
}

export function cleanNote(note: string | null | undefined): string | null {
  if (note === undefined || note === null) return null;
  const t = note.trim();
  if (t.length === 0) return null;
  if (t.length > NOTE_MAX) throw new InputError('notitie-te-lang');
  return t;
}

export function cleanUnit(unit: string | null | undefined): string | null {
  if (unit === undefined || unit === null) return null;
  const t = unit.trim();
  if (t.length === 0) return null;
  if (t.length > UNIT_MAX) throw new InputError('eenheid-te-lang');
  return t;
}

export function cleanQuantity(q: number | null | undefined): number | null {
  if (q === undefined || q === null) return null;
  if (typeof q !== 'number' || !Number.isFinite(q) || q < 0 || q > QUANTITY_MAX) throw new InputError('hoeveelheid-ongeldig');
  return q;
}

/** Validatie van één itemregister uit een payload. Bekende sleutel met verkeerd type → ongeldig. */
export function validItemRegValue(key: string, v: unknown): boolean {
  switch (key) {
    case 'n':
      return typeof v === 'string' && v.trim().length >= 1 && v.length <= ITEM_NAME_MAX;
    case 'q':
      return v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= QUANTITY_MAX);
    case 'u':
      return v === null || (typeof v === 'string' && v.length <= UNIT_MAX);
    case 'o':
      return v === null || (typeof v === 'string' && v.length <= NOTE_MAX);
    case 'k':
      return typeof v === 'string' && v.length <= 32;
    case 'x':
      return typeof v === 'boolean';
    case 'a':
      return typeof v === 'number' && Number.isFinite(v);
    case 'r':
      return v === true;
    default:
      return UNKNOWN_KEY_RE.test(key) && isJsonValue(v);
  }
}

export function validListRegValue(key: string, v: unknown): boolean {
  switch (key) {
    case 'n':
      return typeof v === 'string' && v.trim().length >= 1 && v.length <= LIST_NAME_MAX;
    case 'D':
      return v === true;
    default:
      return UNKNOWN_KEY_RE.test(key) && isJsonValue(v);
  }
}

export function isJsonValue(v: unknown, depth = 0): boolean {
  if (depth > 8) return false;
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return true;
  if (typeof v === 'number') return Number.isFinite(v);
  if (Array.isArray(v)) return v.every((x) => isJsonValue(x, depth + 1));
  if (typeof v === 'object') return Object.values(v as object).every((x) => isJsonValue(x, depth + 1));
  return false;
}
