// Klembordhulpen (review K-1): na een geslaagde koppeling het klembord leegmaken als daar de deelcode (een geheim,
// B-02/NF-05) nog op staat.
import { LINK_PREFIX, TEXT_PREFIX } from '../core/codec/sharecode';

export interface ClipboardLike {
  getStringAsync(): Promise<string>;
  setStringAsync(text: string): Promise<boolean | void>;
}

export function containsShareCode(text: string): boolean {
  return text.includes(LINK_PREFIX) || /join#[A-Za-z0-9_-]{20,}/.test(text) || new RegExp(`${TEXT_PREFIX}[0-9A-Za-z-]{20,}`, 'i').test(text);
}

/** Wist het klembord als het een deelcode bevat. Geeft true als er gewist is. */
export async function clearShareCodeFromClipboard(cb: ClipboardLike): Promise<boolean> {
  try {
    const current = await cb.getStringAsync();
    if (!current || !containsShareCode(current)) return false;
    await cb.setStringAsync('');
    return true;
  } catch {
    return false;
  }
}
