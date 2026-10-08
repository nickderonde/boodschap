// Kerntypen van Bootschap (ARCHITECTURE §5, §10). Puur TypeScript, geen I/O.

/** Hybrid Logical Clock als 32 lowercase hex-tekens: ms(12) + teller(4) + node(16). */
export type Hlc = string;

/** Een LWW-register: [waarde, hlc]. */
export type Register = [unknown, Hlc];

/** Registers van een item of lijst: onveranderlijk (invariant §5.5, D-32). */
export type Regs = Readonly<Record<string, Register>>;

/** Alleen voor het opbouwen van een nieuw registerobject; na het opbouwen behandelen als `Regs`. */
export type MutableRegs = Record<string, Register>;

export interface ItemState {
  readonly id: string;
  readonly regs: Regs;
  readonly del: Hlc | null;
}

export interface ListState {
  readonly regs: Regs;
  readonly items: ReadonlyMap<string, ItemState>;
}

/** Een gedeeltelijke lijststaat (delta, snapshot-deel). Merge-baar met mergeList. */
export type ListDelta = ListState;

export interface Clock {
  nowMs(): number;
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface Random {
  bytes(n: number): Uint8Array;
}

export type LogData = Record<string, number | string | boolean>;

export interface Logger {
  info(code: string, data?: LogData): void;
  warn(code: string, data?: LogData): void;
  error(code: string, data?: LogData): void;
}

export const nullLogger: Logger = { info() {}, warn() {}, error() {} };

/** Categorie-ID's (§8.1). */
export type CategoryId =
  | 'groente-fruit'
  | 'brood-gebak'
  | 'vlees-vis'
  | 'vleeswaren-kaas'
  | 'zuivel-eieren'
  | 'ontbijt-beleg'
  | 'pasta-rijst-wereld'
  | 'houdbaar-conserven'
  | 'snacks-snoep'
  | 'dranken'
  | 'diepvries'
  | 'huishouden'
  | 'verzorging'
  | 'baby-kind'
  | 'huisdieren'
  | 'overig';

/** Een zichtbaar item in de ListView. */
export interface ItemView {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  category: string;
  checked: boolean;
  addedHlc: Hlc;
}

export interface Section {
  key: string; // categorie-ID of 'afgevinkt'
  title: string;
  items: ItemView[];
}

/** Gematerialiseerde weergave van een lijst (F-03, F-10, UX-10). */
export interface ListView {
  name: string;
  deleted: boolean;
  sections: Section[];
  total: number;
  checkedCount: number;
}
