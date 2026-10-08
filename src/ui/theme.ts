// Rustig, strak thema voor gebruik met één hand in de supermarkt. Licht en donker (UX-08), WCAG AA-contrast (UX-09).
import { Platform, useColorScheme } from 'react-native';

export interface Theme {
  dark: boolean;
  bg: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  accentText: string;
  accentSoft: string;
  danger: string;
  warn: string;
  ok: string;
  checked: string;
}

export const lightTheme: Theme = {
  dark: false,
  bg: '#F6F6F3',
  surface: '#FFFFFF',
  surfaceAlt: '#EFEFEA',
  text: '#1B1C1E',
  muted: '#5F6166',
  border: '#E1E1DB',
  accent: '#1F7A55',
  accentText: '#FFFFFF',
  accentSoft: '#E3F1EA',
  danger: '#B42318',
  warn: '#9A5B00',
  ok: '#1F7A55',
  checked: '#8A8C90',
};

export const darkTheme: Theme = {
  dark: true,
  bg: '#111214',
  surface: '#1B1C1F',
  surfaceAlt: '#25272B',
  text: '#F1F1EF',
  muted: '#A3A5AA',
  border: '#2E3035',
  accent: '#3DBB82',
  accentText: '#08130D',
  accentSoft: '#183327',
  danger: '#FF8A7A',
  warn: '#F2B84B',
  ok: '#3DBB82',
  checked: '#7B7E84',
};

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 };
export const radius = { s: 8, m: 12, l: 16, pill: 999 };
/** Minimaal tikdoel (UX-04: ≥ 44 pt); we gebruiken ruim 52 voor rijen. */
export const touch = { min: 48, row: 56 };
export const font = { small: 13, body: 17, large: 20, title: 28 };

/** Monospace per platform (review K-5): 'Courier' bestaat niet op Android. */
export function monoFontFor(os: string): string {
  return os === 'ios' ? 'Courier' : 'monospace';
}
export const monoFont = monoFontFor(Platform.OS);

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? darkTheme : lightTheme;
}
