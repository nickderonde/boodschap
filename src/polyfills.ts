// Moet als eerste worden geïmporteerd (index.ts). Alleen crypto.getRandomValues; TextDecoder levert Expo zelf (E-10).
import { getRandomValues } from 'expo-crypto';

type CryptoLike = { getRandomValues?: <T extends ArrayBufferView | null>(a: T) => T };
const g = globalThis as unknown as { crypto?: CryptoLike };

if (!g.crypto) g.crypto = {};
if (typeof g.crypto.getRandomValues !== 'function') {
  g.crypto.getRandomValues = <T extends ArrayBufferView | null>(a: T): T => {
    getRandomValues(a as unknown as Uint8Array);
    return a;
  };
}
